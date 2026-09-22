/**
 * Seleção de parte no momento da mira (doc de design, §7).
 *
 * Fluxo: jogador mira o token do monstro (`targetToken`) → dialog pergunta
 * ONDE o ataque atinge → seleção guardada por cliente → rolagens de ataque
 * (`dnd5e.rollAttackV2`) e dano (`dnd5e.rollDamageV2`) consomem a seleção.
 * Nada bloqueia a rolagem no meio: a escolha acontece ANTES de rolar.
 */
import { getParts } from "./anatomy-store.js";
import { MODULE_ID } from "./constants.js";
import { PART_STATE_CHOICES } from "./part-model.js";
import { getSetting, t, tf, tokenUuid } from "./fvtt.js";

export interface TargetSelection {
  tokenUuid: string;
  actorUuid: string;
  partId: string;
}

let selection: TargetSelection | null = null;

export function getSelection(): TargetSelection | null {
  return selection;
}

export function clearSelection(): void {
  selection = null;
}

/** Abre o seletor para o alvo atual (alvo único com partes). */
export async function promptTargetSelection(source?: unknown): Promise<void> {
  // Une o token do hook com o set local (qualquer ordem de disparo funciona)
  // e compara por uuid (instâncias podem diferir por referência).
  const srcUuid = tokenUuid(source);
  const uuids = new Set<string>();
  if (srcUuid) uuids.add(srcUuid);
  let liveToken: unknown;
  for (const t of game.user?.targets ?? []) {
    const u = tokenUuid(t);
    if (!u) continue;
    uuids.add(u);
    if (u === srcUuid || (!srcUuid && uuids.size === 1)) liveToken = t;
  }
  if (uuids.size !== 1) {
    clearSelection();
    return;
  }
  const only = [...uuids][0] as string;
  const tokenObj = (srcUuid === only ? source : liveToken) as
    | { actor?: Actor | null }
    | undefined;
  const actor = tokenObj?.actor;
  if (!(actor instanceof Actor)) {
    clearSelection();
    return;
  }
  const parts = getParts(actor);
  if (parts.length === 0) {
    clearSelection();
    return;
  }
  const buttons: Array<{ action: string; label: string; icon: string }> = parts.map((p) => ({
    action: p.id,
    label: `${p.name} — CA ${p.ac} — ${p.hp.value}/${p.hp.max} • ${t(PART_STATE_CHOICES[p.state])}`,
    icon: p.state === "intact" ? "fa-solid fa-crosshairs" : "fa-solid fa-burst",
  }));
  buttons.push({
    action: "__normal",
    label: t("MONSTER_ANATOMY.Target.Normal"),
    icon: "fa-solid fa-xmark",
  });
  const content =
    `<p>${tf("MONSTER_ANATOMY.Target.Prompt", { actor: actor.name })}</p>`;
  const choice: unknown = await foundry.applications.api.DialogV2.wait({
    window: { title: t("MONSTER_ANATOMY.Target.Title") },
    content,
    buttons,
    modal: true,
  });
  if (typeof choice !== "string" || choice === "__normal") {
    clearSelection();
    return;
  }
  const part = getParts(actor).find((p) => p.id === choice);
  if (!part) {
    clearSelection();
    return;
  }
  selection = {
    tokenUuid: only,
    actorUuid: actor.uuid,
    partId: part.id,
  };
}

export function registerTargeting(): void {
  Hooks.on("targetToken", (user, token, targeted) => {
    if (user.id !== game.user?.id) return;
    if (!targeted) {
      if (selection && tokenUuid(token) === selection.tokenUuid) clearSelection();
      return;
    }
    if (!getSetting("promptOnTarget")) {
      clearSelection();
      return;
    }
    void promptTargetSelection(token);
  });
}
