/**
 * Regeneração de partes (boss mechanics, §61): no início do turno do monstro
 * em combate, partes com regen>0 recuperam HP (podendo reparar ao encher).
 * Só o GM aplica (uma vez por turno para a mesa toda).
 */
import { getParts } from "./anatomy-store.js";
import { healPart } from "./damage.js";
import { getSetting, tf } from "./fvtt.js";

export function registerRegen(): void {
  // combatTurnChange dispara DEPOIS do update, em todo avanço (inclusive na virada
  // de rodada); "combatTurn" dispara ANTES, com o combatente que está saindo.
  Hooks.on("combatTurnChange", (combat, previous, current) => {
    if (!game.user?.isActiveGM) return;
    const prev = previous as { round?: number | null; turn?: number | null } | null | undefined;
    const cur = current as
      | { round?: number | null; turn?: number | null; combatantId?: string | null }
      | undefined;
    // Voltar turno/rodada não regenera.
    if (prev && cur) {
      const pr = prev.round ?? 0;
      const cr = cur.round ?? 0;
      if (cr < pr || (cr === pr && (cur.turn ?? 0) < (prev.turn ?? 0))) return;
    }
    const combatant = cur?.combatantId ? combat.combatants.get(cur.combatantId) : undefined;
    const actor = combatant?.actor;
    if (!(actor instanceof Actor)) return;
    void regenActorParts(actor);
  });
}

async function regenActorParts(actor: Actor): Promise<void> {
  const candidates = getParts(actor).filter(
    (p) =>
      (p.regen ?? 0) > 0 && p.hp.value < p.hp.max && p.state !== "destroyed",
  );
  if (candidates.length === 0) return;
  const bits: string[] = [];
  for (const p of candidates) {
    try {
      const amount = Math.max(1, Math.floor(p.regen ?? 0));
      const before = p.hp.value;
      const updated = await healPart(actor, p.id, amount);
      const gained = updated.hp.value - before;
      if (gained > 0) bits.push(`${updated.name} +${gained}`);
    } catch (err) {
      console.warn("monster-anatomy | falha na regeneração", err);
    }
  }
  if (bits.length === 0) return;
  let show = false;
  try {
    show = getSetting("chatMessage") === true;
  } catch {
    return;
  }
  if (!show) return;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content:
      `<div class="monster-anatomy-chat ma-regen"><p>${tf("MONSTER_ANATOMY.Regen.Text", {
        actor: actor.name,
        bits: bits.join(", "),
      })}</p></div>`,
  });
}
