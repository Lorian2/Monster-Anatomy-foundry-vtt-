/**
 * Resumo pós-batalha (doc de design, §38): estado das partes + recompensas
 * acumuladas no pool, com limpeza pelo Mestre para distribuir e recomeçar.
 */
import type { DeepPartial } from "fvtt-types/utils";
import { canEdit, getParts } from "../anatomy-store.js";
import { PART_STATE_CHOICES, type MonsterPart } from "../part-model.js";
import { clearLoot, getLoot, type LootEntry } from "../rewards.js";
import { t } from "../fvtt.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface SummaryPart {
  name: string;
  stateLabel: string;
  hp: string;
}

interface SummaryLoot extends LootEntry {
  eventLabel: string;
  itemsText: string;
}

export class LootSummary extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: "monster-anatomy-summary",
    classes: ["monster-anatomy", "monster-anatomy-summary"],
    tag: "section",
    window: {
      title: "MONSTER_ANATOMY.Summary.Title",
      icon: "fa-solid fa-scroll",
      resizable: true,
    },
    position: { width: 460, height: "auto" as const },
    actions: {
      "clear-loot": LootSummary.onClearLoot,
    },
  };

  static override PARTS = {
    main: { template: "modules/monster-anatomy/templates/loot-summary.hbs" },
  };

  #updateHook: number | null = null;

  static async openFor(actor: Actor): Promise<void> {
    const app = new LootSummary({ actor } as LootSummary.Configuration);
    await app.render(true);
  }

  get actor(): Actor {
    return (this.options as unknown as LootSummary.Configuration).actor;
  }

  protected override async _prepareContext(
    options: DeepPartial<LootSummary.RenderOptions> & { isFirstRender: boolean },
  ): Promise<LootSummary.RenderContext> {
    const base = await super._prepareContext(options);
    const actor = this.actor;
    const parts: SummaryPart[] = getParts(actor).map((p: MonsterPart) => ({
      name: p.name,
      stateLabel: t(PART_STATE_CHOICES[p.state]),
      hp: `${p.hp.value} / ${p.hp.max}`,
    }));
    const loot: SummaryLoot[] = getLoot(actor).map((e) => ({
      ...e,
      eventLabel: t(
        e.event === "sever" ? "MONSTER_ANATOMY.Reward.Sever" : "MONSTER_ANATOMY.Reward.Break",
      ),
      itemsText: e.items.join(", "),
    }));
    return {
      ...base,
      actorName: actor.name,
      parts,
      loot,
      emptyParts: parts.length === 0,
      emptyLoot: loot.length === 0,
      canClear: canEdit(actor),
    };
  }

  protected override async _onRender(
    context: DeepPartial<LootSummary.RenderContext>,
    options: DeepPartial<LootSummary.RenderOptions>,
  ): Promise<void> {
    await super._onRender(context, options);
    if (this.#updateHook === null) {
      this.#updateHook = Hooks.on("updateActor", (doc) => {
        if (doc.uuid === this.actor.uuid) void this.render();
      });
    }
  }

  override async close(
    options?: DeepPartial<foundry.applications.api.ApplicationV2.ClosingOptions>,
  ): Promise<this> {
    if (this.#updateHook !== null) {
      Hooks.off("updateActor", this.#updateHook);
      this.#updateHook = null;
    }
    return super.close(options);
  }

  static async onClearLoot(this: unknown, _event: PointerEvent, _target: HTMLElement): Promise<void> {
    const summary = this as LootSummary;
    if (!canEdit(summary.actor)) return;
    await clearLoot(summary.actor);
  }
}

export namespace LootSummary {
  export interface RenderContext
    extends foundry.applications.api.HandlebarsApplicationMixin.RenderContext,
      foundry.applications.api.ApplicationV2.RenderContext {
    actorName: string;
    parts: SummaryPart[];
    loot: SummaryLoot[];
    emptyParts: boolean;
    emptyLoot: boolean;
    canClear: boolean;
  }

  export interface Configuration
    extends foundry.applications.api.HandlebarsApplicationMixin.Configuration,
      foundry.applications.api.ApplicationV2.Configuration {
    actor: Actor;
  }

  export interface RenderOptions
    extends foundry.applications.api.HandlebarsApplicationMixin.RenderOptions,
      foundry.applications.api.ApplicationV2.RenderOptions {}
}
