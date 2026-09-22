/**
 * Aplicação de dano/cura às partes (doc de design, §6, §11, §13–§15).
 * Nesta etapa o dano chega via macro/API manual ou roteado do ataque dnd5e;
 * a integração chama `damagePart`/`damagePartDetailed` internamente.
 *
 * Modelo 0.3: cada componente de dano tem valor + tipo opcional. O tipo
 * define o multiplicador (hitzone) no HP de ruptura; dano cortante
 * (tipos de `severTypes`) acumula em RAW no pool de corte em paralelo.
 */
import { getParts, updatePart } from "./anatomy-store.js";
import { HOOKS } from "./constants.js";
import { callHook, getSetting } from "./fvtt.js";
import {
  bonusOf,
  linkageActive,
  multiplierFor,
  severActive,
  type DamageModel,
  type MonsterPart,
} from "./part-model.js";
import { presentPartBreak, presentPartSever } from "./presentation.js";
import { grantRewards } from "./rewards.js";

/** Caminho do HP global no dnd5e (abstrair por sistema na etapa de integração). */
const GLOBAL_HP_PATH = "system.attributes.hp.value";

export interface DamageOptions {
  /** Nome de quem causou o dano (chat/anúncio). */
  attacker?: string;
  /** Tipo de dano do componente único (ex. "slashing"). */
  type?: string;
  /** UUID do ator atacante (entrega de itens). */
  attackerUuid?: string;
}

export interface DamageComponent {
  amount: number;
  type?: string;
}

export interface DamageResult {
  part: MonsterPart;
  /** true se esta aplicação causou a transição para quebrado. */
  broke: boolean;
  /** true se esta aplicação causou a transição para cortado. */
  severed: boolean;
  /** Dano aplicado ao HP global (0 no modelo independente). */
  globalApplied: number;
  /** Dano aplicado ao HP da parte (após hitzones). */
  applied: number;
  /** % de bônus aplicado (parte já rompida). */
  bonus: number;
  /** Bônus fixo aplicado (parte já rompida). */
  bonusFlat: number;
}

/** Aplica dano (componente único, opcionalmente tipado). */
export async function damagePart(
  actor: Actor,
  partId: string,
  amount: number,
  opts: DamageOptions = {},
): Promise<DamageResult> {
  return damagePartDetailed(actor, partId, [{ amount, type: opts.type }], opts);
}

