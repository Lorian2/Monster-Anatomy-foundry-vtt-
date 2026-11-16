# v1.2.0 — Notas de release (2026-09-22)

## O que entrou (resumo)

- **Imagens por parte:** campo com FilePicker + preview no editor; thumbnails no
  painel, tracker e seletor; imagem viaja junto nos modelos.
- **Adição rápida na mira:** nome + imagem opcional + `+` cria a parte na hora.
- **Seletor em lista direta:** imagem + texto por parte, um toque seleciona.

## Comparação com a anterior (v1.1.0)

A 1.1.0 tinha: modelos, mira por dialog de texto, CA secreta, nota de dano,
bônus global + por parte, itens diretos.

Mudanças de comportamento a notar:
- A mira ganhou quick-add com imagem e thumbs na lista.
- O mapa corporal SVG experimental foi revertido para lista direta por
  robustez (cliques nativos em `<button>`); uma investigação com pesquisa não
  achou causa conclusiva remota. Dados de zona/layout/arte custom preservados
  nos flags, sem UI — podem voltar numa forma mais simples.
- Editor ganhou campo de imagem; painel/tracker/lista exibem thumbs.

## Pacote

- `monster-anatomy.zip` — conteúdo de `dist/` na 1.2.0 (manifest na raiz).
- Compat declarada 14/14; testada em Foundry v14 build 364 + dnd5e 5.3.3.
