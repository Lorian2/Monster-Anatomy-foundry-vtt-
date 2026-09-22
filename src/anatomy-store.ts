/**
 * Persistência das partes via Flags do Actor
 * (`flags.monster-anatomy.parts`) — decisão documentada na referência v13:
 * sem subtipo custom de documento no MVP, compatibilidade total com dnd5e.
 */
import { FLAG_PARTS, FLAG_SCOPE, HOOKS, MODULE_ID } from "./constants.js";
import { clonePart, linkageActive, templateFromParts, partsFromTemplate, BUILTIN_TEMPLATES, type AnatomyTemplate, type MonsterPart } from "./part-model.js";
import { applyBreakActions, cleanupBreakLinkage } from "./break-actions.js";
import { callHook, getSetting, t } from "./fvtt.js";

export function getParts(actor: Actor): MonsterPart[] {
  const raw = actor.getFlag(FLAG_SCOPE, FLAG_PARTS);
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => ({ ...p, hp: { ...p.hp } }));
}

async function persistParts(actor: Actor, parts: MonsterPart[]): Promise<void> {
  if (!actor.isOwner) {
    ui.notifications?.warn(t("MONSTER_ANATOMY.Errors.NoPermission"));
    throw new Error("monster-anatomy: actor não editável pelo usuário atual");
  }
  const oldParts = getParts(actor);
  await actor.setFlag(FLAG_SCOPE, FLAG_PARTS, parts.map(clonePart));
  await syncBreakLinkage(actor, oldParts, parts);
  callHook(HOOKS.PARTS_CHANGED, actor, getParts(actor));
}

/**
 * Transições de ruptura (0.2): entrar em quebrado aplica as vinculações,
 * sair (reparo) desfaz o reversível, parte removida limpa os resíduos.
 */
async function syncBreakLinkage(
  actor: Actor,
  oldParts: MonsterPart[],
  newParts: MonsterPart[],
): Promise<void> {
  const oldById = new Map(oldParts.map((p) => [p.id, p]));
  const newIds = new Set(newParts.map((p) => p.id));
  for (const part of newParts) {
    const was = linkageActive(oldById.get(part.id)?.state ?? "intact");
    const is = linkageActive(part.state);
    if (is === was) continue;
    try {
      if (is) await applyBreakActions(actor, part);
      else await cleanupBreakLinkage(actor, part);
    } catch (err) {
      console.warn("monster-anatomy | falha na vinculação de ruptura", err);
    }
  }
  for (const old of oldParts) {
    if (newIds.has(old.id) || !linkageActive(old.state)) continue;
    try {
      await cleanupBreakLinkage(actor, old);
    } catch (err) {
      console.warn("monster-anatomy | falha na limpeza de ruptura", err);
    }
  }
}

export async function addPart(actor: Actor, part: MonsterPart): Promise<void> {
  const parts = getParts(actor);
  if (parts.some((p) => p.id === part.id)) {
    throw new Error(`monster-anatomy: id de parte duplicado (${part.id})`);
  }
  parts.push(clonePart(part));
  await persistParts(actor, parts);
}

export async function updatePart(
  actor: Actor,
  partId: string,
  patch: Partial<MonsterPart>,
): Promise<void> {
  const parts = getParts(actor);
  const index = parts.findIndex((p) => p.id === partId);
  if (index < 0) throw new Error(`monster-anatomy: parte não encontrada (${partId})`);
  const current = parts[index]!;
  parts[index] = {
    ...current,
    ...patch,
    id: current.id, // id é imutável (§5.1 do design)
    hp: { ...current.hp, ...(patch.hp ?? {}) },
  };
  await persistParts(actor, parts);
}

export async function deletePart(actor: Actor, partId: string): Promise<void> {
  const parts = getParts(actor).filter((p) => p.id !== partId);
  await persistParts(actor, parts);
}

export function canEdit(actor: Actor): boolean {
  // Só GM ou dono do Actor edita; demais usuários têm leitura.
  return game.user?.isGM === true || actor.isOwner;
}

export function isGm(): boolean {
  return game.user?.isGM === true;
}

/** Nome de exibição do modelo (presets usam chaves i18n). */
export function templateDisplayName(tpl: Pick<AnatomyTemplate, "name" | "builtin">): string {
  const base = tpl.name.startsWith("MONSTER_ANATOMY.") ? t(tpl.name) : tpl.name;
  return tpl.builtin ? `${base} ${t("MONSTER_ANATOMY.Template.BuiltinTag")}` : base;
}

/** Todos os modelos: presets + customs do mundo. */
export function getTemplates(): AnatomyTemplate[] {
  return [...BUILTIN_TEMPLATES, ...readCustomTemplates()];
}

function readCustomTemplates(): AnatomyTemplate[] {
  try {
    const raw = getSetting("templatesJson");
    if (typeof raw !== "string" || raw.trim() === "") return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is AnatomyTemplate =>
        !!v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string",
    );
  } catch {
    return [];
  }
}

async function writeCustomTemplates(list: AnatomyTemplate[]): Promise<void> {
  await game.settings!.set(MODULE_ID, "templatesJson", JSON.stringify(list));
}

/** Congela a anatomia atual como modelo do mundo (só GM). */
export async function saveTemplate(
  name: string,
  parts: MonsterPart[],
  map?: string,
): Promise<AnatomyTemplate> {
  const tpl = templateFromParts(name, parts, map);
  await writeCustomTemplates([...readCustomTemplates(), tpl]);
  return tpl;
}

/** Exclui modelo custom (presets protegidos). Retorna false se protegido/ausente. */
export async function deleteTemplate(id: string): Promise<boolean> {
  if (id.startsWith("builtin-")) return false;
  const next = readCustomTemplates().filter((v) => v.id !== id);
  if (next.length === readCustomTemplates().length) return false;
  await writeCustomTemplates(next);
  return true;
}

/** Aplica modelo ao ator (anexa partes novas, sem apagar as atuais). */
export async function applyTemplate(actor: Actor, templateId: string): Promise<number> {
  const tpl = getTemplates().find((v) => v.id === templateId);
  if (!tpl) throw new Error(`monster-anatomy: modelo não encontrado (${templateId})`);
  const fresh = partsFromTemplate(tpl, actor);
  await persistParts(actor, [...getParts(actor), ...fresh]);
  if (tpl.map) await actor.setFlag(MODULE_ID, "mapLayout", tpl.map);
  return fresh.length;
}

/** Layout do mapa corporal do ator ("dragonoid" padrão). */
export function getMapLayout(actor: Actor): string {
  try {
    const v = actor.getFlag(MODULE_ID, "mapLayout") as unknown;
    return v === "humanoid" ? "humanoid" : "dragonoid";
  } catch {
    return "dragonoid";
  }
}

export async function setMapLayout(actor: Actor, layout: string): Promise<void> {
  await actor.setFlag(MODULE_ID, "mapLayout", layout === "humanoid" ? "humanoid" : "dragonoid");
}

/** CA das partes escondida de não-GM neste ator? */
export function isAcSecret(actor: Actor): boolean {
  try {
    return actor.getFlag(MODULE_ID, "hideAc") === true;
  } catch {
    return false;
  }
}

export async function setHideAc(actor: Actor, hide: boolean): Promise<void> {
  await actor.setFlag(MODULE_ID, "hideAc", hide);
}
