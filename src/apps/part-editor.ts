/**
 * Editor de parte (doc de design, §31): criar e editar nome, CA, HP,
 * flags quebrável/cortável, estado e notas. Submit manual do <form>
 * (sem depender do form-handler automático do DocumentSheetV2).
 */
import type { DeepPartial } from "fvtt-types/utils";
import { addPart, getParts, updatePart } from "../anatomy-store.js";
import { MODULE_ID } from "../constants.js";
import { getSetting, t } from "../fvtt.js";
import {
  FALLBACK_DAMAGE_TYPES,
  PART_STATE_CHOICES,
  PHYSICAL_DAMAGE_TYPES,
  clonePart,
  createDefaultPart,
  linkageOf,
  rewardsOf,
  validatePart,
  type BreakLinkage,
  type MonsterPart,
  type PartReward,
  type PartState,
} from "../part-model.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PartEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: "monster-anatomy-part-editor",
    classes: ["monster-anatomy", "monster-anatomy-editor"],
    tag: "section",
    window: {
      title: "MONSTER_ANATOMY.Editor.Title",
      icon: "fa-solid fa-pen-to-square",
      resizable: false,
    },
    position: { width: 460, height: "auto" as const },
    actions: {
      "add-reward": PartEditor.onAddReward,
      "remove-reward": PartEditor.onRemoveReward,
    },
  };

  static override PARTS = {
    main: { template: "modules/monster-anatomy/templates/part-editor.hbs" },
  };

  static async openFor(actor: Actor, partId?: string, onSaved?: () => void): Promise<void> {
    const app = new PartEditor({ actor, partId, onSaved } as PartEditor.Configuration);
    await app.render(true);
  }

  get editorOptions(): PartEditor.Configuration {
    return this.options as unknown as PartEditor.Configuration;
  }

  get editing(): MonsterPart {
    const { actor, partId } = this.editorOptions;
    if (partId) {
      const found = getParts(actor).find((p) => p.id === partId);
      if (found) return clonePart(found);
    }
    const ac = Number(getSetting("defaultAc") ?? 10);
    const hp = Number(getSetting("defaultHp") ?? 20);
    return createDefaultPart("", {
      ac: Number.isFinite(ac) ? ac : 10,
      hp: Number.isFinite(hp) ? hp : 20,
    });
  }

  get isNew(): boolean {
    return !this.editorOptions.partId;
  }

  protected override async _prepareContext(
    options: DeepPartial<PartEditor.RenderOptions> & { isFirstRender: boolean },
  ): Promise<PartEditor.RenderContext> {
    const base = await super._prepareContext(options);
    const part = this.editing;
    const actor = this.editorOptions.actor;
    return {
      ...base,
      part,
      isNew: this.isNew,
      actorName: actor.name,
      link: linkageOf(part),
      sever: part.sever ?? { value: part.hp.max, max: part.hp.max },
      severTypes: part.severTypes ?? ["slashing"],
      rewards: rewardsOf(part).map((r) => ({ ...r })),
      items: [...actor.items].flatMap((i) =>
        typeof i.id === "string" ? [{ id: i.id, label: `${i.name} (${i.type})` }] : [],
      ),
      damageTypes: damageTypeList(),
      physicalTypes: PHYSICAL_DAMAGE_TYPES.map((key) => ({
        key,
        label: damageTypeLabel(key),
        checked: (part.severTypes ?? ["slashing"]).includes(key),
      })),
      hitzones: damageTypeList().map((d) => ({
        key: d.key,
        label: d.label,
        value: part.hitzone?.[d.key] ?? 1,
      })),
      statuses: (
        (CONFIG.statusEffects as Array<{ id?: string; name?: string }> | undefined) ?? []
      )
        .filter((s) => typeof s?.id === "string")
        .map((s) => ({ value: s.id as string, label: s.name ?? (s.id as string) })),
      states: (Object.entries(PART_STATE_CHOICES) as Array<[PartState, string]>).map(
        ([value, label]) => ({ value, label: t(label) }),
      ),
    };
  }

  protected override async _onRender(
    context: DeepPartial<PartEditor.RenderContext>,
    options: DeepPartial<PartEditor.RenderOptions>,
  ): Promise<void> {
    await super._onRender(context, options);
    this.element
      .querySelector("form.monster-anatomy-form")
      ?.addEventListener("submit", (event) => void this.#onSubmit(event));
  }

  static onAddReward(this: unknown, _event: PointerEvent, target: HTMLElement): void {
    const editor = this as PartEditor;
    const list = editor.element.querySelector("[data-rewards]");
    if (!list) return;
    const row = document.createElement("div");
    row.className = "ma-reward";
    row.setAttribute("data-reward", "");
    row.setAttribute("data-reward-id", foundry.utils.randomID());
    row.innerHTML =
      `<select name="rw_event" title="${t("MONSTER_ANATOMY.Editor.RewardEvent")}">` +
      `<option value="break">${t("MONSTER_ANATOMY.Reward.Break")}</option>` +
      `<option value="sever">${t("MONSTER_ANATOMY.Reward.Sever")}</option></select>` +
      `<select name="rw_kind" title="${t("MONSTER_ANATOMY.Editor.RewardKind")}">` +
      `<option value="table">${t("MONSTER_ANATOMY.Reward.TableKind")}</option>` +
      `<option value="item">${t("MONSTER_ANATOMY.Reward.ItemKind")}</option></select>` +
      `<input name="rw_table" type="text" placeholder="RollTable.xxx / Item.xxx" title="${t("MONSTER_ANATOMY.Editor.RewardTable")}" />` +
      `<input name="rw_draws" type="number" min="1" max="20" step="1" value="1" title="${t("MONSTER_ANATOMY.Editor.RewardDraws")}" />` +
      `<button type="button" data-action="remove-reward" title="${t("MONSTER_ANATOMY.Editor.RewardRemove")}"><i class="fa-solid fa-xmark"></i></button>`;
    list.appendChild(row);
  }

  static onRemoveReward(this: unknown, _event: PointerEvent, target: HTMLElement): void {
    target.closest("[data-reward]")?.remove();
  }

  async #onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const data = new FormData(form);
    const str = (key: string): string => String(data.get(key) ?? "").trim();
    const num = (key: string, fallback: number): number => {
      const raw = Number(data.get(key));
      return Number.isFinite(raw) ? raw : fallback;
    };

    const { actor, partId, onSaved } = this.editorOptions;
    const previous = partId ? getParts(actor).find((p) => p.id === partId) : undefined;

    const max = Math.max(1, Math.floor(num("hpMax", previous?.hp.max ?? 10)));
    const durRaw = str("effectDuration");    const link: BreakLinkage = {
      disableItemId: str("disableItemId"),
      effectName: str("effectName"),
      effectIcon: str("effectIcon"),
      effectDuration: durRaw === "" ? null : Math.max(0, Math.floor(num("effectDuration", 0))),
      condition: str("condition"),
      setAttrPath: str("setAttrPath"),
      setAttrValue: str("setAttrValue"),
      macroUuid: str("macroUuid"),
    };
    const hitzone: Record<string, number> = {};
    for (const { key: dtype } of damageTypeList()) {
      const raw = data.get(`hz_${dtype}`);
      if (raw === null || raw === undefined) continue;
      const mult = Number(raw);
      if (!Number.isFinite(mult) || mult < 0 || mult === 1 || !dtype) continue;
      hitzone[dtype] = Math.round(mult * 100) / 100;
    }
    const severTypes = data
      .getAll("severType")
      .filter((v): v is string => typeof v === "string" && v !== "");
    const severMax = Math.max(
      1,
      Math.floor(num("severMax", previous?.sever?.max ?? max)),
    );
    const prevSeverValue = previous?.sever?.value ?? severMax;
    const rewards: PartReward[] = [];
    form.querySelectorAll("[data-reward]").forEach((row) => {
      const qa = (sel: string): string =>
        (row.querySelector(sel) as HTMLInputElement | HTMLSelectElement | null)?.value?.trim() ?? "";
      const tableUuid = qa('input[name="rw_table"]');
      if (!tableUuid) return;
      const eventRaw = qa('select[name="rw_event"]');
      const kindRaw = qa('select[name="rw_kind"]');
      rewards.push({
        id: (row as HTMLElement).dataset.rewardId || foundry.utils.randomID(),
        kind: kindRaw === "item" ? "item" : "table",
        uuid: tableUuid,
        draws: Math.max(1, Math.min(20, Math.floor(Number(qa('input[name="rw_draws"]')) || 1))),
        onEvent: eventRaw === "sever" ? "sever" : "break",
      });
    });
    const candidate: MonsterPart = {
      id: previous?.id ?? "",
      name: str("name"),
      ac: Math.max(0, Math.floor(num("ac", previous?.ac ?? 10))),
      hp: {
        max,
        value: Math.max(0, Math.min(max, Math.floor(num("hpValue", previous?.hp.value ?? max)))),
      },
      breakable: data.get("breakable") === "on",
      severable: data.get("severable") === "on",
      state: (str("state") || previous?.state || "intact") as PartState,
      notes: str("notes"),
      onBreak: link,
      hitzone,
      sever: { value: Math.min(severMax, prevSeverValue), max: severMax },
      severTypes,
      rewards,
    };

    if (validatePart(candidate).length > 0) {
      ui.notifications?.error(t("MONSTER_ANATOMY.Editor.Invalid"));
      return;
    }

    if (previous) {
      const { id: _ignored, ...patch } = candidate;
      await updatePart(actor, previous.id, patch);
    } else {
      const fresh = createDefaultPart(candidate.name || t("MONSTER_ANATOMY.Part.New"), {
        ac: candidate.ac,
        hp: candidate.hp.max,
      });
      await addPart(actor, { ...fresh, ...candidate, id: fresh.id });
    }
    onSaved?.();
    await this.close();
  }
}

