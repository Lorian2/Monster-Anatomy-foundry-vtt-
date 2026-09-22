# Changelog — Monster Anatomy

Todas as mudanças notáveis deste módulo. Formato inspirado no Keep a Changelog.

## [1.0.0] — 2026-09-22

Primeira release pública. Testada em Foundry VTT v14 (build 364) com dnd5e 5.3.3.

### Anatomia e combate
- Partes anatômicas por ator (nome, CA, HP, estados, flags quebrável/cortável)
- Painel de anatomia (GM), editor de partes, tracker de combate e resumo pós-batalha
- Seleção de parte ao mirar; ataque avalia contra a CA da parte (crítico/fumble)
- Dano roteado automaticamente (parte + global por modelo: independente, compartilhado, percentual)
- Multiplayer com autoridade do GM via sockets (anúncio sincronizado em todas as telas)

### Ruptura, corte e hitzones
- Part Break com anúncio, chat, efeito no token e som opcional
- Severing com pool de corte independente e identidade SEVERED própria
- Hitzones: multiplicadores por tipo de dano (lista do sistema)
- Vinculações ao quebrar: desabilitar item/ataque (com bloqueio de uso), ActiveEffect,
  condição, atributo (com backup/restauração), macro; reparo desfaz o reversível

### Recompensas e API
- Recompensas por ruptura/corte: sorteio em RollTable ou item direto a quem quebrou
- Pool persistente + resumo com limpeza; API pública (`game.modules.get(...).api`)
  e eventos `partBreak`, `partSever`, `partDamage`, `partsChanged`, `panelRender`

### Visual
- 7 temas de anúncio (Persona, Monster Hunter, JRPG, Minimalista, Impacto, Arcade,
  Entalhado) com fontes OFL embutidas; manchetes customizáveis
- Tremor no token, flash de tela, estilhaços, letras em cascata, screen shake
- Movimento reduzido, toggles individuais e suporte a `prefers-reduced-motion`
- Localização en + pt-BR
