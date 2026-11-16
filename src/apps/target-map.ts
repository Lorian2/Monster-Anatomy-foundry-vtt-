/**
 * Seletor de parte (doc de design, §7): lista com imagem + texto por parte
 * (nome, CA, HP, estado), quick-add e ataque normal. Fluxo em um toque;
 * dispensar = ataque normal.
 */
import type { DeepPartial } from "fvtt-types/utils";
import { addPart, canEdit, getParts, isAcSecret, isGm } from "../anatomy-store.js";
import { getSetting, t } from "../fvtt.js";
import { AnatomyTracker } from "./anatomy-tracker.js";
import { PART_STATE_CHOICES, createDefaultPart, type MonsterPart } from "../part-model.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

interface PartRow {
  id: string;
  img: string;
  name: string;
  state: string;
  stateLabel: string;
  acDisplay: string;
  hpValue: number;
  hpMax: number;
  hpPct: number;
}

function toRow(p: MonsterPart, maskAc: boolean): PartRow {
  const pct = p.hp.max > 0 ? (p.hp.value / p.hp.max) * 100 : 0;
  return {
    id: p.id,
    img: p.img ?? "",
    name: p.name,
    state: p.state,
    stateLabel: t(PART_STATE_CHOICES[p.state]),
    acDisplay: maskAc ? "??" : String(p.ac),
    hpValue: p.hp.value,
    hpMax: p.hp.max,
    hpPct: Math.max(0, Math.min(100, Math.round(pct))),
  };
}

export class TargetMapDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: "monster-anatomy-target-map",
    classes: ["monster-anatomy", "monster-anatomy-target"],
    tag: "section",
    window: {
      title: "MONSTER_ANATOMY.Target.Title",
      icon: "fa-solid fa-crosshairs",
      resizable: false,
    },
    position: { width: 340, height: "auto" as const },
    actions: {},
  };

  static override PARTS = {
    main: { template: "modules/monster-anatomy/templates/target-map.hbs" },
  };

  #resolve: ((id: string | null) => void) | null = null;

  constructor(
    options: TargetMapDialog.Configuration,
    resolve: (id: string | null) => void,
  ) {
    super(options);
    this.#resolve = resolve;
  }

  /** Abre o seletor e resolve com o id da parte (null = normal/dispensado). */
  static pick(actor: Actor): Promise<string | null> {
    return new Promise((resolve) => {
      // Só um seletor por vez: o anterior (se aberto) conta como "ataque normal".
      void foundry.applications.instances.get("monster-anatomy-target-map")?.close();
      const app = new TargetMapDialog({ actor } as TargetMapDialog.Configuration, resolve);
      void app.render(true);
    });
  }

  get actor(): Actor {
    return (this.options as unknown as TargetMapDialog.Configuration).actor;
  }

  protected override async _prepareContext(
    options: DeepPartial<TargetMapDialog.RenderOptions> & { isFirstRender: boolean },
  ): Promise<TargetMapDialog.RenderContext> {
    const base = await super._prepareContext(options);
    const actor = this.actor;
    const maskAc = isAcSecret(actor) && !isGm();
    return {
      ...base,
      actorName: actor.name,
      canAdd: canEdit(actor),
      parts: getParts(actor).map((p) => toRow(p, maskAc)),
    };
  }

  protected override async _onRender(
    context: DeepPartial<TargetMapDialog.RenderContext>,
    options: DeepPartial<TargetMapDialog.RenderOptions>,
  ): Promise<void> {
    await super._onRender(context, options);
    const pick = (id: string | null): void => {
      if (!this.#resolve) return;
      const r = this.#resolve;
      this.#resolve = null;
      r(id);
      void this.close();
    };
    this.element.querySelector("[data-parts]")?.addEventListener("click", (event) => {
      const btn = (event.target as HTMLElement).closest("[data-part-id]") as HTMLElement | null;
      const id = btn?.dataset.partId;
      if (id) pick(id);
    });
    this.element
      .querySelector("[data-normal]")
      ?.addEventListener("click", () => pick(null));
    this.element
      .querySelector("[data-tracker]")
      ?.addEventListener("click", () => void AnatomyTracker.openFor(this.actor));
    this.#wireQuickAdd();
  }

  /** Quick-add: cria parte na hora (nome + imagem opcional) e atualiza a lista. */
  #wireQuickAdd(): void {
    const nameInput = this.element.querySelector<HTMLInputElement>('[data-qa="name"]');
    const imgInput = this.element.querySelector<HTMLInputElement>('[data-qa="img"]');
    const preview = this.element.querySelector<HTMLImageElement>('[data-qa="preview"]');
    if (!nameInput || !imgInput) return;
    const syncPreview = (): void => {
      if (!preview) return;
      const src = imgInput.value.trim();
      preview.hidden = src === "";
      if (src !== "") preview.src = src;
    };
    imgInput.addEventListener("input", syncPreview);
    preview?.addEventListener("error", () => {
      if (preview) preview.hidden = true;
    });
    this.element.querySelector("[data-qa-browse]")?.addEventListener("click", () => {
      const picker = new foundry.applications.apps.FilePicker({
        type: "image",
        current: imgInput.value,
        callback: (path: string) => {
          imgInput.value = path;
          syncPreview();
        },
      });
      void picker.render(true);
    });
    this.element.querySelector("[data-qa-add]")?.addEventListener("click", () => {
      void this.#quickAdd();
    });
  }

  async #quickAdd(): Promise<void> {
    const actor = this.actor;
    if (!canEdit(actor)) return;
    const nameInput = this.element.querySelector<HTMLInputElement>('[data-qa="name"]');
    const imgInput = this.element.querySelector<HTMLInputElement>('[data-qa="img"]');
    if (!nameInput || !imgInput) return;
    const existing = getParts(actor).length;
    const name = nameInput.value.trim() || `${t("MONSTER_ANATOMY.Part.New")} ${existing + 1}`;
    const ac = Number(getSetting("defaultAc") ?? 10);
    const hp = Number(getSetting("defaultHp") ?? 20);
    const part = createDefaultPart(name, {
      ac: Number.isFinite(ac) ? ac : 10,
      hp: Number.isFinite(hp) ? hp : 20,
    });
    const img = imgInput.value.trim();
    if (img !== "") part.img = img;
    await addPart(actor, part);
    nameInput.value = "";
    imgInput.value = "";
    await this.render();
  }

  override async close(
    options?: DeepPartial<foundry.applications.api.ApplicationV2.ClosingOptions>,
  ): Promise<this> {
    if (this.#resolve) {
      const r = this.#resolve;
      this.#resolve = null;
      r(null);
    }
    return super.close(options);
  }
}

export namespace TargetMapDialog {
  export interface RenderContext
    extends foundry.applications.api.HandlebarsApplicationMixin.RenderContext,
      foundry.applications.api.ApplicationV2.RenderContext {
    actorName: string;
    canAdd: boolean;
    parts: PartRow[];
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
