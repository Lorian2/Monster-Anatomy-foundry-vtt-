# Monster Anatomy

Sistema de anatomia, partes destrutíveis e feedback visual para **Foundry VTT v13+**.
Foco inicial: **D&D 5e**. Inspirado em *Monster Hunter* (partes/hitzones/part break)
com direção visual de impacto (Persona/JRPG).

> Status: **1.0.0** — release pública (Foundry v14 + dnd5e). Ver `CHANGELOG.md`.

## Requisitos

- Foundry VTT **v14** (minimum 14, verified 14)
- Node 20+ e npm (só para build de desenvolvimento)
- Sistema de jogo: **dnd5e** (integração de ataque/condições/status)

## Desenvolvimento

```bash
cd monster-anatomy
npm install
npm run build        # gera dist/
npm run link         # symlink dist/ → <Foundry userData>/Data/modules/monster-anatomy
                     # (aceita --dataPath "..." ou env FOUNDRY_DATA_PATH)
npm run dev          # rebuild automático a cada mudança (Vite watch)
npm run typecheck    # tsc --noEmit
```

Ative o módulo no mundo e abra a ficha de um monstro: o botão **Anatomia** (dragão)
aparece no cabeçalho da ficha. Alternativas se o botão não aparecer na sua ficha:

**Macro** (cole numa macro script e execute com um token selecionado):

```js
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn("Selecione um token.");
await game.modules.get("monster-anatomy").api.openAnatomy(actor);
```

**Console (F12):**

```js
const actor = game.actors.getName("Rathian");
await game.modules.get("monster-anatomy").api.openAnatomy(actor);
```

## Testando dano e Part Break (macros script, como GM)

```js
// 1. Descobrir os ids das partes (o painel também mostra o id em cada linha)
const actor = canvas.tokens.controlled[0]?.actor;
console.log(game.modules.get("monster-anatomy").api.getParts(actor));
```

```js
// 2. Aplicar dano (dispara anúncio + chat + efeito no token ao quebrar)
const actor = canvas.tokens.controlled[0]?.actor;
await game.modules.get("monster-anatomy").api.damagePart(actor, "COLE_O_ID", 25, { attacker: "Luan" });
```

```js
// 3. Curar uma parte
const actor = canvas.tokens.controlled[0]?.actor;
await game.modules.get("monster-anatomy").api.healPart(actor, "COLE_O_ID", 10);
```

Modelo de dano parte × global (Configurações do módulo): independente, compartilhado
(padrão) ou percentual. **Bônus vs rompidas** (padrão 50%): atingir parte já
quebrada/cortada multiplica o dano (ruptura, corte e global junto) — foca o
ponto fraco para terminar o monstro. A nota de dano marca `(+50% parte rompida)`.
Cada parte pode sobrescrever no editor (**Bônus de foco**: global, desligado,
percentual ou fixo).

## Combate: mirar, atacar, romper

Fluxo (dnd5e):

1. **Mire** o token do monstro (alvo) → abre o **mapa corporal**: clique na
   região e depois na parte (ou ataque normal). O desenho acompanha a anatomia
   (draconídeo/humanoide, trocável no painel); partes fora do mapa aparecem em
   lista. A mira vale até trocar de alvo.
2. **Role o ataque** normalmente na ficha → o módulo avalia contra a **CA da parte**
   e publica ACERTO/ERROU no chat (crítico no 20 natural sempre acerta).
3. **Role o dano** normalmente → o módulo aplica sozinho na parte (e no global,
   conforme o modelo), publica a nota do roteamento (`➡️ X → parte · global −Y`)
   e dispara o Part Break ao zerar. Não clique no botão de dano padrão do card
   para esse ataque (duplicaria o global) — a nota confirma o que já foi aplicado.

Multiplayer: o atacante sem permissão no monstro envia o dano ao GM via socket;
o GM aplica e todos veem o anúncio juntos. Sem GM online, o jogador é avisado.

> Para ataques em área/testes sem rolagem de ataque, use as macros de dano manual.

## Ao quebrar: vinculações (0.2)
No editor da parte, seção **Ao quebrar**:

