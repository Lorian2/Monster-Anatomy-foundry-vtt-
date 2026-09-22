/**
 * Camada de apresentação do Part Break (doc de design, §19–§26, §39).
 * Separada da mecânica de propósito: trocar o visual nunca encosta no dano.
 * Tudo respeita as settings (anúncio, chat, efeito no token, som).
 */
import { MODULE_ID } from "./constants.js";
import { getSetting, t, tf } from "./fvtt.js";
import { burstParticles, screenShake, splitKickerLetters } from "./fx.js";
import type { MonsterPart } from "./part-model.js";

export interface BreakInfo {
  amount: number;
  attacker?: string;
}

/** Executa a apresentação completa de um part break. */
export async function presentPartBreak(
  actor: Actor,
  part: MonsterPart,
  info: BreakInfo,
): Promise<void> {
  if (getSetting("showAnnouncement")) showBreakAnnouncement(actor, part);
  if (getSetting("chatMessage")) await sendBreakChat(actor, part, info);
  if (getSetting("tokenEffect")) await applyBrokenEffect(actor, part);
  await playBreakSound();
}

/** Executa a apresentação completa de um sever (identidade própria, §24). */
export async function presentPartSever(
  actor: Actor,
  part: MonsterPart,
  info: BreakInfo,
): Promise<void> {
  if (getSetting("showAnnouncement")) showSeverAnnouncement(actor, part);
  if (getSetting("chatMessage")) await sendSeverChat(actor, part, info);
  if (getSetting("tokenEffect")) await applySeveredEffect(actor, part);
  await playBreakSound();
}

async function playBreakSound(): Promise<void> {
  const sound = String(getSetting("breakSound") ?? "").trim();
  if (!sound) return;
  try {
    await foundry.audio.AudioHelper.play({ src: sound, volume: 0.8 });
  } catch (err) {
    console.warn(`monster-anatomy | falha ao tocar som (${sound})`, err);
  }
}

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Anúncio overlay isolado (usado no broadcast para outros clientes). */
export function showBreakAnnouncement(actor: Actor, part: MonsterPart): void {
  const secs = Math.max(0.5, Math.min(10, Number(getSetting("announceDuration") ?? 2.5)));
  showAnnouncement(actor, part, secs, false);
  screenFlash(false);
  shakeTokens(actor);
  burstParticles(false);
  screenShake();
}

/** Anúncio de corte isolado (identidade SEVERED). */
export function showSeverAnnouncement(actor: Actor, part: MonsterPart): void {
  const secs = Math.max(0.5, Math.min(10, Number(getSetting("announceDuration") ?? 2.5)));
  showAnnouncement(actor, part, secs, true);
  screenFlash(true);
  shakeTokens(actor);
  burstParticles(true);
  screenShake();
}

