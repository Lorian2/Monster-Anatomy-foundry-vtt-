/**
 * Tracker de combate (doc de design, §40): janela compacta opcional com o
 * progresso das partes (HP + estado), atualizada sozinha a cada mudança.
 * Somente leitura — edição continua no AnatomyPanel.
 */
import type { DeepPartial } from "fvtt-types/utils";
import { getParts } from "../anatomy-store.js";
import { PART_STATE_CHOICES, type MonsterPart } from "../part-model.js";
import { t } from "../fvtt.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface TrackerRow extends MonsterPart {
  hpPct: number;
  stateLabel: string;
}

export class AnatomyTracker extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: "monster-anatomy-tracker",
    classes: ["monster-anatomy", "monster-anatomy-tracker"],
    tag: "section",
    window: {
      title: "MONSTER_ANATOMY.Tracker.Title",
      icon: "fa-solid fa-heart-pulse",
      resizable: true,
    },
    position: { width: 320, height: "auto" as const },
    actions: {},
  };

  static override PARTS = {
    main: { template: "modules/monster-anatomy/templates/anatomy-tracker.hbs" },
  };

  #updateHook: number | null = null;

  static async openFor(actor: Actor): Promise<void> {
    const app = new AnatomyTracker({ actor } as AnatomyTracker.Configuration);
    await app.render(true);
  }

  get actor(): Actor {
    return (this.options as unknown as AnatomyTracker.Configuration).actor;
  }

  protected override async _prepareContext(
    options: DeepPartial<AnatomyTracker.RenderOptions> & { isFirstRender: boolean },
  ): Promise<AnatomyTracker.RenderContext> {
    const base = await super._prepareContext(options);
    const parts: TrackerRow[] = getParts(this.actor).map((p) => {
      const pct = p.hp.max > 0 ? (p.hp.value / p.hp.max) * 100 : 0;
      return {
        ...p,
        hp: { ...p.hp },
        hpPct: Math.max(0, Math.min(100, Math.round(pct))),
        stateLabel: t(PART_STATE_CHOICES[p.state]),
      };
    });
    return {
      ...base,
      actorName: this.actor.name,
      parts,
      empty: parts.length === 0,
    };
  }

  protected override async _onRender(
    context: DeepPartial<AnatomyTracker.RenderContext>,
    options: DeepPartial<AnatomyTracker.RenderOptions>,
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
}

export namespace AnatomyTracker {
  export interface RenderContext
    extends foundry.applications.api.HandlebarsApplicationMixin.RenderContext,
      foundry.applications.api.ApplicationV2.RenderContext {
    actorName: string;
    parts: TrackerRow[];
    empty: boolean;
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
