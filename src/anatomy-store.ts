/**
 * Persistência das partes via Flags do Actor
 * (`flags.monster-anatomy.parts`) — decisão documentada na referência v13:
 * sem subtipo custom de documento no MVP, compatibilidade total com dnd5e.
 */
import { FLAG_PARTS, FLAG_SCOPE, HOOKS } from "./constants.js";
import { clonePart, linkageActive, type MonsterPart } from "./part-model.js";
import { applyBreakActions, cleanupBreakLinkage } from "./break-actions.js";
import { callHook, t } from "./fvtt.js";

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
