# v1.0.0 — Notas de release (2026-09-22)

Primeira release pública. Não há versão anterior publicada para comparar —
tudo abaixo é novo em relação ao zero.

## O que entrou (resumo)

- **Anatomia e combate:** partes por ator (CA/HP/estados), painel + editor + tracker
  + resumo; mira com seletor, ataque vs CA da parte, dano roteado (modelos
  independente/compartilhado/percentual), autoridade GM via sockets.
- **Ruptura/corte/hitzones:** Part Break e SEVERED com apresentações próprias;
  hitzones por tipo de dano; pool de corte independente.
- **Vinculações (0.2):** desabilitar item com bloqueio de uso, ActiveEffect,
  condição, atributo (com restauração), macro; reparo desfaz o reversível.
- **Recompensas (0.4):** RollTable ou item direto a quem quebrou; pool + resumo.
- **API externa:** `api.on(...)` e eventos `partBreak/partSever/partDamage/...`.
- **Visual (0.5):** 7 temas de anúncio (fontes OFL embutidas), tremor/flash/
  estilhaços/cascata/screen shake, movimento reduzido, en + pt-BR.

## Comparação com a anterior

Sem anterior — baseline do projeto. A partir da próxima versão, cada pasta
`releases/vX.Y.Z/` guarda o zip daquela versão e este arquivo compara com a
versão publicada imediatamente antes.

## Pacote

- `monster-anatomy.zip` — conteúdo de `dist/` na 1.0.0 (manifest na raiz).
- Testada em Foundry v14 build 364 + dnd5e 5.3.3 (compat declarada 14/14).
