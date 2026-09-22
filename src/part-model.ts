/**
 * Modelo de dados de uma parte anatômica (doc de design, §5–§6, §12).
 *
 * MVP 0.1: identificação + CA + HP + flags quebrável/cortável + estado.
 * Hitzones (§14–15), sever-HP (§13–54) e recompensas (§37) entram nas fases 0.2–0.4.
 */

export type PartState = "intact" | "damaged" | "broken" | "severed" | "destroyed";

/** Modelos de dano parte × global (doc de design, §6). */
export type DamageModel = "independent" | "shared" | "percent";

export interface PartHp {
  value: number;
  max: number;
}

export interface MonsterPart {
  id: string;
  name: string;
  ac: number;
  hp: PartHp;
  breakable: boolean;
  severable: boolean;
  state: PartState;
  notes: string;
  /** Ações automáticas ao quebrar (0.2). Ausente em partes legadas → defaults. */
  onBreak?: BreakLinkage;  /** Multiplicadores por tipo de dano, esparsos (ausente = 1.0). */
  hitzone?: Record<string, number>;
  /** Pool de corte (0.3). Dano cortante acumula aqui em paralelo ao HP. */
  sever?: { value: number; max: number };
  /** Tipos que contam para corte (ex. ["slashing"]). */
  severTypes?: string[];
  /** Recompensas por ruptura/corte (0.4). */
  rewards?: PartReward[];
  /** Bônus ao atingir já rompida (sobrescreve o global conforme o modo). */
  bonus?: PartBonus;
}

/**
 * Bônus de foco por parte: `inherit` usa o setting global, `off` desliga,
 * `percent` multiplica, `flat` soma valor fixo.
 */
export interface PartBonus {
  mode: "inherit" | "off" | "percent" | "flat";
  value: number;
}

export const EMPTY_BONUS: PartBonus = { mode: "inherit", value: 0 };

/** Normaliza o bônus (partes antigas herdam o global). */
export function bonusOf(part: Pick<MonsterPart, "bonus">): PartBonus {
  const raw = part.bonus;
  if (!raw || typeof raw !== "object") return { ...EMPTY_BONUS };
  const mode = raw.mode === "off" || raw.mode === "percent" || raw.mode === "flat" ? raw.mode : "inherit";
  const value = Number.isFinite(Number(raw.value)) ? Math.max(0, Number(raw.value)) : 0;
  return { mode, value };
}

/**
 * Recompensa de parte (doc de design, §37): sorteio em RollTable
 * (nativa: pesos, fórmulas e coleções) ou item direto ao atacante,
 * no evento configurado.
 */
export interface PartReward {
  id: string;
  kind: "table" | "item";
  /** UUID da RollTable (mundo/compêndio) ou do Item. */
  uuid: string;
  /** Sorteios (tabela) ou quantidade (item). */
  draws: number;
  onEvent: "break" | "sever";
}

/** Normaliza recompensas (migra `tableUuid` legado; filtra vazias). */
export function rewardsOf(part: Pick<MonsterPart, "rewards">): PartReward[] {
  if (!Array.isArray(part.rewards)) return [];
  const out: PartReward[] = [];
  for (const r of part.rewards) {
    if (!r || typeof r !== "object") continue;
    const raw = r as Partial<PartReward> & { tableUuid?: unknown };
    const uuid =
      typeof raw.uuid === "string" && raw.uuid.trim() !== ""
        ? raw.uuid.trim()
        : typeof raw.tableUuid === "string"
          ? raw.tableUuid.trim()
          : "";
    if (uuid === "") continue;
    out.push({
      id: typeof raw.id === "string" && raw.id !== "" ? raw.id : foundry.utils.randomID(),
      kind: raw.kind === "item" ? "item" : "table",
      uuid,
      draws: Math.max(1, Math.min(20, Math.floor(Number(raw.draws) || 1))),
      onEvent: raw.onEvent === "sever" ? "sever" : "break",
    });
  }
  return out;
}

