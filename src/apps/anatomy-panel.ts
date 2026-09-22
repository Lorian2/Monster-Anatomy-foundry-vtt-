/**
 * Painel de Anatomia do monstro (doc de design, §30).
 * ApplicationV2 + Handlebars. Lista as partes com CA/HP/estado e
 * oferece criar, editar e remover (GM/dono). Re-renderiza sozinho
 * quando as flags do Actor mudam (hook `updateActor`).
 */
import type { DeepPartial } from "fvtt-types/utils";
import { canEdit, deletePart, getParts } from "../anatomy-store.js";
import { damagePart, healPart } from "../damage.js";
import { HOOKS } from "../constants.js";
import { callHook, t, tf } from "../fvtt.js";
import { PART_STATE_CHOICES, deriveStateFromHp, linkageActive, linkageOf, type MonsterPart } from "../part-model.js";
import { PartEditor } from "./part-editor.js";
import { AnatomyTracker } from "./anatomy-tracker.js";
import { LootSummary } from "./loot-summary.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
interface RowViewModel extends MonsterPart {
  hpPct: number;
  stateLabel: string;
  hpMismatch: boolean;
  linkedItemName: string;
  linkedDisabled: boolean;
  severPct: number;
}

function toRow(part: MonsterPart, actor: Actor): RowViewModel {
  const pct = part.hp.max > 0 ? (part.hp.value / part.hp.max) * 100 : 0;
  const linkedId = linkageOf(part).disableItemId.trim();
  const linkedItem = linkedId ? actor.items.get(linkedId) : undefined;
  const sever = part.sever ?? { value: part.hp.max, max: part.hp.max };
  const severPct = sever.max > 0 ? (sever.value / sever.max) * 100 : 0;
  return {
    ...part,
    hp: { ...part.hp },
    sever: { value: sever.value, max: sever.max },
    hpPct: Math.max(0, Math.min(100, Math.round(pct))),
    stateLabel: t(PART_STATE_CHOICES[part.state]),
    hpMismatch: deriveStateFromHp(part) !== part.state,
    linkedItemName: linkedItem?.name ?? linkedId,
    linkedDisabled: linkedId !== "" && linkageActive(part.state),
    severPct: Math.max(0, Math.min(100, Math.round(severPct))),
  };
}

/** Lê o valor do input de quantidade na linha da parte (null = inválido). */
function readRowAmount(target: HTMLElement): number | null {
  const row = target.closest(".ma-part");
  const input = row?.querySelector<HTMLInputElement>("input.ma-amount");
  const value = Math.floor(Number(input?.value));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export class AnatomyPanel extends HandlebarsApplicationMixin(ApplicationV2) {  static override DEFAULT_OPTIONS = {
    id: "monster-anatomy-panel",
    classes: ["monster-anatomy", "monster-anatomy-panel"],
    tag: "section",
    window: {
      title: "MONSTER_ANATOMY.Panel.Title",
      icon: "fa-solid fa-dragon",
      resizable: true,
    },
    position: { width: 500, height: "auto" as const },
    actions: {
      "add-part": AnatomyPanel.onAddPart,
      "edit-part": AnatomyPanel.onEditPart,
      "delete-part": AnatomyPanel.onDeletePart,
      "open-tracker": AnatomyPanel.onOpenTracker,
      "open-summary": AnatomyPanel.onOpenSummary,
      "damage-part": AnatomyPanel.onDamagePart,
      "heal-part": AnatomyPanel.onHealPart,
    },
  };

  static override PARTS = {
    main: { template: "modules/monster-anatomy/templates/anatomy-panel.hbs" },
  };

  #updateHook: number | null = null;

  /** Abre o painel para um Actor. */
  static async openFor(actor: Actor): Promise<void> {
    const app = new AnatomyPanel({ actor } as AnatomyPanel.Configuration);
    await app.render(true);
  }

  get actor(): Actor {
    return (this.options as unknown as AnatomyPanel.Configuration).actor;
  }

  protected override async _prepareContext(
    options: DeepPartial<AnatomyPanel.RenderOptions> & { isFirstRender: boolean },
  ): Promise<AnatomyPanel.RenderContext> {
    const base = await super._prepareContext(options);
    const actor = this.actor;
    const parts = getParts(actor).map((p) => toRow(p, actor));
    return {
      ...base,
      actorName: actor.name,
      actorImg: actor.img ?? "icons/svg/mystery-man.svg",
      canEdit: canEdit(actor),
      parts,
      empty: parts.length === 0,
    };
  }

  protected override async _onRender(
    context: DeepPartial<AnatomyPanel.RenderContext>,
    options: DeepPartial<AnatomyPanel.RenderOptions>,
  ): Promise<void> {
    await super._onRender(context, options);
    if (this.#updateHook === null) {
      this.#updateHook = Hooks.on("updateActor", (doc) => {
        if (doc.uuid === this.actor.uuid) void this.render();
      });
      callHook(HOOKS.PANEL_RENDER, this);
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

  // -- actions (this = instância, injetado pelo ApplicationV2) -----------------

  static async onAddPart(this: unknown, _event: PointerEvent, _target: HTMLElement): Promise<void> {
    const panel = this as AnatomyPanel;
    if (!canEdit(panel.actor)) return;
    await PartEditor.openFor(panel.actor, undefined, () => void panel.render());
  }

  static async onEditPart(this: unknown, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const panel = this as AnatomyPanel;
    if (!canEdit(panel.actor)) return;
    const partId = target.dataset.partId;
    if (!partId) return;
    await PartEditor.openFor(panel.actor, partId, () => void panel.render());
  }

  static async onOpenTracker(this: unknown, _event: PointerEvent, _target: HTMLElement): Promise<void> {
    const panel = this as AnatomyPanel;
    await AnatomyTracker.openFor(panel.actor);
  }

  static async onOpenSummary(this: unknown, _event: PointerEvent, _target: HTMLElement): Promise<void> {
    const panel = this as AnatomyPanel;
    await LootSummary.openFor(panel.actor);
  }

  static async onDamagePart(this: unknown, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const panel = this as AnatomyPanel;
    if (!canEdit(panel.actor)) return;
    const partId = target.dataset.partId;
    const amount = readRowAmount(target);
    if (!partId || amount === null) return;
    await damagePart(panel.actor, partId, amount);
  }

  static async onHealPart(this: unknown, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const panel = this as AnatomyPanel;
    if (!canEdit(panel.actor)) return;
    const partId = target.dataset.partId;
    const amount = readRowAmount(target);
    if (!partId || amount === null) return;
    await healPart(panel.actor, partId, amount);
  }

  static async onDeletePart(
    this: unknown,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    const panel = this as AnatomyPanel;
    if (!canEdit(panel.actor)) return;
    const partId = target.dataset.partId;
    const part = getParts(panel.actor).find((p) => p.id === partId);
    if (!partId || !part) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("MONSTER_ANATOMY.Delete.Title") },
      content: `<p>${tf("MONSTER_ANATOMY.Delete.Prompt", { name: part.name })}</p>`,
      modal: true,
    });
    if (!confirmed) return;
    await deletePart(panel.actor, partId);
    // O hook updateActor (disparado pelo setFlag) já re-renderiza o painel.
  }
}

export namespace AnatomyPanel {
  export interface RenderContext
    extends foundry.applications.api.HandlebarsApplicationMixin.RenderContext,
      foundry.applications.api.ApplicationV2.RenderContext {
    actorName: string;
    actorImg: string;
    canEdit: boolean;
    parts: RowViewModel[];
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
