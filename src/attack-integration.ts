/**
 * Integração com o ataque do dnd5e (doc de design, §9–§10).
 * O módulo atua como camada: usa a seleção de parte (targeting.ts),
 * avalia o acerto contra a CA DA PARTE e roteia o dano via `damagePart`.
 * A resolução normal do sistema (bônus, vantagem, crítico, dados) é preservada.
 */
import { damagePartDetailed, type DamageComponent } from "./damage.js";
import { getParts } from "./anatomy-store.js";
import { disablerPart, disabledItemIds } from "./break-actions.js";
import { emitApply, emitPresent, canApplyLocally, gmOnline } from "./sockets.js";
import { MODULE_ID } from "./constants.js";
import { getSetting, onHook, t, tf, tokenUuid } from "./fvtt.js";
import { clearSelection, getSelection } from "./targeting.js";

interface PendingHit {
  tokenUuid: string;
  actorUuid: string;
  partId: string;
  hit: boolean;
  crit: boolean;
  attacker: string;
  attackerUuid?: string;
}

let pendingHit: PendingHit | null = null;

export function registerAttackIntegration(): void {
  onHook("dnd5e.rollAttackV2", (...args: unknown[]) => void onAttackRolled(args));
  onHook("dnd5e.rollDamageV2", (...args: unknown[]) => void onDamageRolled(args));
  onHook("dnd5e.preUseActivity", (...args: unknown[]) => blockDisabledItem(args));
  // Novo alvo = novo fluxo: descarta acerto pendente de outro contexto.
  Hooks.on("targetToken", (user, _token, _targeted) => {
    if (user.id === game.user?.id) pendingHit = null;
  });
}

/**
 * Item desabilitado por parte quebrada não pode ser usado (§34).
 * Retornar false cancela o uso (semântica do `dnd5e.preUseActivity`).
 */
function blockDisabledItem(args: unknown[]): boolean | void {
  const [activity] = args as [{ item?: unknown; actor?: unknown }];
  const item = activity?.item as { id?: string; name?: string } | undefined;
  const maybeActor = activity?.actor as unknown;
  const actor =
    maybeActor instanceof Actor
      ? maybeActor
      : (item as { parent?: unknown })?.parent instanceof Actor
        ? ((item as { parent?: unknown }).parent as Actor)
        : undefined;
  if (!actor || typeof item?.id !== "string") return;
  if (!disabledItemIds(actor).has(item.id)) return;
  const part = disablerPart(actor, item.id);
  ui.notifications?.warn(
    tf("MONSTER_ANATOMY.Usage.Blocked", {
      item: typeof item.name === "string" ? item.name : item.id,
      part: part?.name ?? "",
      actor: actor.name,
    }),
  );
  return false;
}

async function onAttackRolled(args: unknown[]): Promise<void> {
  const sel = getSelection();
  if (!sel) return;
  const targets = [...(game.user?.targets ?? [])];
  const token = targets.length === 1 ? targets[0] : undefined;
  const uuid = tokenUuid(token);
  const actor = token?.actor;
  if (!token || !uuid || !actor || uuid !== sel.tokenUuid || actor.uuid !== sel.actorUuid) {
    clearSelection(); // alvo mudou no meio do fluxo: descarta
    return;
  }
  const [rolls, meta] = args as [Roll[], { subject?: unknown }];
  const roll = rolls?.[0];
  const total = Number(roll?.total ?? NaN);
  if (!Number.isFinite(total)) return;

  const d20 = firstD20(roll);
  const crit = d20 === 20;
  const fumble = d20 === 1;

  // Dados SEMPRE frescos: edição da parte entre mira e ataque vale na hora.
  const part = getParts(actor).find((p) => p.id === sel.partId);
  if (!part) {
    clearSelection();
    return;
  }
  const hit = crit || (!fumble && total >= part.ac);
  const attackerActor = subjectActor(meta?.subject);
  const attacker = attackerActor?.name ?? game.user?.name ?? "?";
  pendingHit = {
    tokenUuid: uuid,
    actorUuid: actor.uuid,
    partId: part.id,
    hit,
    crit,
    attacker,
    attackerUuid: attackerActor?.uuid,
  };

  if (getSetting("attackNotes")) {
    const key = hit ? "MONSTER_ANATOMY.Attack.Hit" : "MONSTER_ANATOMY.Attack.Miss";
    const suffix = crit && hit ? ` ${t("MONSTER_ANATOMY.Attack.CritSuffix")}` : "";
    const content =
      `<div class="monster-anatomy-chat ma-attack"><p>${tf(key, {
        attacker,
        part: part.name,
        actor: actor.name,
        total: String(total),
        ac: String(part.ac),
      })}${suffix}</p></div>`;
    const speaker = attackerActor
      ? ChatMessage.getSpeaker({ actor: attackerActor })
      : ChatMessage.getSpeaker({ alias: attacker });
    await ChatMessage.create({ speaker, content });
  }
}

async function onDamageRolled(args: unknown[]): Promise<void> {
  const hit = pendingHit;
  pendingHit = null; // consome sempre: cada dano avalia o acerto vigente
  if (!hit?.hit) return;
  const [rolls] = args as [Roll[]];
  const components: DamageComponent[] = (rolls ?? [])
    .map((r) => ({ amount: Number(r?.total) || 0, type: damageTypeOf(r) }))
    .filter((c) => c.amount > 0);
  if (components.length === 0) return;

  const token = [...(game.user?.targets ?? [])].find((tk) => tokenUuid(tk) === hit.tokenUuid);
  const actor = token?.actor;
  if (!actor || actor.uuid !== hit.actorUuid) return;
  const partName = getParts(actor).find((p) => p.id === hit.partId)?.name ?? hit.partId;

  if (canApplyLocally(actor)) {
    const result = await damagePartDetailed(actor, hit.partId, components, {
      attacker: hit.attacker,
      attackerUuid: hit.attackerUuid,
    });
    if (result.broke) emitPresent(actor.uuid, hit.partId, "break");
    if (result.severed) emitPresent(actor.uuid, hit.partId, "sever");
  } else if (gmOnline()) {
    emitApply(actor.uuid, hit.partId, components, hit.attacker, hit.attackerUuid);
    ui.notifications?.info(tf("MONSTER_ANATOMY.Target.SentToGM", { part: partName }));
  } else {
    ui.notifications?.warn(t("MONSTER_ANATOMY.Target.NoGM"));
  }
}

/** Tipo de dano da rolagem (`options.type`, confirmado no bundle do dnd5e). */
function damageTypeOf(roll: Roll): string | undefined {
  const r = roll as unknown as { options?: { type?: unknown; types?: unknown } };
  if (typeof r.options?.type === "string" && r.options.type) return r.options.type;
  const types = r.options?.types;
  if (Array.isArray(types) && typeof types[0] === "string" && types[0]) return types[0];
  return undefined;
}

/** Primeiro d20 da rolagem (para crítico/fumble). */
function firstD20(roll: Roll | undefined): number | undefined {
  const dice = (roll as unknown as { dice?: unknown })?.dice;
  if (!Array.isArray(dice)) return undefined;
  for (const d of dice) {
    if ((d as { faces?: unknown })?.faces !== 20) continue;
    const results = (d as { results?: unknown })?.results;
    if (!Array.isArray(results)) continue;
    const r = (results[0] as { result?: unknown } | undefined)?.result;
    if (typeof r === "number") return r;
  }
  return undefined;
}

function subjectActor(subject: unknown): Actor | undefined {
  const a = (subject as { actor?: unknown } | null)?.actor;
  return a instanceof Actor ? a : undefined;
}