- **Desabilitar item/ataque** — ex.: Cauda → Tail Swipe. Enquanto quebrada, usar o
  item é bloqueado com aviso; a linha da parte mostra 🔗 + desabilitado.
- **Efeito** — ActiveEffect próprio (nome, ícone, duração em rodadas).
- **Condição** — aplica um status (ex. Stunned) via efeito rastreado.
- **Atributo** — caminho + valor (ex. `system.attributes.movement.fly` = `0`).
  O valor original é guardado e **restaurado ao reparar**.
- **Macro** — executa uma macro (uuid) na ruptura.

Reparar = curar até o máximo (ou editar o estado para fora de quebrado):
efeitos/condição saem sozinhos, atributo volta, item reabilita.

## Modelos de anatomia e CA secreta

- **Modelos** (painel, linha de presets): **Draconídeo** e **Humanoide** embutidos
  + customs salvos da anatomia atual (só GM salva/exclui; presets protegidos).
  Aplicar anexa partes novas (itens vinculados resolvidos por nome no destino).
  API: `api.getTemplates()` / `api.applyTemplate(actor, id)`.
- **CA secreta** (olho no painel, só GM): jogadores veem `??` no painel, mapa,
  tracker e notas de ataque; o Mestre vê tudo. Ideal para chefes.

## Hitzones e severing (0.3)

No editor da parte:

- **Hitzones** — multiplicador por tipo de dano (lista do sistema; vazio = 1.0x).
  Ex.: cabeça com Contundente 1.5x e Perfurante 0.8x. Vale no dano roteado do
  combate; macros/painel sem tipo usam 1.0x.
- **Cortável + HP de corte + tipos cortantes** (padrão: cortante) — dano cortante
  acumula em RAW numa reserva paralela sem interferir no HP de ruptura.
  Zerou → `SEVERED` (anúncio, chat e marcador próprios, hooks `partSever`),
  mantendo as vinculações de quebra (Tail Swipe continua desabilitado).
- Curar tudo até o máximo restaura também a reserva de corte.

Teste: cabeça com 1.5x contundente + cauda cortável (HP corte 40); ataque com
martelo na cabeça e espada na cauda e compare os números.

## Recompensas e API externa (0.4)

No editor da parte, seção **Recompensas**: linhas de
`evento + tipo (tabela/item) + UUID + nº`.

- **Tabela** — UUID de RollTable (mundo ou compêndio): sorteia com pesos/fórmulas
  nativas, publica no chat e acumula no pool.
- **Item** — UUID de Item (mundo ou compêndio): cria na ficha de **quem quebrou**
  (atacante do combate; em dano manual, seu personagem; sem destinatário, só
  registra no pool). "Sorteios" vira quantidade quando o sistema suporta.

- **Resumo** (botão 📜 no painel ou `api.openSummary(actor)`): estado das partes +
  recompensas acumuladas, com limpeza para distribuir e recomeçar.
- **Macros de recompensa**: UUID da tabela via botão direito na RollTable → copiar UUID
  (formato `RollTable.xxx` ou `Compendium.xxx.yyy`).
- **Eventos para macros/módulos** (doc §35):
```js
const off = game.modules.get("monster-anatomy").api.on("partBreak", (actor, part, amount, attacker) => {
  ui.notifications.info(`${part.name} quebrou!`);
});
off(); // cancela
// eventos: partBreak, partSever, partDamage, partsChanged, panelRender
```

## Visual avançado (0.5)

- **Temas de anúncio** (por cliente, Configurações): Persona (padrão), Monster
  Hunter, JRPG, Minimalista, **Impacto** (HQ/halftone), **Arcade** (metálico),
  **Entalhado** (slab). Sever mantém identidade própria em todos.
- **Manchetes custom** (mundo): substituem BREAK!/SEVERED! quando preenchidas.
- **Tremor no token + flash de tela** (por cliente, desligáveis) em break/sever.
- **Movimento reduzido** (por cliente): desativa tremor, flash e animações
  agressivas (soma-se ao `prefers-reduced-motion` do SO).
- **FX em JS** (`src/fx.ts`): chuva de estilhaços no rompimento (cores por
  evento), cascata de letras no kicker e screen shake no canvas — tudo efêmero
  (canvas removido ao fim, transform restaurado), com toggles próprios
  (`Partículas`, `Tremor de tela`) e gates de movimento reduzido.