/** Tipos físicos (corte/perfuração/impacto) — base do sever. */
export const PHYSICAL_DAMAGE_TYPES = ["slashing", "piercing", "bludgeoning"] as const;
/** Fallback quando o sistema não expõe a lista (CONFIG.DND5E.damageTypes). */
export const FALLBACK_DAMAGE_TYPES = [
  "slashing",
  "piercing",
  "bludgeoning",
  "fire",
  "cold",
  "lightning",
  "thunder",
  "acid",
  "poison",
  "psychic",
  "necrotic",
  "radiant",
  "force",
] as const;

/** Multiplicador da parte para um tipo de dano (1.0 quando indefinido). */
export function multiplierFor(
  part: Pick<MonsterPart, "hitzone">,
  type?: string,
): number {
  if (!type) return 1;
  const raw = part.hitzone?.[type];
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : 1;
}

/** O pool de corte está ativo (cortável + tipos configurados)? */
export function severActive(part: Pick<MonsterPart, "severable" | "severTypes">): boolean {
  return part.severable && (part.severTypes ?? []).length > 0;
}

/**
 * Vinculação de ruptura vigente? Quebrada OU cortada (cauda cortada não
 * devolve o Tail Swipe: sair de qualquer um dos dois é o que repara).
 */
export function linkageActive(state: PartState): boolean {
  return state === "broken" || state === "severed";
}

/**
 * Vinculações de ruptura por parte (doc de design, §32–§34).
 * Campos vazios = ação desabilitada. Recompensas/loot ficam para 0.4.
 */
export interface BreakLinkage {
  /** Item (ataque/habilidade) desabilitado enquanto a parte estiver quebrada. */
  disableItemId: string;
  /** Nome do item (portabilidade de modelos entre atores). */
  disableItemName: string;
  /** ActiveEffect próprio aplicado ao quebrar. */
  effectName: string;
  effectIcon: string;
  /** Duração em rodadas (vazio = permanente até reparo). */
  effectDuration: number | null;
  /** Condição (status) aplicada ao quebrar. */
  condition: string;
  /** Atributo alterado (caminho pontilhado no documento). */
  setAttrPath: string;
  /** Novo valor (texto; convertido: true/false/número/texto). */
  setAttrValue: string;
  /** Macro executada ao quebrar (uuid). */
  macroUuid: string;
}

export const EMPTY_LINKAGE: BreakLinkage = {
  disableItemId: "",
  disableItemName: "",
  effectName: "",
  effectIcon: "",
  effectDuration: null,
  condition: "",
  setAttrPath: "",
  setAttrValue: "",
  macroUuid: "",
};

/** Normaliza a vinculação (partes antigas não têm `onBreak`). */
export function linkageOf(part: Pick<MonsterPart, "onBreak">): BreakLinkage {
  return { ...EMPTY_LINKAGE, ...(part.onBreak ?? {}) };
}

/** Parte de modelo (sem id/estado/HP atual — material para criar partes). */
export interface TemplatePart {
  name: string;
  ac: number;
  hpMax: number;
  breakable: boolean;
  severable: boolean;
  hitzone: Record<string, number>;
  severMax: number;
  severTypes: string[];
  onBreak: BreakLinkage;
  rewards: PartReward[];
}

export interface AnatomyTemplate {
  id: string;
  name: string;
  /** Presets embutidos não podem ser excluídos. */
  builtin?: boolean;
  /** Layout do mapa corporal ("dragonoid" padrão). */
  map?: string;
  parts: TemplatePart[];
}

/** Congela as partes atuais como material de modelo. */
export function templateFromParts(
  name: string,
  parts: MonsterPart[],
  map?: string,
): AnatomyTemplate {
  return {
    id: foundry.utils.randomID(),
    name,
    ...(map ? { map } : {}),
    parts: parts.map((p) => ({
      name: p.name,
      ac: p.ac,
      hpMax: p.hp.max,
      breakable: p.breakable,
      severable: p.severable,
      hitzone: { ...(p.hitzone ?? {}) },
      severMax: p.sever?.max ?? p.hp.max,
      severTypes: [...(p.severTypes ?? ["slashing"])],
      onBreak: linkageOf(p),
      rewards: rewardsOf(p).map((r) => ({ ...r })),
    })),
  };
}

