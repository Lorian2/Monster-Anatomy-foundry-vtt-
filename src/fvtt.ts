/**
 * Helpers finos sobre os singletons do Foundry.
 * Centralizam os pontos onde os tipos são `| undefined` (fora do `init`
 * esses singletons sempre existem em runtime).
 */
import { MODULE_ID } from "./constants.js";
import type { MonsterAnatomyAPI } from "./api.js";

/** `game.i18n.localize` com fallback para a própria chave. */
export function t(key: string): string {
  return game.i18n?.localize(key) ?? key;
}

/** `game.i18n.format` com fallback para a própria chave. */
export function tf(key: string, data: Record<string, string>): string {
  return game.i18n?.format(key, data) ?? key;
}

/** Lê uma setting do módulo (tipada via `SettingConfig` em fvtt-config.d.ts). */
export function getSetting<K extends foundry.helpers.ClientSettings.KeyFor<typeof MODULE_ID>>(
  key: K,
) {
  return game.settings!.get(MODULE_ID, key);
}

/** UUID de um token (placeable ou documento; tipos do core omitem no placeable). */
export function tokenUuid(token: unknown): string | undefined {
  if (!token || typeof token !== "object") return undefined;
  const t = token as { uuid?: unknown; document?: unknown };
  if (typeof t.uuid === "string" && t.uuid) return t.uuid;
  if (t.document && typeof t.document === "object") {
    const du = (t.document as { uuid?: unknown }).uuid;
    if (typeof du === "string" && du) return du;
  }
  return undefined;
}

/** API pública registrada em `game.modules.get("monster-anatomy").api`. */
export function getModuleApi(): MonsterAnatomyAPI | undefined {
  return game.modules?.get(MODULE_ID)?.api;
}

/**
 * Dispara um hook custom do módulo.
 * (Os tipos do core só conhecem hooks nativos; o cast pontual evita poluir
 * cada chamada. Nome e payload continuam centralizados em `HOOKS`.)
 * IMPORTANTE: preservar o receptor `Hooks` na chamada — no v14 os métodos
 * usam campos privados (`this.#...`) e chamar destacado quebra com
 * "Cannot read properties of undefined (reading '#id')".
 */
export function callHook(hook: string, ...args: unknown[]): void {
  const callAll = Hooks.callAll as unknown as (
    this: typeof Hooks,
    ...callArgs: unknown[]
  ) => true;
  callAll.call(Hooks, hook, ...args);
}

/**
 * Assina um hook NÃO tipado (custom ou de outro pacote, ex. `dnd5e.rollAttackV2`).
 * Hooks do core continuam via `Hooks.on` direto (tipado).
 * (Mesma regra do receptor acima.)
 */
export function onHook(hook: string, fn: (...args: unknown[]) => unknown): number {
  const on = Hooks.on as unknown as (
    this: typeof Hooks,
    h: string,
    f: (...args: unknown[]) => unknown,
  ) => number;
  return on.call(Hooks, hook, fn);
}

/** Cancela assinatura feita via `onHook`. */
export function offHook(hook: string, id: number): void {
  const off = Hooks.off as unknown as (
    this: typeof Hooks,
    h: string,
    f: number,
  ) => void;
  off.call(Hooks, hook, id);
}
