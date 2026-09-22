/**
 * Multiplayer: só quem tem permissão no ator (GM/dono) aplica dano.
 * O atacante sem permissão pede ao GM via socket; o GM aplica e
 * re-transmite a apresentação para todos verem o espetáculo juntos.
 *
 * Protocolo (namespace `module.monster-anatomy`, exige `socket: true`):
 * - { t: "apply", ... }   → só o GM atende (mecânica + chat + efeito + overlay local)
 * - { t: "present", ... } → todos EXCETO quem aplicou mostram só o overlay
 */
import { getParts } from "./anatomy-store.js";
import { MODULE_ID } from "./constants.js";
import { damagePartDetailed, type DamageComponent } from "./damage.js";
import { showBreakAnnouncement, showSeverAnnouncement, sendRoutedNote } from "./presentation.js";

interface ApplyMsg {
  t: "apply";
  actorUuid: string;
  partId: string;
  components: DamageComponent[];
  attacker?: string;
  attackerUuid?: string;
  by?: string;
}

interface PresentMsg {
  t: "present";
  actorUuid: string;
  partId: string;
  kind?: "break" | "sever";
  by?: string;
}

/** Formato solto do fio (validado por campo, sem casts encadeados). */
interface WireMsg {
  t?: unknown;
  actorUuid?: unknown;
  partId?: unknown;
  amount?: unknown;
  components?: unknown;
  attacker?: unknown;
  attackerUuid?: unknown;
  by?: unknown;
  kind?: unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Componentes vindos do fio (validados; tipos desconhecidos viram genérico). */
function sanitizeComponents(v: unknown): DamageComponent[] {
  if (!Array.isArray(v)) return [];
  const out: DamageComponent[] = [];
  for (const c of v) {
    if (!c || typeof c !== "object") continue;
    const amount = Math.max(0, Math.floor(Number((c as { amount?: unknown }).amount) || 0));
    if (amount <= 0) continue;
    const t = (c as { type?: unknown }).type;
    out.push(typeof t === "string" && t ? { amount, type: t } : { amount });
  }
  return out;
}

export function gmOnline(): boolean {
  return game.users?.some((u) => u.isGM && u.active) ?? false;
}

export function canApplyLocally(actor: Actor): boolean {
  return game.user?.isGM === true || actor.isOwner;
}

export function registerSockets(): void {
  game.socket?.on(`module.${MODULE_ID}`, (msg: unknown) => {
    void onSocketMessage(msg);
  });
}

async function onSocketMessage(msg: unknown): Promise<void> {
  if (!msg || typeof msg !== "object") return;
  const m = msg as WireMsg;
  if (m.t === "apply") {
    if (!game.user?.isGM) return;
    const actor = (await fromUuid(
      str(m.actorUuid) as Parameters<typeof fromUuid>[0],
    )) as unknown as Actor | null;
    if (!(actor instanceof Actor)) return;
    const attacker = typeof m.attacker === "string" ? m.attacker : undefined;
    const attackerUuid = typeof m.attackerUuid === "string" ? m.attackerUuid : undefined;
    const result = await damagePartDetailed(
      actor,
      str(m.partId),
      sanitizeComponents(m.components),
      { attacker, attackerUuid },
    );
    await sendRoutedNote(
      actor,
      getParts(actor).find((p) => p.id === str(m.partId))?.name ?? str(m.partId),
      result.applied,
      result.globalApplied,
      result.bonus,
      result.bonusFlat,
    );
    if (result.broke) emitPresent(str(m.actorUuid), str(m.partId), "break");
    if (result.severed) emitPresent(str(m.actorUuid), str(m.partId), "sever");
  } else if (m.t === "present") {
    if (typeof m.by === "string" && m.by === game.user?.id) return; // quem aplicou já apresentou
    const actor = (await fromUuid(
      str(m.actorUuid) as Parameters<typeof fromUuid>[0],
    )) as unknown as Actor | null;
    if (!(actor instanceof Actor)) return;
    const part = getParts(actor).find((p) => p.id === str(m.partId));
    if (!part) return;
    if (m.kind === "sever") showSeverAnnouncement(actor, part);
    else showBreakAnnouncement(actor, part);
  }
}

function emit(msg: object): void {
  try {
    game.socket?.emit(`module.${MODULE_ID}`, msg);
  } catch (err) {
    console.warn("monster-anatomy | falha no socket", err);
  }
}

export function emitApply(
  actorUuid: string,
  partId: string,
  components: DamageComponent[],
  attacker?: string,
  attackerUuid?: string,
): void {
  const msg: ApplyMsg = { t: "apply", actorUuid, partId, components, attacker, attackerUuid, by: game.user?.id };
  emit(msg);
}

export function emitPresent(
  actorUuid: string,
  partId: string,
  kind: "break" | "sever" = "break",
): void {
  const msg: PresentMsg = { t: "present", actorUuid, partId, kind, by: game.user?.id };
  emit(msg);
}