export namespace PartEditor {
  export interface RenderContext
    extends foundry.applications.api.HandlebarsApplicationMixin.RenderContext,
      foundry.applications.api.ApplicationV2.RenderContext {
    part: MonsterPart;
    isNew: boolean;
    actorName: string;
    link: BreakLinkage;
    sever: { value: number; max: number };
    severTypes: string[];
    rewards: PartReward[];
    items: Array<{ id: string; label: string }>;
    damageTypes: Array<{ key: string; label: string }>;
    physicalTypes: Array<{ key: string; label: string; checked: boolean }>;
    hitzones: Array<{ key: string; label: string; value: number }>;
    states: Array<{ value: PartState; label: string }>;
    statuses: Array<{ value: string; label: string }>;
  }

  export interface Configuration
    extends foundry.applications.api.HandlebarsApplicationMixin.Configuration,
      foundry.applications.api.ApplicationV2.Configuration {
    actor: Actor;
    partId?: string;
    onSaved?: () => void;
  }

  export interface RenderOptions
    extends foundry.applications.api.HandlebarsApplicationMixin.RenderOptions,
      foundry.applications.api.ApplicationV2.RenderOptions {}
}

/** Lista de tipos de dano do sistema (dnd5e) com fallback estático. */
function damageTypeList(): Array<{ key: string; label: string }> {
  const cfg = (CONFIG as unknown as { DND5E?: { damageTypes?: Record<string, string> } })
    ?.DND5E?.damageTypes;
  if (cfg && typeof cfg === "object") {
    return Object.entries(cfg).map(([key, label]) => ({ key, label: damageTypeLabel(label) }));
  }
  return [...FALLBACK_DAMAGE_TYPES].map((key) => ({ key, label: key }));
}

function damageTypeLabel(label: string): string {
  try {
    return t(label);
  } catch {
    return label;
  }
}
