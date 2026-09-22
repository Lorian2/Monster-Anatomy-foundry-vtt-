/** Constantes compartilhadas do módulo Monster Anatomy. */
export const MODULE_ID = "monster-anatomy";

export const FLAG_SCOPE = MODULE_ID;
export const FLAG_PARTS = "parts";

/** Hooks custom disparados pelo módulo (Evento → Hook → Ação externa, §60 do design). */
export const HOOKS = {
  /** Disparado quando o painel de anatomia termina de renderizar. */
  PANEL_RENDER: "monsterAnatomy.panelRender",
  /** Disparado após criar/atualizar/remover uma parte. */
  PARTS_CHANGED: "monsterAnatomy.partsChanged",
  /** Disparado após aplicar dano a uma parte (sempre, mesmo sem quebra). */
  PART_DAMAGE: "monsterAnatomy.partDamage",
  /** Disparado na transição para quebrado (uma vez por transição). */
  PART_BREAK: "monsterAnatomy.partBreak",
  /** Disparado na transição para cortado (uma vez por transição). */
  PART_SEVER: "monsterAnatomy.partSever",
} as const;