### Fontes embutidas

Anúncios usam fontes display em `assets/fonts` (SIL Open Font License 1.1,
ver `OFL-*.txt`): **Anton** (Impact), **Bungee** (Arcade) e **Alfa Slab One**
(Carved). Subsets latin em woff2 embutidos no CSS final — offline, sem CDN e
sem risco de 404 — com fallbacks (`Arial Black`, `Impact`, serif) se ausentes.

## Estrutura

```text
monster-anatomy/
├── module.json          # manifesto v13 (id, compatibility, esmodules, styles, lang)
├── src/
│   ├── main.ts          # entry point: init/setup/ready
│   ├── setup.ts         # settings + botão de header + preload de templates
│   ├── constants.ts     # MODULE_ID, flags, hooks custom
│   ├── part-model.ts    # tipos MonsterPart, validação, estados (§5, §6, §12)
│   ├── anatomy-store.ts # CRUD em flags.monster-anatomy.parts
│   ├── api.ts           # API pública (game.modules.get(...).api + global MonsterAnatomy)
│   └── apps/
│       ├── anatomy-panel.ts  # painel §30
│       └── part-editor.ts    # editor §31
├── templates/           # Handlebars (anatomy-panel.hbs, part-editor.hbs)
├── styles/              # CSS com @layer + variáveis de tema v13
├── lang/                # en.json, pt-BR.json
└── packs/               # compendia futuros (etapa 0.4+)
```

## API pública

```js
const api = game.modules.get("monster-anatomy").api;
api.version;                 // "0.1.0"
api.getParts(actor);         // MonsterPart[] (cada parte tem `id` único)
api.canEdit(actor);          // boolean (GM ou dono)
await api.openAnatomy(actor); // abre o painel
await api.damagePart(actor, partId, amount, { attacker }); // dano + break flow
await api.healPart(actor, partId, amount);                 // cura HP da parte
```

Hooks custom: `monsterAnatomy.panelRender(app)`, `monsterAnatomy.partsChanged(actor, parts)`,
`monsterAnatomy.partDamage(actor, part, amount, attacker)`,
`monsterAnatomy.partBreak(actor, part, amount, attacker)`.

## Roadmap (conforme documento de design)

- **Etapa 2 (MVP combate):** seleção de alvo (§7), CA da parte no ataque dnd5e (§9–10),
  dano localizado (§6), detecção de part break (§11), condição no token (§18),
  anúncio (§21) e chat (§39)
- **0.2:** estados/condições/efeitos ao quebrar (§12, §16–17, §32–34)
- **0.3:** severing/hitzones/tipos de dano (§13–15)
- **0.4:** recompensas + API externa (§37–38, §35)
- **0.5+:** temas visuais, sons, editor de anúncios (§27–29, §58)

## Licença

MIT — ver `LICENSE`. Fontes display em `assets/fonts` sob SIL OFL 1.1 (ver `OFL-*.txt`).

## Publicando uma release

1. `npm run check` (typecheck + i18n + build + bundle)
2. Atualize `version` em `module.json` + `package.json` e o `CHANGELOG.md`
3. `npm run build` e confira `dist/` (manifest + scripts + styles + templates + lang)
4. Comprima o **conteúdo** de `dist/` em `monster-anatomy.zip`
   (`Compress-Archive -Path dist/* -DestinationPath monster-anatomy.zip -Force`)
5. **Arquive a versão anterior**: copie o zip vigente para
   `releases/v<anterior>/monster-anatomy.zip` e escreva
   `releases/v<anterior>/NOTAS.md` com o resumo do que ela trouxe e a
   comparação com a versão antes dela (convenção do projeto — ver `releases/`)
6. No GitHub: tag `vX.Y.Z` + anexe `monster-anatomy.zip` e o `module.json` do `dist/`
   (o campo `manifest` aponta para `.../releases/latest/download/module.json` e
   `download` para `.../releases/download/vX.Y.Z/monster-anatomy.zip`)
7. Opcional: submeta em foundryvtt.com/packages para instalação em 1 clique