/** Materializa um modelo em partes novas (ids frescos, HP cheio, íntegras). */
export function partsFromTemplate(t: AnatomyTemplate, actor: Actor): MonsterPart[] {
  return t.parts.map((tp) => {
    const max = Math.max(1, Math.floor(tp.hpMax));
    const part = createDefaultPart(tp.name || "Nova parte", {
      ac: Math.max(0, Math.floor(tp.ac)),
      hp: max,
    });
    part.breakable = tp.breakable !== false;
    part.severable = tp.severable === true;
    part.hitzone = { ...(tp.hitzone ?? {}) };
    const severMax = Math.max(1, Math.floor(tp.severMax || max));
    part.sever = { value: severMax, max: severMax };
    part.severTypes = [...(tp.severTypes ?? ["slashing"])];
    part.onBreak = { ...EMPTY_LINKAGE, ...(tp.onBreak ?? {}) };
    part.rewards = (tp.rewards ?? []).map((r) => ({ ...r }));
    // Item vinculado por NOME (portável entre atores); id direto como fallback.
    const wantName = part.onBreak.disableItemName.trim();
    const byName = wantName
      ? [...actor.items].find((i) => i.name === wantName)
      : undefined;
    const byId =
      !byName && part.onBreak.disableItemId.trim()
        ? actor.items.get(part.onBreak.disableItemId.trim())
        : undefined;
    const resolved = byName ?? byId;
    part.onBreak.disableItemId = typeof resolved?.id === "string" ? resolved.id : "";
    part.onBreak.disableItemName = typeof resolved?.name === "string" ? resolved.name : wantName;
    return part;
  });
}

/** Presets embutidos (nomes via i18n, prefixo builtin-). */
export const BUILTIN_TEMPLATES: AnatomyTemplate[] = [
  {
    id: "builtin-dragonoid",
    name: "MONSTER_ANATOMY.Template.Dragonoid",
    builtin: true,
    map: "dragonoid",
    parts: [
      { name: "Cabeça", ac: 21, hpMax: 80, breakable: true, severable: false, hitzone: { bludgeoning: 1.5, piercing: 0.8 }, severMax: 80, severTypes: ["slashing"], onBreak: { ...EMPTY_LINKAGE }, rewards: [] },
      { name: "Corpo", ac: 19, hpMax: 100, breakable: true, severable: false, hitzone: {}, severMax: 100, severTypes: ["slashing"], onBreak: { ...EMPTY_LINKAGE }, rewards: [] },
      { name: "Asa Esquerda", ac: 20, hpMax: 60, breakable: true, severable: false, hitzone: {}, severMax: 60, severTypes: ["slashing"], onBreak: { ...EMPTY_LINKAGE }, rewards: [] },
      { name: "Asa Direita", ac: 20, hpMax: 60, breakable: true, severable: false, hitzone: {}, severMax: 60, severTypes: ["slashing"], onBreak: { ...EMPTY_LINKAGE }, rewards: [] },
      { name: "Cauda", ac: 22, hpMax: 70, breakable: true, severable: true, hitzone: {}, severMax: 40, severTypes: ["slashing"], onBreak: { ...EMPTY_LINKAGE, disableItemName: "Tail Swipe" }, rewards: [] },
    ],
  },
  {
    id: "builtin-humanoid",
    name: "MONSTER_ANATOMY.Template.Humanoid",
    builtin: true,
    map: "humanoid",
    parts: [
      { name: "Cabeça", ac: 20, hpMax: 50, breakable: true, severable: false, hitzone: { bludgeoning: 1.5 }, severMax: 50, severTypes: ["slashing"], onBreak: { ...EMPTY_LINKAGE }, rewards: [] },
      { name: "Corpo", ac: 18, hpMax: 80, breakable: true, severable: false, hitzone: {}, severMax: 80, severTypes: ["slashing"], onBreak: { ...EMPTY_LINKAGE }, rewards: [] },
      { name: "Braço Esquerdo", ac: 18, hpMax: 40, breakable: true, severable: false, hitzone: {}, severMax: 40, severTypes: ["slashing"], onBreak: { ...EMPTY_LINKAGE }, rewards: [] },
      { name: "Braço Direito", ac: 18, hpMax: 40, breakable: true, severable: false, hitzone: {}, severMax: 40, severTypes: ["slashing"], onBreak: { ...EMPTY_LINKAGE }, rewards: [] },
      { name: "Perna Esquerda", ac: 18, hpMax: 50, breakable: true, severable: false, hitzone: {}, severMax: 50, severTypes: ["slashing"], onBreak: { ...EMPTY_LINKAGE }, rewards: [] },
      { name: "Perna Direita", ac: 18, hpMax: 50, breakable: true, severable: false, hitzone: {}, severMax: 50, severTypes: ["slashing"], onBreak: { ...EMPTY_LINKAGE }, rewards: [] },
    ],
  },
];

