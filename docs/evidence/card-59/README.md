# Evidências do card #59

Medições feitas no navegador (Chromium embutido), `npm run dev`, rota `/poc.html`
(partida solo), com `docs/evidence/card-59/medir-hud.js`. Cada viewport foi recarregado
antes da medição. Limite: contraste calculado sobre fundo escuro assumido onde o HUD é
translúcido sobre o canvas 3D; em fundo opaco o valor é exato.

| Viewport | Header cabe | Altura do header | Menus de recurso cabem | Falhas de contraste (HUD / catálogo / zonas) | Alvos < 24 px | Alvos < 44 px |
| --- | --- | --- | --- | --- | --- | --- |
| 1920x1080 | sim | 8% | 4 de 4 | 0 / 0 / 0 | 1* | 14 de 18 |
| 1366x768 | sim | 19% | 4 de 4 | 0 / 0 / 0 | 1* | 14 de 18 |
| 414x896 | sim | 25% | 4 de 4 | 0 / 0 / 0 | 1* | 16 de 16 |
| 375x667 | sim | 33% | 4 de 4 | 0 / 0 / 0 | 1* | 16 de 16 |

\* O botão "Selecionar Aldeão Ocioso" tinha 21 px de altura; corrigido para o piso de 24 px
depois desta medição (commit de ajuste do botão). Os alvos abaixo de 44 pt continuam como
limite conhecido para toque (ver ADR-0008).

## Antes e depois do contraste (1440x900, mesmo script)

Antes: 2 falhas no HUD, 20 no catálogo, 2 nas zonas (texto `slate-500` pequeno, `bg-amber-600`
com texto branco a 3,2:1, ornamentos decorativos a 2,2:1 e o botão "Ocioso" com
`animate-pulse`, cuja opacidade oscilava o contraste entre 3,8 e 4,4:1).
Depois: 0 falhas nos três estados em todos os viewports acima.

## Comportamento verificado por eventos reais de teclado

Com mapa-múndi aberto: `K` não abre o catálogo; `Esc` fecha só o mapa; `K` abre o catálogo com o
foco dentro dele; `Z` fica bloqueado com o catálogo aberto; `Ctrl+K` não abre nada; `Esc` fecha.
No tutorial: `Tab` alterna só entre "Próximo" e "Pular" (12 tentativas, 0 saídas do diálogo).
Testes automatizados: `tests/unit/hotkeys.test.ts` e `tests/unit/focusTrap.test.ts`.

## Critérios do card

| Critério | Estado |
| --- | --- |
| Registro central sem colisões; `M` documentado | Atendido (`hotkeys.ts`, teste de colisão, `comandos-teclado.md`) |
| Ctrl/Cmd/Alt não disparam comandos | Atendido (teste unitário e `engine.ts`) |
| Overlay bloqueia câmera e atalhos; Esc fecha o mais recente | Atendido (teste unitário com 7 combinações e verificação no navegador) |
| Tab preso, foco devolvido, controles nativos preservados | Atendido nos 4 diálogos; retorno de foco medido no navegador só com gatilho por clique ainda por registrar |
| Foco visível, rótulos, `aria-pressed`, anúncio de estado | Atendido para câmera, modos de HUD e cards de recurso; demais painéis não auditados |
| Contraste >= 4,5:1 renderizado | Atendido nos 4 viewports (tabela acima) |
| Decisão sobre escala, AAA, daltonismo e remapeamento | Registrada no ADR-0008; follow-ups ainda não abertos |
| Testes com overlays abertos | Atendido (`hotkeys.test.ts`, estados de overlay) |
| Prova por critério no SHA final, revisão | Pendente: SHA final e revisão independente |
