# ADR-0008: Acessibilidade do HUD — o que entra agora e o que fica adiado

## Status

Proposto — 2026-10-10 · Card [#59](https://github.com/martinsmiguel/terrinha/issues/59)

## Contexto

O card #59 exige, antes da integração do HUD, atalhos sem colisão, overlays que
bloqueiam o fundo, foco gerenciado, contraste AA medido e uma decisão registrada
sobre escala 75-200%, contraste AAA, perfis de daltonismo e remapeamento completo.
Os estudos do repositório de planejamento (`estudos/Estudo de HUD para RTS.md` e a
PoC `pocs/hud-interface`) pedem HUD desacoplado de resolução fixa, elementos
persistentes mínimos e perfis visuais, e a PoC já mediu contraste, foco e colisão
em três viewports.

## Decisão

**Entra neste card**

- Registro único de atalhos em `src/game/hotkeys.ts`, com a colisão do `M` resolvida
  e declarada (cais selecionado treina o barco mercante; o minimapa usa o botão).
- Modificadores, controles nativos e overlays tratados no mesmo resolvedor, no
  `App.tsx` e no teclado da câmera do `engine.ts`.
- Diálogos com `role="dialog"`, foco preso, retorno ao gatilho e rolagem própria em
  telas baixas; região `aria-live` para as notificações; `aria-pressed` nos modos.
- Contraste AA (4,5:1 texto normal, 3:1 texto grande) medido no pixel renderizado em
  1920x1080, 1366x768, 414x896 e 375x667.
- Encaixe responsivo: cards de recurso compactos abaixo de `sm`, barras que quebram
  linha, menus presos às bordas e minimapa recolhido por padrão em tela estreita.
- Movimento respeita `prefers-reduced-motion`.

**Adiado, com motivo**

| Item | Decisão | Motivo | Dependência |
| --- | --- | --- | --- |
| Escala própria do HUD 75-200% | Adiado | O HUD usa unidades fixas do Tailwind. Zoom de navegador a 200% em 1366 de largura equivale a cerca de 683 px CSS, entre os viewports medidos, mas não há controle de escala do jogo. | #97 (personalização local) |
| Contraste AAA 7:1 | Adiado | AA cumprido e medido; AAA exige revisar a paleta inteira. | Avaliação humana (#56) |
| Três perfis de daltonismo | Adiado | Estado não depende só de cor (rótulos, ícones, `aria-pressed`), mas faltam perfis e validação com simulação. | #97 |
| Remapeamento completo de teclas | Adiado | O registro único torna viável; falta a interface e a persistência. | #88/#97 |

## Consequências

- Mudar um atalho passa a ser editar uma linha da tabela e o teste de colisão garante
  que nenhuma tecla fica ambígua sem declaração.
- Alvos de toque do HUD ainda ficam abaixo de 44 pt em celular (todos acima do piso
  AA de 24 px); ampliar a área de toque entra com a avaliação em dispositivo real.
- Os quatro adiamentos precisam de card próprio antes do aceite do #59; este ADR
  não os fecha.