function reducedMotion(): boolean {
  try {
    if (getSetting("reducedMotion") === true) return true;
  } catch {
    /* ignora */
  }
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Tema de anúncio (cliente) com fallback seguro. */
function announceTheme():
  | "persona"
  | "monsterhunter"
  | "jrpg"
  | "minimal"
  | "impact"
  | "arcade"
  | "carved" {
  const v = String(getSetting("announceTheme") ?? "persona");
  return v === "monsterhunter" ||
    v === "jrpg" ||
    v === "minimal" ||
    v === "impact" ||
    v === "arcade" ||
    v === "carved"
    ? v
    : "persona";
}

/** Kicker: texto custom do Mestre vence o padrão do tema. */
function kickerText(sever: boolean): string {
  const custom = String(
    getSetting(sever ? "customKickerSever" : "customKickerBreak") ?? "",
  ).trim();
  if (custom !== "") return custom;
  return t(sever ? "MONSTER_ANATOMY.Announce.Severed" : "MONSTER_ANATOMY.Announce.Break");
}
/** Anúncio central efêmero (estilo Persona/JRPG — §21 break, §24 sever). */
function showAnnouncement(
  actor: Actor,
  part: MonsterPart,
  durationSec: number,
  sever: boolean,
): void {
  document.querySelectorAll(".monster-anatomy-announce").forEach((el) => el.remove());
  const root = document.createElement("div");
  root.className =
    `monster-anatomy-announce theme-${announceTheme()}` + (sever ? " is-sever" : "");
  root.style.setProperty("--ma-duration", `${durationSec}s`);
  if (reducedMotion()) {
    root.classList.add("is-reduced");
  }
  const kicker = kickerText(sever);
  root.innerHTML =
    `<div class="ma-announce-kicker">${esc(kicker)}</div>` +
    `<div class="ma-announce-part">${esc(part.name)}</div>` +
    `<div class="ma-announce-actor">${esc(actor.name)}</div>`;
  document.body.appendChild(root);
  const kickerEl = root.querySelector<HTMLElement>(".ma-announce-kicker");
  if (kickerEl) splitKickerLetters(kickerEl);
  requestAnimationFrame(() => root.classList.add("is-showing"));
  window.setTimeout(() => {
    root.classList.remove("is-showing");
    window.setTimeout(() => root.remove(), 450);
  }, Math.max(400, Math.round(durationSec * 1000)));
}

/** Flash de tela breve (pulado com reduced motion). */
function screenFlash(sever: boolean): void {
  try {
    if (getSetting("screenFlash") !== true || reducedMotion()) return;
  } catch {
    return;
  }
  const el = document.createElement("div");
  el.className = "monster-anatomy-flash" + (sever ? " is-sever" : "");
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-showing"));
  window.setTimeout(() => el.classList.remove("is-showing"), 120);
  window.setTimeout(() => el.remove(), 450);
}

/** Tremor no token: desloca o mesh e restaura (só visual, sem tocar o documento). */
function shakeTokens(actor: Actor): void {
  try {
    if (getSetting("tokenShake") !== true || reducedMotion()) return;
  } catch {
    return;
  }
  try {
    const tokens = actor.getActiveTokens() as unknown[];
    for (const tk of tokens) {
      const mesh = (tk as { mesh?: unknown })?.mesh;
      shakeMesh(mesh);
    }
  } catch {
    /* sem canvas ou token fora de cena */
  }
}

function shakeMesh(mesh: unknown): void {
  const pos = (mesh as { position?: { x?: unknown; y?: unknown; set?: unknown } } | null)
    ?.position;
  if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") return;
  const ox = pos.x;
  const oy = pos.y;
  const strength = 9;
  const durationMs = 420;
  const start = performance.now();
  const set = typeof pos.set === "function" ? (pos.set as (x: number, y: number) => void).bind(pos) : null;
  const place = (x: number, y: number): void => {
    if (set) set(x, y);
    else {
      (pos as { x: number; y: number }).x = x;
      (pos as { x: number; y: number }).y = y;
    }
  };
  const step = (now: number): void => {
    const elapsed = now - start;
    if (elapsed >= durationMs) {
      place(ox, oy);
      return;
    }
    const decay = 1 - elapsed / durationMs;
    place(ox + Math.sin(now / 16) * strength * decay, oy);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function sendBreakChat(actor: Actor, part: MonsterPart, info: BreakInfo): Promise<void> {
  const attackerLine = info.attacker
    ? `<p class="ma-chat-attacker">${esc(
        tf("MONSTER_ANATOMY.Chat.BreakBy", {
          attacker: info.attacker,
          part: part.name,
          actor: actor.name,
        }),
      )}</p>`
    : "";
  const content =
    `<div class="monster-anatomy-chat ma-break">` +
    `<h3>💥 ${esc(t("MONSTER_ANATOMY.Announce.Break"))}</h3>` +
    `<p>${esc(
      tf("MONSTER_ANATOMY.Chat.BreakText", {
        part: part.name,
        actor: actor.name,
        amount: String(info.amount),
      }),
    )}</p>` +
    `${attackerLine}</div>`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
  });
}

async function sendSeverChat(actor: Actor, part: MonsterPart, info: BreakInfo): Promise<void> {
  const attackerLine = info.attacker
    ? `<p class="ma-chat-attacker">${esc(
        tf("MONSTER_ANATOMY.Chat.SeverBy", {
          attacker: info.attacker,
          part: part.name,
          actor: actor.name,
        }),
      )}</p>`
    : "";
  const content =
    `<div class="monster-anatomy-chat ma-break ma-sever">` +
    `<h3>🗡️ ${esc(t("MONSTER_ANATOMY.Announce.Severed"))}</h3>` +
    `<p>${esc(
      tf("MONSTER_ANATOMY.Chat.SeverText", {
        part: part.name,
        actor: actor.name,
        amount: String(info.amount),
      }),
    )}</p>` +
    `${attackerLine}</div>`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
  });
}

/** Marca visual persistente no token via ActiveEffect (§18). */
async function applyBrokenEffect(actor: Actor, part: MonsterPart): Promise<void> {
  const exists = actor.effects.some((e) => {
    try {
      return e.getFlag(MODULE_ID, "partId") === part.id;
    } catch {
      return false;
    }
  });
  if (exists) return;
  const flags: Record<string, unknown> = {};
  flags[MODULE_ID] = { partId: part.id, kind: "part-broken" };
  await ActiveEffect.create(
    {
      name: tf("MONSTER_ANATOMY.Effect.BrokenName", { part: part.name }),
      img: "icons/svg/skull.svg",
      origin: actor.uuid,
      disabled: false,
      flags,
    },
    { parent: actor },
  );
}

/** Marca visual de corte no token (mesma configuração do break). */
async function applySeveredEffect(actor: Actor, part: MonsterPart): Promise<void> {
  const exists = actor.effects.some((e) => {
    try {
      return e.getFlag(MODULE_ID, "partId") === part.id && e.getFlag(MODULE_ID, "kind") === "part-severed";
    } catch {
      return false;
    }
  });
  if (exists) return;
  const flags: Record<string, unknown> = {};
  flags[MODULE_ID] = { partId: part.id, kind: "part-severed" };
  await ActiveEffect.create(
    {
      name: tf("MONSTER_ANATOMY.Effect.SeveredName", { part: part.name }),
      img: "systems/dnd5e/icons/svg/damage/slashing.svg",
      origin: actor.uuid,
      disabled: false,
      flags,
    },
    { parent: actor },
  );
}