/** Aplica dano em componentes (um por tipo, como nas rolagens do dnd5e). */
export async function damagePartDetailed(
  actor: Actor,
  partId: string,
  components: DamageComponent[],
  opts: DamageOptions = {},
): Promise<DamageResult> {
  const part = getParts(actor).find((p) => p.id === partId);
  if (!part) throw new Error(`monster-anatomy: parte não encontrada (${partId})`);

  let breakTotal = 0;
  let severTotal = 0;
  const severOn = severActive(part);
  for (const c of components) {
    const raw = Math.max(0, Math.floor(Number(c?.amount) || 0));
    if (raw <= 0) continue;
    breakTotal += raw * multiplierFor(part, c?.type);
    if (severOn && typeof c?.type === "string" && (part.severTypes ?? []).includes(c.type)) {
      severTotal += raw;
    }
  }
  breakTotal = Math.floor(breakTotal);

  const prevState = part.state;

  // Foco em parte rompida: bônus por parte (modo) ou global (herdar).
  const cfg = bonusOf(part);
  let bonus = 0;
  let bonusFlat = 0;
  if (linkageActive(prevState)) {
    if (cfg.mode === "percent") bonus = Math.max(0, Math.min(200, cfg.value));
    else if (cfg.mode === "flat") bonusFlat = Math.max(0, Math.floor(cfg.value));
    else if (cfg.mode !== "off") {
      bonus = Math.max(0, Math.min(200, Number(getSetting("brokenBonus") ?? 0)));
    }
  }
  if (bonus > 0 || bonusFlat > 0) {
    const mult = 1 + bonus / 100;
    breakTotal = Math.floor(breakTotal * mult) + bonusFlat;
    severTotal = Math.floor(severTotal * mult) + bonusFlat;
  }

  const value = Math.max(0, part.hp.value - breakTotal);
  let state = prevState;
  if (value <= 0 && part.breakable) state = "broken";
  else if (value < part.hp.max && prevState === "intact") state = "damaged";

  await updatePart(actor, partId, { hp: { ...part.hp, value }, state });
  let updated = getParts(actor).find((p) => p.id === partId)!;

  const globalApplied = await applyGlobalDamage(actor, breakTotal);
  callHook(HOOKS.PART_DAMAGE, actor, updated, breakTotal, opts.attacker ?? null);

  const broke = state === "broken" && prevState !== "broken";
  if (broke) {
    await presentPartBreak(actor, updated, { amount: breakTotal, attacker: opts.attacker });
    await grantRewards(actor, updated, "break", { attackerUuid: opts.attackerUuid });
    callHook(HOOKS.PART_BREAK, actor, updated, breakTotal, opts.attacker ?? null);
  }

  // Corte: pool independente, mesmo que já quebrada (e vice-versa).
  let severed = false;
  const severPool = updated.sever ?? { value: updated.hp.max, max: updated.hp.max };
  if (severOn && severTotal > 0 && updated.state !== "severed") {
    const severValue = Math.max(0, severPool.value - severTotal);
    await updatePart(actor, partId, {
      sever: { value: severValue, max: severPool.max },
      ...(severValue <= 0 ? { state: "severed" as const } : {}),
    });
    updated = getParts(actor).find((p) => p.id === partId)!;
    if (severValue <= 0) {
      severed = true;
      await presentPartSever(actor, updated, { amount: severTotal, attacker: opts.attacker });
      await grantRewards(actor, updated, "sever", { attackerUuid: opts.attackerUuid });
      callHook(HOOKS.PART_SEVER, actor, updated, severTotal, opts.attacker ?? null);
    }
  }
  return { part: updated, broke, severed, globalApplied, applied: breakTotal, bonus, bonusFlat };
}

/** Cura HP da parte (sem fluxo de quebra; restaura estado e corte ao curar tudo). */
export async function healPart(
  actor: Actor,
  partId: string,
  amount: number,
): Promise<MonsterPart> {
  const heal = Math.max(0, Math.floor(Number(amount) || 0));
  const part = getParts(actor).find((p) => p.id === partId);
  if (!part) throw new Error(`monster-anatomy: parte não encontrada (${partId})`);
  const value = Math.min(part.hp.max, part.hp.value + heal);
  const repaired = value >= part.hp.max;
  const state =
    repaired && (part.state === "damaged" || part.state === "broken") ? "intact" : part.state;
  const severPool = part.sever ?? { value: part.hp.max, max: part.hp.max };
  await updatePart(actor, partId, {
    hp: { ...part.hp, value },
    state,
    ...(repaired ? { sever: { value: severPool.max, max: severPool.max } } : {}),
  });
  return getParts(actor).find((p) => p.id === partId)!;
}

async function applyGlobalDamage(actor: Actor, dmg: number): Promise<number> {
  if (dmg <= 0) return 0;
  const model = getSetting("damageModel") as DamageModel;
  if (model === "independent") return 0;
  const pct =
    model === "percent"
      ? Math.max(0, Math.min(100, Number(getSetting("damagePercent") ?? 50)))
      : 100;
  const globalApplied = Math.floor((dmg * pct) / 100);
  if (globalApplied <= 0) return 0;
  const current = foundry.utils.getProperty(actor, GLOBAL_HP_PATH);
  if (typeof current !== "number") {
    console.warn(`monster-anatomy | HP global não encontrado em ${GLOBAL_HP_PATH}`);
    return 0;
  }
  const next = Math.max(0, current - globalApplied);
  // Chave pontilhada (formato suportado em runtime, fora do UpdateData tipado).
  await actor.update({
    [GLOBAL_HP_PATH]: next,
  } as unknown as Parameters<typeof actor.update>[0]);
  return globalApplied;
}
