/**
 * Recompensas de partes (doc de design, §37–§38): sorteios em RollTables
 * nativas no break/sever, com pool persistente por ator para o resumo
 * pós-batalha e distribuição manual pelo Mestre.
 *
 * Roda no cliente com permissão (GM no fluxo socket).
 */
import { MODULE_ID } from "./constants.js";
import { getSetting, t, tf } from "./fvtt.js";
import { rewardsOf, type MonsterPart } from "./part-model.js";

export type RewardEvent = "break" | "sever";

export interface LootEntry {
  partId: string;
  partName: string;
  event: RewardEvent;
  items: string[];
  grantedTo?: string;
  at: number;
}

const LOOT_KEY = "loot";
const MAX_LOOT_ENTRIES = 200;
const MAX_DRAWS = 20;

export interface GrantOptions {
  /** UUID do ator atacante (para entregar itens). */
  attackerUuid?: string;
}

/** Concede as recompensas da parte no evento e acumula no pool. */
export async function grantRewards(
  actor: Actor,
  part: MonsterPart,
  event: RewardEvent,
  opts: GrantOptions = {},
): Promise<void> {
  const rewards = rewardsOf(part).filter((r) => r.onEvent === event);
  if (rewards.length === 0) return;
  const recipient = await resolveRecipient(actor, opts.attackerUuid);
  const gained: string[] = [];
  let grantedTo: string | undefined;
  for (const r of rewards) {
    if (r.kind === "item") {
      const name = await grantItem(actor, recipient, r.uuid, r.draws);
      if (name) {
        gained.push(r.draws > 1 ? `${name} ×${r.draws}` : name);
        if (recipient) grantedTo = recipient.name;
      }
      continue;
    }
    const table = await resolveTable(r.uuid);
    if (!table) {
      console.warn(`monster-anatomy | tabela não encontrada (${r.uuid})`);
      continue;
    }
    for (let i = 0; i < Math.min(Math.floor(r.draws), MAX_DRAWS); i++) {
      try {
        // DrawOptions tipado como total, mas só displayChat importa em runtime.
        const draw = await table.draw({ displayChat: false } as RollTable.DrawOptions);
        for (const res of draw.results ?? []) {
          const name = displayName(res);
          if (name) gained.push(name);
        }
      } catch (err) {
        console.warn("monster-anatomy | falha no sorteio", err);
        break;
      }
    }
  }
  if (gained.length === 0) return;
  await appendLoot(actor, {
    partId: part.id,
    partName: part.name,
    event,
    items: gained,
    ...(grantedTo ? { grantedTo } : {}),
    at: Date.now(),
  });
  if (getSetting("chatMessage")) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content:
        `<div class="monster-anatomy-chat ma-loot">` +
        `<h3>🎁 ${esc(t("MONSTER_ANATOMY.Loot.Title"))}</h3>` +
        `<p>${esc(
          tf("MONSTER_ANATOMY.Loot.Text", {
            part: part.name,
            actor: actor.name,
            items: gained.join(", "),
          }),
        )}</p></div>`,
    });
  }
}

/**
 * Quem recebe itens: atacante explícito, ou o personagem do usuário
 * (jogador distribuindo manual). Nunca o próprio alvo.
 */
async function resolveRecipient(target: Actor, attackerUuid?: string): Promise<Actor | null> {
  const explicit = attackerUuid && attackerUuid !== target.uuid ? attackerUuid : undefined;
  if (explicit) {
    const doc = await safeFromUuid(explicit);
    if (doc instanceof Actor && doc.uuid !== target.uuid) return doc;
  }
  const me = game.user;
  if (me && !me.isGM) {
    const c = me.character;
    if (c instanceof Actor && c.uuid !== target.uuid) return c;
  }
  return null;
}

/** Cria o item na ficha do recebedor; sem recebedor, só registra o nome. */
async function grantItem(
  target: Actor,
  recipient: Actor | null,
  itemUuid: string,
  draws: number,
): Promise<string | null> {
  const doc = await safeFromUuid(itemUuid);
  if (!(doc instanceof Item)) {
    console.warn(`monster-anatomy | item não encontrado (${itemUuid})`);
    return null;
  }
  const name = typeof doc.name === "string" ? doc.name : itemUuid;
  if (!recipient) {
    console.warn("monster-anatomy | sem atacante para entregar o item; registrado no pool");
    return name;
  }
  try {
    const data = (doc.toObject() ?? {}) as unknown as Record<string, unknown>;
    delete data._id;
    const create = recipient.createEmbeddedDocuments as unknown as (
      t: string,
      d: Record<string, unknown>[],
    ) => Promise<unknown[]>;
    const created = (await create.call(recipient, "Item", [data])) as Array<{
      update?: (d: object) => Promise<unknown>;
    }>;
    if (draws > 1 && created[0]?.update) {
      try {
        await created[0].update?.({ "system.quantity": draws });
      } catch {
        /* sistema sem quantity: mantém 1 cópia (restante vai no pool) */
      }
    }
    return name;
  } catch (err) {
    console.warn("monster-anatomy | falha ao criar item no recebedor", err);
    return name;
  }
}

export function getLoot(actor: Actor): LootEntry[] {
  try {
    const raw = actor.getFlag(MODULE_ID, LOOT_KEY) as unknown;
    if (!Array.isArray(raw)) return [];
    return (raw as LootEntry[]).filter((e) => e && Array.isArray(e.items));
  } catch {
    return [];
  }
}

export async function clearLoot(actor: Actor): Promise<void> {
  await actor.setFlag(MODULE_ID, LOOT_KEY, []);
}

async function appendLoot(actor: Actor, entry: LootEntry): Promise<void> {
  const pool = [...getLoot(actor), entry].slice(-MAX_LOOT_ENTRIES);
  await actor.setFlag(MODULE_ID, LOOT_KEY, pool);
}

async function resolveTable(uuid: string): Promise<RollTable | null> {
  const doc = await safeFromUuid(uuid);
  return doc instanceof RollTable ? doc : null;
}

async function safeFromUuid(uuid: string): Promise<unknown> {
  try {
    return (await fromUuid(uuid as Parameters<typeof fromUuid>[0])) as unknown;
  } catch {
    return null;
  }
}

function displayName(res: unknown): string {
  const r = res as { name?: unknown; text?: unknown; id?: unknown };
  if (typeof r?.name === "string" && r.name) return r.name;
  if (typeof r?.text === "string" && r.text) return r.text;
  if (typeof r?.id === "string" && r.id) return r.id;
  return "";
}

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
