/**
 * Mira visual (doc de design, §8): diagrama corporal clicável por região,
 * com fallback em lista para partes fora do mapa. Fluxo em dois toques
 * (região → parte), sempre previsível; dispensar = ataque normal.
 */
import type { DeepPartial } from "fvtt-types/utils";
import { getMapLayout, getParts, isAcSecret, isGm } from "../anatomy-store.js";
import { PART_STATE_CHOICES, type MonsterPart } from "../part-model.js";
import { t } from "../fvtt.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export type ZoneKey = "head" | "torso" | "left" | "right" | "tail";

function norm(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function has(source: string, words: string[]): boolean {
  return words.some((w) => source.includes(w));
}

export interface ZoneMapping {
  zones: Record<ZoneKey, MonsterPart[]>;
  unmapped: MonsterPart[];
}

/** Mapeia partes às regiões por palavras-chave (pt/en). Sem lado = ambos. */
export function mapPartsToZones(parts: MonsterPart[]): ZoneMapping {
  const zones: Record<ZoneKey, MonsterPart[]> = { head: [], torso: [], left: [], right: [], tail: [] };
  const unmapped: MonsterPart[] = [];
  for (const p of parts) {
    const n = norm(p.name);
    const hit = new Set<ZoneKey>();
    if (has(n, ["cauda", "tail", "rabo"])) hit.add("tail");
    if (
      has(n, [
        "cabeca", "head", "cranio", "skull", "olho", "eye", "focinho",
        "boca", "mouth", "maw", "pescoco", "neck", "dente", "tooth", "fang", "presa",
      ])
    ) {
      hit.add("head");
    }
    const left = has(n, ["esquerda", "left", "esq"]);
    const right = has(n, ["direita", "right", "dir"]);
    if (left) hit.add("left");
    if (right) hit.add("right");
    if (has(n, ["corpo", "torso", "body", "peito", "chest", "barriga", "belly", "tronco", "trunk", "costa", "back", "nucleo", "core"])) {
      hit.add("torso");
    }
    if (
      has(n, ["asa", "wing", "garra", "claw", "pata", "paw", "perna", "leg", "braco", "arm", "chifre", "horn"])
    ) {
      if (!left && !right) {
        hit.add("left");
        hit.add("right");
      }
    }
    if (hit.size === 0) unmapped.push(p);
    else for (const z of hit) zones[z].push(p);
  }
  return { zones, unmapped };
}

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Severidade da zona: 0 íntegra, 1 danificada, 2 rompida/cortada/destruída. */
function zoneSeverity(parts: MonsterPart[]): 0 | 1 | 2 {
  let level: 0 | 1 | 2 = 0;
  for (const p of parts) {
    if (p.state === "broken" || p.state === "severed" || p.state === "destroyed") return 2;
    if (p.state === "damaged") level = 1;
  }
  return level;
}

function zoneClass(parts: MonsterPart[]): string {
  const s = zoneSeverity(parts);
  return s === 2 ? "is-broken" : s === 1 ? "is-damaged" : "";
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
    position: { width: 300, height: "auto" as const },
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

  /** Abre o mapa e resolve com o id da parte (null = normal/dispensado). */
  static pick(actor: Actor): Promise<string | null> {
    return new Promise((resolve) => {
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
    const parts = getParts(actor);
    const { zones, unmapped } = mapPartsToZones(parts);
    const zoneLabelMap: Record<ZoneKey, string> = {
      head: t("MONSTER_ANATOMY.Target.ZoneHead"),
      torso: t("MONSTER_ANATOMY.Target.ZoneTorso"),
      left: t("MONSTER_ANATOMY.Target.ZoneLeft"),
      right: t("MONSTER_ANATOMY.Target.ZoneRight"),
      tail: t("MONSTER_ANATOMY.Target.ZoneTail"),
    };
    const zoneEmpty: Record<ZoneKey, boolean> = {
      head: zones.head.length === 0,
      torso: zones.torso.length === 0,
      left: zones.left.length === 0,
      right: zones.right.length === 0,
      tail: zones.tail.length === 0,
    };
    const zoneClassMap: Record<ZoneKey, string> = {
      head: zoneClass(zones.head),
      torso: zoneClass(zones.torso),
      left: zoneClass(zones.left),
      right: zoneClass(zones.right),
      tail: zoneClass(zones.tail),
    };
    const maskAc = isAcSecret(actor) && !isGm();
    const acText = (ac: number): string => (maskAc ? "??" : String(ac));
    return {
      ...base,
      actorName: actor.name,
      layout: getMapLayout(actor),
      zoneLabelMap,
      zoneEmpty,
      zoneClassMap,
      others: unmapped.map((p) => ({
        id: p.id,
        display: `${p.name} — CA ${acText(p.ac)} — ${p.hp.value}/${p.hp.max} • ${t(PART_STATE_CHOICES[p.state])}`,
      })),
    };
  }

  protected override async _onRender(
    context: DeepPartial<TargetMapDialog.RenderContext>,
    options: DeepPartial<TargetMapDialog.RenderOptions>,
  ): Promise<void> {
    await super._onRender(context, options);
    const actor = this.actor;
    const maskAc = isAcSecret(actor) && !isGm();
    const acText = (ac: number): string => (maskAc ? "??" : String(ac));
    const { zones } = mapPartsToZones(getParts(actor));
    const list = this.element.querySelector("[data-zoneparts]");
    const hint = this.element.querySelector("[data-zonehint]");
    const pick = (id: string | null): void => {
      if (!this.#resolve) return;
      const r = this.#resolve;
      this.#resolve = null;
      r(id);
      void this.close();
    };
    this.element.querySelectorAll<SVGElement>("[data-zone]").forEach((zone) => {
      zone.addEventListener("click", () => {
        const key = (zone as SVGElement & { dataset: DOMStringMap }).dataset.zone as ZoneKey;
        this.element
          .querySelectorAll("[data-zone]")
          .forEach((z) => z.classList.toggle("is-active", z === zone));
        const members = zones[key] ?? [];
        if (!list) return;
        if (members.length === 0) {
          list.innerHTML = `<p class="ma-empty">${esc(t("MONSTER_ANATOMY.Target.ZoneEmpty"))}</p>`;
        } else {
          list.innerHTML = members
            .map(
              (p) =>
                `<button type="button" data-part-id="${esc(p.id)}">` +
                `${esc(p.name)} — CA ${esc(acText(p.ac))} — ${p.hp.value}/${p.hp.max} • ${esc(t(PART_STATE_CHOICES[p.state]))}` +
                `</button>`,
            )
            .join("");
        }
        if (hint) hint.textContent = t("MONSTER_ANATOMY.Target.ZoneHint");
      });
    });
    list?.addEventListener("click", (event) => {
      const btn = (event.target as HTMLElement).closest("[data-part-id]") as HTMLElement | null;
      const id = btn?.dataset.partId;
      if (id) pick(id);
    });
    this.element.querySelectorAll("[data-pick-part]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = (btn as HTMLElement).dataset.pickPart;
        if (id) pick(id);
      });
    });
    this.element
      .querySelector("[data-normal]")
      ?.addEventListener("click", () => pick(null));
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
    layout: string;
    zoneLabelMap: Record<ZoneKey, string>;
    zoneEmpty: Record<ZoneKey, boolean>;
    zoneClassMap: Record<ZoneKey, string>;
    others: Array<{ id: string; display: string }>;
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
