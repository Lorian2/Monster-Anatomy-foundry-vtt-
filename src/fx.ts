/**
 * Efeitos visuais dirigidos por JS (0.5+): partículas de estilhaços,
 * cascata de letras no kicker e screen shake. Tudo efêmero, com limpeza
 * automática e respeito a reduced motion. CSS sozinho não alcança aqui
 * (partículas, stagger por letra e física de shake exigem JS).
 */
import { getSetting } from "./fvtt.js";

function reducedMotion(): boolean {
  try {
    if (getSetting("reducedMotion") === true) return true;
  } catch {
    /* ignora */
  }
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Divide o texto do kicker em spans animados em cascata. */
export function splitKickerLetters(kicker: HTMLElement): void {
  if (reducedMotion()) return;
  const text = kicker.textContent ?? "";
  if (text.length === 0 || text.length > 24) return;
  kicker.textContent = "";
  let i = 0;
  for (const ch of Array.from(text)) {
    if (ch === " ") {
      kicker.appendChild(document.createTextNode(" "));
      continue;
    }
    const span = document.createElement("span");
    span.className = "ma-letter";
    span.textContent = ch;
    span.style.setProperty("--i", String(i));
    kicker.appendChild(span);
    i++;
  }
}

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  circle: boolean;
}

/** Explosão de estilhaços central (break = brasa, sever = aço). */
export function burstParticles(sever: boolean): void {
  try {
    if (getSetting("particles") !== true || reducedMotion() || document.hidden) return;
  } catch {
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.className = "monster-anatomy-particles";
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2 - window.innerHeight * 0.06;
  const palette = sever
    ? ["#9adcff", "#e8f7ff", "#4da6d8", "#0e4d64", "#ffffff"]
    : ["#ff3b3b", "#ffb454", "#fff3d6", "#7a1a00", "#1a1a1a"];
  const shards: Shard[] = [];
  const count = 90;
  for (let n = 0; n < count; n++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 180 + Math.random() * 560;
    const maxLife = 0.7 + Math.random() * 0.6;
    shards.push({
      x: cx + (Math.random() - 0.5) * 60,
      y: cy + (Math.random() - 0.5) * 30,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 160,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 14,
      size: 3 + Math.random() * 8,
      life: maxLife,
      maxLife,
      color: palette[Math.floor(Math.random() * palette.length)]!,
      circle: Math.random() < 0.3,
    });
  }
  const gravity = 900;
  let last = performance.now();
  const step = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let alive = false;
    for (const s of shards) {
      s.life -= dt;
      if (s.life <= 0) continue;
      alive = true;
      s.vy += gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vr * dt;
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.life / s.maxLife);
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.fillStyle = s.color;
      if (s.circle) {
        ctx.beginPath();
        ctx.arc(0, 0, s.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-s.size / 2, -s.size / 4, s.size, s.size / 2);
      }
      ctx.restore();
    }
    if (alive) requestAnimationFrame(step);
    else canvas.remove();
  };
  requestAnimationFrame(step);
}

/** Balança o canvas (#board) e restaura — puramente visual. */
export function screenShake(): void {
  try {
    if (getSetting("screenShake") !== true || reducedMotion()) return;
  } catch {
    return;
  }
  const board = document.getElementById("board");
  if (!board) return;
  const strength = 11;
  const durationMs = 380;
  const start = performance.now();
  const step = (now: number): void => {
    const elapsed = now - start;
    if (elapsed >= durationMs) {
      board.style.transform = "";
      return;
    }
    const decay = 1 - elapsed / durationMs;
    const dx = Math.sin(now / 17) * strength * decay;
    const dy = Math.cos(now / 23) * strength * 0.7 * decay;
    board.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
