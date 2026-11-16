/**
 * Seleção de parte no momento da mira (doc de design, §7).
 *
 * Fluxo: jogador mira o token do monstro (`targetToken`) → mapa corporal
 * pergunta ONDE o ataque atinge (região → parte) → seleção guardada por
 * cliente → rolagens de ataque (`dnd5e.rollAttackV2`) e dano
 * (`dnd5e.rollDamageV2`) consomem a seleção.
 * Nada bloqueia a rolagem no meio: a escolha acontece ANTES de rolar.
 */
import { getParts } from "./anatomy-store.js";
import { getSetting, t, tf, tokenUuid } from "./fvtt.js";
import { TargetMapDialog } from "./apps/target-map.js";
import { AnatomyTracker } from "./apps/anatomy-tracker.js";

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
  updateAimChip();
}

/** Plaquinha "Mirando: parte ✕" sempre visível enquanto há parte escolhida. */
function updateAimChip(): void {
  document.getElementById("monster-anatomy-aim")?.remove();
  if (!selection) return;
  const actor = fromUuidSync(selection.actorUuid as Parameters<typeof fromUuidSync>[0]) as unknown;
  const part = actor instanceof Actor ? getParts(actor).find((p) => p.id === selection?.partId) : undefined;
  if (!part) return;
  const aimActor = actor as Actor;
  const chip = document.createElement("div");
  chip.id = "monster-anatomy-aim";
  chip.className = "monster-anatomy ma-aim-chip";

  const main = document.createElement("button");
  main.type = "button";
  main.className = "ma-aim-main";
  main.title = t("MONSTER_ANATOMY.Target.AimClear");
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-crosshairs";
  const label = document.createElement("span");
  label.textContent = tf("MONSTER_ANATOMY.Target.Aiming", { part: part.name });
  const close = document.createElement("i");
  close.className = "fa-solid fa-xmark";
  main.append(icon, label, close);
  main.addEventListener("click", () => clearSelection());

  const tracker = document.createElement("button");
  tracker.type = "button";
  tracker.className = "ma-aim-tracker";
  tracker.title = t("MONSTER_ANATOMY.Target.OpenTracker");
  const eye = document.createElement("i");
  eye.className = "fa-solid fa-heart-pulse";
  tracker.append(eye);
  tracker.addEventListener("click", () => void AnatomyTracker.openFor(aimActor));

  chip.append(main, tracker);
  document.body.append(chip);
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
  const choice = await TargetMapDialog.pick(actor);
  if (!choice) {
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
  updateAimChip();
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
