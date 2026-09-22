/**
 * API pública do módulo (convenção oficial: `game.modules.get(id).api`).
 * Macros e outros módulos devem consumir DAQUI — nunca importar arquivos internos.
 */
import { MODULE_ID } from "./constants.js";
import {
  applyTemplate as applyTpl,
  canEdit,
  getParts,
  getTemplates as getTpls,
} from "./anatomy-store.js";
import {
  damagePart,
  damagePartDetailed,
  healPart,
  type DamageComponent,
  type DamageOptions,
  type DamageResult,
} from "./damage.js";
import type { MonsterPart } from "./part-model.js";
import {
  clearSelection as clearSel,
  getSelection as getSel,
  promptTargetSelection as promptSel,
  type TargetSelection,
} from "./targeting.js";
import type { AnatomyTemplate } from "./part-model.js";
import { AnatomyPanel } from "./apps/anatomy-panel.js";
import { AnatomyTracker } from "./apps/anatomy-tracker.js";
import { LootSummary } from "./apps/loot-summary.js";
import { offHook, onHook } from "./fvtt.js";

export interface MonsterAnatomyAPI {
  readonly version: string;
  openAnatomy(actor: Actor): Promise<void>;
  getParts(actor: Actor): MonsterPart[];
  canEdit(actor: Actor): boolean;
  damagePart(actor: Actor, partId: string, amount: number, opts?: DamageOptions): Promise<DamageResult>;
  healPart(actor: Actor, partId: string, amount: number): Promise<MonsterPart>;
  /** Dano em componentes tipados (um por tipo, como nas rolagens). */
  damagePartDetailed(
    actor: Actor,
    partId: string,
    components: DamageComponent[],
    opts?: DamageOptions,
  ): Promise<DamageResult>;
  /** Seleção de parte vigente (mira) ou null. */
  getSelection(): TargetSelection | null;
  /** Limpa a seleção de parte vigente. */
  clearSelection(): void;
  /** Abre o seletor de parte para o alvo atual. */
  promptTargetSelection(token?: unknown): Promise<void>;
  /** Abre o tracker de combate (HP das partes) para um ator. */
  openTracker(actor: Actor): Promise<void>;
  /** Abre o resumo pós-batalha (partes + recompensas) para um ator. */
  openSummary(actor: Actor): Promise<void>;
  /**
   * Assina eventos do módulo (doc de design, §35): "partBreak", "partSever",
   * "partDamage", "partsChanged", "panelRender". Retorna função p/ cancelar.
   */
  on(event: string, fn: (...args: unknown[]) => void): () => void;
  /** Modelos de anatomia (presets + customs). */
  getTemplates(): AnatomyTemplate[];
  /** Aplica modelo ao ator (anexa partes). Retorna nº de partes criadas. */
  applyTemplate(actor: Actor, templateId: string): Promise<number>;
}

export function buildApi(): MonsterAnatomyAPI {
  const version = game.modules?.get(MODULE_ID)?.version ?? "0.0.0";
  return {
    version,
    async openAnatomy(actor: Actor): Promise<void> {
      await AnatomyPanel.openFor(actor);
    },
    getParts(actor: Actor): MonsterPart[] {
      return getParts(actor);
    },
    canEdit(actor: Actor): boolean {
      return canEdit(actor);
    },
    damagePart(actor: Actor, partId: string, amount: number, opts?: DamageOptions): Promise<DamageResult> {
      return damagePart(actor, partId, amount, opts);
    },
    healPart(actor: Actor, partId: string, amount: number): Promise<MonsterPart> {
      return healPart(actor, partId, amount);
    },
    damagePartDetailed(
      actor: Actor,
      partId: string,
      components: DamageComponent[],
      opts?: DamageOptions,
    ): Promise<DamageResult> {
      return damagePartDetailed(actor, partId, components, opts);
    },
    getSelection(): TargetSelection | null {
      return getSel();
    },
    clearSelection(): void {
      clearSel();
    },
    promptTargetSelection(token?: unknown): Promise<void> {
      return promptSel(token);
    },
    openTracker(actor: Actor): Promise<void> {
      return AnatomyTracker.openFor(actor);
    },
    openSummary(actor: Actor): Promise<void> {
      return LootSummary.openFor(actor);
    },
    on(event: string, fn: (...args: unknown[]) => void): () => void {
      const name = event.startsWith("monsterAnatomy.") ? event : `monsterAnatomy.${event}`;
      const id = onHook(name, fn);
      return () => offHook(name, id);
    },
    getTemplates(): AnatomyTemplate[] {
      return getTpls();
    },
    applyTemplate(actor: Actor, templateId: string): Promise<number> {
      return applyTpl(actor, templateId);
    },
  };
}

/** Atalho para macros: `MonsterAnatomy.openAnatomy(actor)` — ver README. */
export function exposeGlobal(api: MonsterAnatomyAPI): void {
  (globalThis as unknown as Record<string, unknown>).MonsterAnatomy = api;
}
