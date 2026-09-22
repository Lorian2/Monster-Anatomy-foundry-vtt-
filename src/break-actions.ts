/**
 * Vinculações de ruptura (doc de design, §32–§34): o que acontece
 * MECANICAMENTE quando uma parte quebra — efeitos, condições, item
 * desabilitado, atributo alterado, macro. Reparo desfaz o que é reversível.
 *
 * Tudo aqui roda no cliente com permissão (GM no fluxo socket).
 */
import { MODULE_ID } from "./constants.js";
import { t, tf } from "./fvtt.js";
import { linkageActive, linkageOf, type MonsterPart } from "./part-model.js";

const BACKUP_KEY = "attrBackup";

interface AttrBackup {
  [partId: string]: Record<string, unknown>;
}

/** Ids de itens desabilitados pelas partes quebradas/cortadas (derivado). */
export function disabledItemIds(actor: Actor): Set<string> {
  const ids = new Set<string>();
  for (const part of actorParts(actor)) {
    if (!linkageActive(part.state)) continue;
    const itemId = linkageOf(part).disableItemId.trim();
    if (itemId) ids.add(itemId);
  }
  return ids;
}

/** Parte quebrada/cortada que desabilitou o item (para mensagens). */
export function disablerPart(actor: Actor, itemId: string): MonsterPart | undefined {
  return actorParts(actor).find(
    (p) => linkageActive(p.state) && linkageOf(p).disableItemId.trim() === itemId,
  );
}

function actorParts(actor: Actor): MonsterPart[] {
  const raw = actor.getFlag(MODULE_ID, "parts");
  if (!Array.isArray(raw)) return [];
  return raw as MonsterPart[];
}

/** Aplica as ações configuradas na transição PARA quebrado. */
export async function applyBreakActions(actor: Actor, part: MonsterPart): Promise<void> {
  const link = linkageOf(part);
  if (link.effectName.trim()) await applyBreakEffect(actor, part, link.effectName.trim(), link);
  if (link.condition.trim()) await applyCondition(actor, part, link.condition.trim());
  if (link.setAttrPath.trim()) await applySetAttr(actor, part, link);
  if (link.macroUuid.trim()) await fireMacro(link.macroUuid.trim());
  // disableItemId é derivado (disabledItemIds) — nada a persistir.
}

/** Desfaz o reversível na transição PARA FORA de quebrado/cortado (reparo). */
export async function cleanupBreakLinkage(actor: Actor, part: MonsterPart): Promise<void> {
  for (const effect of [...actor.effects]) {
    try {
      if (effect.getFlag(MODULE_ID, "partId") !== part.id) continue;
      const kind = effect.getFlag(MODULE_ID, "kind");
      if (
        kind === "break-effect" ||
        kind === "break-condition" ||
        kind === "part-broken" ||
        kind === "part-severed"
      ) {
        await effect.delete();
      }
    } catch (err) {
      console.warn("monster-anatomy | falha ao remover efeito da parte", err);
    }
  }
  await restoreAttrBackup(actor, part.id);
}

async function applyBreakEffect(
  actor: Actor,
  part: MonsterPart,
  name: string,
  link: ReturnType<typeof linkageOf>,
): Promise<void> {
  const exists = actor.effects.some((e) => {
    try {
      return e.getFlag(MODULE_ID, "partId") === part.id && e.getFlag(MODULE_ID, "kind") === "break-effect";
    } catch {
      return false;
    }
  });
  if (exists) return;
  const flags: Record<string, unknown> = {};
  flags[MODULE_ID] = { partId: part.id, kind: "break-effect" };
  await ActiveEffect.create(
    {
      name,
      img: link.effectIcon.trim() || "icons/svg/skull.svg",
      origin: actor.uuid,
      disabled: false,
      duration: typeof link.effectDuration === "number" ? { rounds: link.effectDuration } : undefined,
      flags,
    },
    { parent: actor },
  );
}

async function applyCondition(actor: Actor, part: MonsterPart, statusId: string): Promise<void> {
  const exists = actor.effects.some((e) => {
    try {
      return e.getFlag(MODULE_ID, "partId") === part.id && e.getFlag(MODULE_ID, "kind") === "break-condition";
    } catch {
      return false;
    }
  });
  if (exists) return;
  const status = (CONFIG.statusEffects as Array<{ id?: string; name?: string; img?: string }>).find(
    (s) => s?.id === statusId,
  );
  const flags: Record<string, unknown> = {};
  flags[MODULE_ID] = { partId: part.id, kind: "break-condition" };
  await ActiveEffect.create(
    {
      name: tf("MONSTER_ANATOMY.Effect.ConditionName", {
        status: status?.name ?? statusId,
        part: part.name,
      }),
      img: status?.img || "icons/svg/skull.svg",
      origin: actor.uuid,
      disabled: false,
      statuses: [statusId],
      flags,
    },
    { parent: actor },
  );
}

async function applySetAttr(
  actor: Actor,
  part: MonsterPart,
  link: ReturnType<typeof linkageOf>,
): Promise<void> {
  const path = link.setAttrPath.trim();
  const backup = readBackup(actor);
  if (!(part.id in backup)) {
    backup[part.id] = { [path]: foundry.utils.getProperty(actor, path) };
    await actor.setFlag(MODULE_ID, BACKUP_KEY, backup);
  }
  await actor.update({
    [path]: parseValue(link.setAttrValue),
  } as unknown as Parameters<typeof actor.update>[0]);
}

async function restoreAttrBackup(actor: Actor, partId: string): Promise<void> {
  const backup = readBackup(actor);
  const entries = backup[partId];
  if (!entries) return;
  const updates: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(entries)) updates[path] = value;
  delete backup[partId];
  try {
    await actor.update(updates as unknown as Parameters<typeof actor.update>[0]);
  } catch (err) {
    console.warn("monster-anatomy | falha ao restaurar atributo", err);
  }
  await actor.setFlag(MODULE_ID, BACKUP_KEY, backup);
}

function readBackup(actor: Actor): AttrBackup {
  try {
    const raw = actor.getFlag(MODULE_ID, BACKUP_KEY) as unknown;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return JSON.parse(JSON.stringify(raw)) as AttrBackup;
    }
  } catch {
    /* ignora */
  }
  return {};
}

async function fireMacro(uuid: string): Promise<void> {
  try {
    const doc = (await fromUuid(uuid as Parameters<typeof fromUuid>[0])) as unknown;
    const macro = doc as { execute?: (opts?: object) => unknown };
    if (typeof macro?.execute === "function") await macro.execute();
    else console.warn(`monster-anatomy | macro não encontrada (${uuid})`);
  } catch (err) {
    console.warn(`monster-anatomy | falha ao executar macro (${uuid})`, err);
  }
}

/** "true"→true, "false"→false, numérico→número, resto→texto. */
function parseValue(raw: string): string | number | boolean {
  const s = raw.trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (s !== "" && Number.isFinite(Number(s))) return Number(s);
  return raw;
}
