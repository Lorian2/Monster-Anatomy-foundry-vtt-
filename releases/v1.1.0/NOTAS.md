# v1.1.0 — Notas de release (2026-09-22)

## O que entrou (resumo)

- **Modelos de anatomia:** presets Draconídeo/Humanoide + customs (salvar/aplicar/
  excluir), com layout de mapa junto e itens resolvidos por nome. API
  `getTemplates`/`applyTemplate`.
- **Mira visual:** mapa SVG clicável (região → parte) em 2 layouts por ator,
  fallback em lista, zonas com severidade.
- **CA secreta:** toggle por ator; `??` para não-GM no painel, mapa, tracker e chat.
- **Nota de dano roteado:** confirma aplicação + parcela global no chat.
- **Bônus de foco:** setting global (%) + sobrescrita por parte (herdar/off/%/fixo).
- **Recompensa em item direto** a quem quebrou (com fallback ao pool).

## Comparação com a anterior (v1.0.0)

A 1.0.0 tinha: anatomia/CA/HP, mira por dialog de texto, ataque vs CA, dano
roteado silencioso (só break anunciava), ruptura/corte/hitzones, vinculações,
loot por RollTable, 7 temas + FX, API e resumo. Tudo isso permanece.

Mudanças de comportamento a notar:
- A mira por texto virou mapa visual (mesmo fluxo, nova UI).
- Dano roteado agora sempre publica nota no chat (antes silencioso fora do break).
- Recompensas aceitam item direto além de tabela (linhas antigas migram sozinhas).
- Partes ganharam campo de bônus (default: herdar o global).

## Pacote

- `monster-anatomy.zip` — conteúdo de `dist/` na 1.1.0 (manifest na raiz).
- Compat declarada 14/14; testada em Foundry v14 build 364 + dnd5e 5.3.3.
