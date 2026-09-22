/**
 * Painel de Anatomia do monstro (doc de design, §30).
 * ApplicationV2 + Handlebars. Lista as partes com CA/HP/estado e
 * oferece criar, editar e remover (GM/dono). Re-renderiza sozinho
 * quando as flags do Actor mudam (hook `updateActor`).
 */
import type { DeepPartial } from "fvtt-types/utils";
import {
  applyTemplate,
  canEdit,
  deletePart,
  deleteTemplate,
  getMapLayout,
  getParts,
  getTemplates,
  isAcSecret,
  isGm,
  saveTemplate,
  setHideAc,
  setMapLayout,
  templateDisplayName,
} from "../anatomy-store.js";
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
  acDisplay: string;
}

function toRow(part: MonsterPart, actor: Actor, maskAc: boolean): RowViewModel {
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
    acDisplay: maskAc ? "??" : String(part.ac),
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
      "apply-template": AnatomyPanel.onApplyTemplate,
      "save-template": AnatomyPanel.onSaveTemplate,
      "delete-template": AnatomyPanel.onDeleteTemplate,
      "toggle-hide-ac": AnatomyPanel.onToggleHideAc,
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
    const gm = isGm();
    const secret = isAcSecret(actor);
    const maskAc = secret && !gm;
    const parts = getParts(actor).map((p) => toRow(p, actor, maskAc));
    return {
      ...base,
      actorName: actor.name,
      actorImg: actor.img ?? "icons/svg/mystery-man.svg",
      canEdit: canEdit(actor),
      isGM: gm,
      hideAc: secret,
      mapLayout: getMapLayout(actor),
      templates: getTemplates().map((v) => ({ id: v.id, name: templateDisplayName(v) })),
      parts,
      empty: parts.length === 0,
    };
  }

  protected override async _onRender(
    context: DeepPartial<AnatomyPanel.RenderContext>,
    options: DeepPartial<AnatomyPanel.RenderOptions>,
  ): Promise<void> {
    await super._onRender(context, options);
    const mapSelect = this.element.querySelector<HTMLSelectElement>("select.ma-map-select");
    if (mapSelect) {
      mapSelect.onchange = () => {
        if (!canEdit(this.actor)) return;
        void setMapLayout(this.actor, mapSelect.value);
      };
    }
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

  static async onApplyTemplate(this: unknown, _event: PointerEvent, _target: HTMLElement): Promise<void> {
    const panel = this as AnatomyPanel;
    if (!canEdit(panel.actor)) return;
    const select = panel.element.querySelector<HTMLSelectElement>("select.ma-template-select");
    const id = select?.value;
    if (!id) return;
    try {
      const n = await applyTemplate(panel.actor, id);
      ui.notifications?.info(tf("MONSTER_ANATOMY.Template.Applied", { count: String(n) }));
    } catch (err) {
      console.warn("monster-anatomy | falha ao aplicar modelo", err);
    }
  }

  static async onSaveTemplate(this: unknown, _event: PointerEvent, _target: HTMLElement): Promise<void> {
    const panel = this as AnatomyPanel;
    if (!isGm()) return;
    const parts = getParts(panel.actor);
    if (parts.length === 0) {
      ui.notifications?.warn(t("MONSTER_ANATOMY.Template.Empty"));
      return;
    }
    const name = await promptTemplateName(panel.actor.name);
    if (!name) return;
    await saveTemplate(name, parts, getMapLayout(panel.actor));
    ui.notifications?.info(tf("MONSTER_ANATOMY.Template.Saved", { name }));
    void panel.render();
  }

  static async onDeleteTemplate(this: unknown, _event: PointerEvent, _target: HTMLElement): Promise<void> {
    const panel = this as AnatomyPanel;
    if (!isGm()) return;
    const select = panel.element.querySelector<HTMLSelectElement>("select.ma-template-select");
    const id = select?.value;
    if (!id) return;
    const ok = await deleteTemplate(id);
    if (!ok) {
      ui.notifications?.warn(t("MONSTER_ANATOMY.Template.Protected"));
      return;
    }
    ui.notifications?.info(t("MONSTER_ANATOMY.Template.Deleted"));
    void panel.render();
  }

  static async onToggleHideAc(this: unknown, _event: PointerEvent, _target: HTMLElement): Promise<void> {
    const panel = this as AnatomyPanel;
    if (!isGm()) return;
    await setHideAc(panel.actor, !isAcSecret(panel.actor));
    // setFlag dispara updateActor → re-render automático.
  }
}

/** Prompt de nome via DialogV2.wait com callback lendo o input. */
async function promptTemplateName(fallback: string): Promise<string | null> {
  const result: unknown = await foundry.applications.api.DialogV2.wait({
    window: { title: t("MONSTER_ANATOMY.Template.NameTitle") },
    content:
      `<div class="form-group"><label>${t("MONSTER_ANATOMY.Template.NamePrompt")}</label>` +
      `<input name="templateName" type="text" value="${fallback}" maxlength="80" /></div>`,
    buttons: [
      {
        action: "save",
        label: t("MONSTER_ANATOMY.Editor.Save"),
        default: true,
        callback: (_event, button) => {
          const input = button.form?.querySelector<HTMLInputElement>(
            'input[name="templateName"]',
          );
          return input?.value?.trim() ?? "";
        },
      },
    ],
    modal: true,
  });
  if (typeof result !== "string" || result.trim() === "") return null;
  return result.trim();
}

export namespace AnatomyPanel {
  export interface RenderContext
    extends foundry.applications.api.HandlebarsApplicationMixin.RenderContext,
      foundry.applications.api.ApplicationV2.RenderContext {
    actorName: string;
    actorImg: string;
    canEdit: boolean;
    isGM: boolean;
    hideAc: boolean;
    mapLayout: string;
    templates: Array<{ id: string; name: string }>;
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
