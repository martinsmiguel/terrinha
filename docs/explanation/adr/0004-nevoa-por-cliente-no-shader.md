# ADR-0004: Névoa de guerra calculada por cliente e aplicada no shader do terreno

## Status

Aceito — 2026-09-27 · Implementado no card #16

**Atualização 2026-10-10:** parcialmente superado pelo [ADR-0009](0009-visao-autoritativa-por-dono-no-host.md). A grade de névoa por cliente
continua sendo a forma de **desenhar** a névoa, mas o que o jogador pode **alvejar e saber** passou a vir da visão autoritativa do host, e o
snapshot de cada convidado é filtrado por essa visão ([#75](https://github.com/martinsmiguel/terrinha/issues/75)). O contexto abaixo é histórico
e descreve o que valia na data da decisão: antes de #75 o estado completo chegava a todos.

## Contexto

O estado completo do jogo chega a todos os clientes ~20×/s
([ADR-0002](0002-manter-socket-io.md)), portanto cada cliente já vê as
posições de **todas** as unidades — inclusive as inimigas. O minimapa antigo
tinha sua própria lógica de explorado/não explorado, mas o terreno 3D não
escondia nada: inimigos apareciam na cena antes de serem avistados.

Alternativas clássicas: enviar a máscara de névoa do host (custo de banda a
cada tick) ou esconder inimigos apenas na cena (minimapa vazando informação).

## Decisão

Cada cliente **calcula sua própria grade de névoa** a partir do `GameState`
recebido e a usa como textura do terreno:

1. `src/game/visibility.ts` mantém um grid 60×60 (`createVisionGrid`,
   `revealVision`, `expireVision`) com três níveis: nunca vista (`0`),
   explorada (`1`) e sob visão atual (`2`) — índice `x * size + z`, a mesma
   ordem do `exploredGrid` do minimapa.
2. O App chama `engine.setFogGrid(grid)` por frame; a grade vira um
   `DataTexture` 60×60 RGBA (uma cópia de 14,4 KB, sem custo de rede).
3. `applyFogToTerrain` injeta a textura no `MeshStandardMaterial` via
   `onBeforeCompile`, multiplicando a cor final pela canal vermelha — nível
   `0` = preto, `110` = semi-fog, `255` = visível.

Cena 3D e minimapa leem a mesma grade, então nunca há divergência entre o que
o terreno mostra e o que o minimapa marca.

## Consequências

- Pro: zero custo de rede — a névoa é apresentação, não simulação.
- Pro: não é preciso um shader custom do zero; luzes, sombras e materiais
  padrão do Three.js continuam funcionando.
- Pro: `visibility.ts` é puro e testado; a mesma grade serve de API para o
  minimapa e para a cena.
- Contra: um cliente modificado pode exibir inimigos — a simulação continua
  autoritativa no host (é só visibilidade visual, não vantagem de ação).
- Contra: a grade é fixa em 60×60 (1 célula por unidade de mundo); mapas
  maiores exigiriam resolução proporcional.

## Alternativas descartadas

- **Máscara de névoa enviada pelo host**: +20 pacotes/s de 14 KB — desperdício,
  já que o cliente tem os dados necessários.
- **Overlay de nuvens/partículas**: visual pior e mais caro em draw calls.
- **Esconder unidades inimigas na cena**: vazaria informação no minimapa e no
  HUD, além de quebrar áudio e efeitos.
