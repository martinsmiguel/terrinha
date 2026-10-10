# Card #115 — acessibilidade do HUD: evidências

Ambiente: macOS arm64, Chromium do painel do app, Vite em `http://127.0.0.1:5173/poc.html` (partida solo), Vitest 5.0.2.
Reprodução dos testes: `npx vitest run tests/unit/hudAccessibility.test.ts`.

## Escala 75–200%

A escala muda o `font-size` da raiz, e o HUD (unidades rem do Tailwind) acompanha. A escala aplicada é limitada para que a largura da tela, em unidades do HUD, nunca fique abaixo de 375 (`effectiveScale`). Em 375 px a faixa útil é 75–100%; em 414 px, 75–110%; de 1366 px para cima, 75–200%.

| Viewport | Escolhida | Aplicada | Rolagem horizontal | Elementos fixos/absolutos fora da tela |
| --- | --- | --- | --- | --- |
| 1920×1080 | 200% | 200% | não | 0 |
| 1366×768 | 200% | 200% | não | 0 |
| 414×896 | 200% | 110% | não | 0 |
| 375×667 | 200% | 100% | não | 0 |

Limite: em 1366×768 a 200% o HUD ocupa boa parte da tela e a legenda do minimapa se sobrepõe levemente ao texto vizinho. Não vi corte nem vazamento, mas a legibilidade ali é apertada.

## Contraste

Medido em `tests/unit/hudAccessibility.test.ts` com os tokens do Tailwind usados nos painéis (fundos slate-950/900/800).

| Texto | slate-950 | slate-900 | slate-800 |
| --- | --- | --- | --- |
| slate-200 (principal) | 16,4 | 14,5 | 11,9 |
| slate-400 (secundário) | 7,9 | 7,0 (6,96) | 5,7 |
| slate-500 | 4,2 | 3,8 | 3,1 |
| red-400 (alerta) | 7,3 | 6,5 | 5,3 |
| slate-300 (alto contraste) | 13,6 | 12,0 | 9,9 |

**Decisão:** o padrão permanece AA (texto principal acima de 7:1; secundário entre 4,5:1 e 7:1) porque o texto secundário `slate-400` fica abaixo de 7:1 em fundos mais claros. AAA vira o modo opcional **Alto contraste**, que sobe `slate-400/500` para `slate-300` e `red-400` para `red-300`. Todos passam de 7:1 em todos os fundos medidos (teste automatizado).

Limite: `slate-500` (4,2 a 3,1) aparece em textos de apoio; no padrão ele não cumpre AA em todos os fundos. Fora do escopo deste card, mas registrado.

## Daltonismo

Filtro SVG `feColorMatrix` aplicado à página, com a matriz `I + S·(I − Sim)` (simulação de Machado 2009; daltonização clássica). Validação por simulação, com ΔE CIE76 entre pares de cores de status do HUD:

| Perfil | Par | Sem correção | Com correção |
| --- | --- | --- | --- |
| Protanopia | verde × vermelho | 23,3 | 70,0 |
| Deuteranopia | verde × vermelho | 18,6 | 63,0 |
| Tritanopia | verde × vermelho | 114,0 | 93,7 |

Em todos os perfis, todos os pares de status (verde, vermelho, âmbar, ciano, violeta) ficam acima de ΔE 15 com a correção (teste). A correção aproxima alguns pares que já estavam distantes (por exemplo âmbar × verde em deuteranopia: 63 → 18) para separar o par crítico verde × vermelho.

Limite: **simulação, não avaliação com pessoas daltônicas.** O estado do HUD já não depende só de cor (rótulos, ícones, `aria-pressed`, ADR-0008). O filtro também recolore o mapa 3D, o que pode custar desempenho em máquinas fracas.

## Remapeamento de teclas

Interface na janela **Controles → Acessibilidade do HUD**: clique na tecla, pressione a nova. Recusa teclas reservadas (Esc, Enter, Tab, modificadores, setas, WASD), mais de um caractere e conflito no mesmo escopo; o mesmo atalho pode repetir em escopos que nunca estão ativos juntos (ex.: `S` do quartel e a tecla de outro edifício). Persistência local validada: valor inválido ou conflitante é descartado ao carregar. Testado no navegador: `L` → `N` persistiu em `terrinha:hud-accessibility`.

Limite: o texto de ajuda da janela Controles ainda cita as teclas padrão; as teclas atuais aparecem na lista de remapeamento.

## Alvos de toque de 44 px

Em `(pointer: coarse)`, cada botão ganha uma área clicável de pelo menos 44×44 px por pseudo-elemento, sem mudar o visual. Medido em 375×667 com emulação de toque, clicando a ~21 px do centro de cada um dos 23 botões menores que 44 px: 13 aceitam o clique nas quatro direções; 10 perdem um lado para um botão vizinho colado (2 a 3 de 4 direções). Nenhum ficou com menos de 2 direções.

Limite: em barras densas, botões adjacentes dividem a área entre si; não foi testado em dispositivo físico.
