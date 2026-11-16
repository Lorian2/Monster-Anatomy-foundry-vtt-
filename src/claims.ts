/**
 * Dano já aplicado pelo módulo (proteção contra aplicação em dobro).
 *
 * Quando o roteamento aplica dano às partes e também ao HP global, o jogador
 * não deve clicar em "aplicar dano" no card do dnd5e (contaria duas vezes).
 * Registramos aqui uma "reivindicação" por ator + mensagem de dano; o hook
 * `dnd5e.preApplyDamage` consulta o registro e bloqueia a aplicação duplicada.
 *
 * O registro vive na memória de cada cliente e é replicado por socket, para
 * valer também quando quem clica é o Mestre.
 */
/** Com a mensagem identificada vale por mais tempo; só pela assinatura, pouco. */
const TTL_BY_MESSAGE_MS = 10 * 60 * 1000;
const TTL_BY_SIGNATURE_MS = 2 * 60 * 1000;

interface Claim {
  actorUuid: string;
  sig: string;
  messageId?: string;
  expires: number;
}

let claims: Claim[] = [];

/** Assinatura de uma rolagem de dano: totais positivos, em ordem. */
export function sigOf(totals: number[]): string {
  return totals
    .map((n) => Math.floor(Number(n) || 0))
    .filter((n) => n > 0)
    .sort((a, b) => a - b)
    .join(",");
}

function prune(): void {
  const now = Date.now();
  claims = claims.filter((c) => c.expires > now).slice(-60);
}

/** Registra que o dano (ator + assinatura [+ mensagem]) já foi aplicado. */
export function addClaim(actorUuid: string, sig: string, messageId?: string): void {
  if (!actorUuid || !sig) return;
  prune();
  const ttl = messageId ? TTL_BY_MESSAGE_MS : TTL_BY_SIGNATURE_MS;
  claims.push({ actorUuid, sig, ...(messageId ? { messageId } : {}), expires: Date.now() + ttl });
}

/**
 * O dano desta mensagem já foi aplicado? Com mensagem identificada compara o id;
 * sem ela, compara a assinatura e consome o registro (uso único).
 */
export function isClaimed(actorUuid: string, sig: string, messageId?: string): boolean {
  prune();
  const index = claims.findIndex((c) => {
    if (c.actorUuid !== actorUuid) return false;
    if (c.messageId) return messageId !== undefined && c.messageId === messageId;
    return c.sig === sig;
  });
  if (index < 0) return false;
  if (!claims[index]?.messageId) claims.splice(index, 1);
  return true;
}

/** Procura, entre as mensagens recentes de `userId`, a de dano com esta assinatura. */
export function findDamageMessageId(sig: string, userId?: string): string | undefined {
  const list = game.messages?.contents ?? [];
  for (let i = list.length - 1; i >= Math.max(0, list.length - 12); i--) {
    const msg = list[i];
    if (!msg) continue;
    if (userId && msg.author?.id !== userId) continue;
    const rolls = (msg as unknown as { rolls?: unknown }).rolls;
    if (!Array.isArray(rolls) || rolls.length === 0) continue;
    const mine = sigOf(rolls.map((r) => Number((r as { total?: unknown })?.total)));
    if (mine === sig) return msg.id ?? undefined;
  }
  return undefined;
}