/** Estados configuráveis por parte (o Mestre pode não usar todos — §12). */
export const PART_STATE_CHOICES: Record<PartState, string> = {
  intact: "MONSTER_ANATOMY.State.Intact",
  damaged: "MONSTER_ANATOMY.State.Damaged",
  broken: "MONSTER_ANATOMY.State.Broken",
  severed: "MONSTER_ANATOMY.State.Severed",
  destroyed: "MONSTER_ANATOMY.State.Destroyed",
};

let idCounter = 0;

/** Gera um id único dentro da criatura (§5.1). */
export function generatePartId(): string {
  idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `part-${Date.now().toString(36)}-${rand}-${idCounter}`;
}

export function createDefaultPart(
  name: string,
  defaults: { ac: number; hp: number },
): MonsterPart {
  const max = Math.max(1, Math.floor(defaults.hp));
  return {
    id: generatePartId(),
    name: name.trim(),
    ac: Math.max(0, Math.floor(defaults.ac)),
    hp: { value: max, max },
    breakable: true,
    severable: false,
    state: "intact",
    notes: "",
    onBreak: { ...EMPTY_LINKAGE },
    hitzone: {},
    sever: { value: max, max },
    severTypes: ["slashing"],
    rewards: [],
    bonus: { ...EMPTY_BONUS },
  };
}

/**
 * Deriva o estado mecânico a partir do HP (usado no futuro pelo DamageResolver;
 * no scaffold o estado é editável manualmente).
 */
export function deriveStateFromHp(part: Pick<MonsterPart, "hp" | "breakable">): PartState {
  if (part.hp.value <= 0 && part.breakable) return "broken";
  if (part.hp.value < part.hp.max) return "damaged";
  return "intact";
}

/** Valida uma parte; retorna lista de mensagens de erro (vazia = válida). */
export function validatePart(part: Partial<MonsterPart>): string[] {
  const errors: string[] = [];
  if (!part.name?.trim()) errors.push("name");
  if (part.ac === undefined || !Number.isFinite(part.ac) || part.ac < 0) errors.push("ac");
  if (part.hp === undefined || !Number.isFinite(part.hp.max) || part.hp.max < 1) errors.push("hp.max");
  if (part.hp !== undefined && (!Number.isFinite(part.hp.value) || part.hp.value < 0)) {
    errors.push("hp.value");
  }
  return errors;
}

/** Clona profundamente uma parte (evita mutação acidental do documento). */
export function clonePart(part: MonsterPart): MonsterPart {
  return {
    ...part,
    hp: { ...part.hp },
    onBreak: linkageOf(part),
    hitzone: { ...(part.hitzone ?? {}) },
    sever: part.sever ? { ...part.sever } : { value: part.hp.max, max: part.hp.max },
    severTypes: [...(part.severTypes ?? ["slashing"])],
    rewards: rewardsOf(part).map((r) => ({ ...r })),
    bonus: bonusOf(part),
  };
}
