# ADR-0009: Visão autoritativa por dono no host

## Status

Aceito e implementado — 2026-10-10 (sem validação humana) · Card [#74](https://github.com/martinsmiguel/terrinha/issues/74); reconciliação em [#94](https://github.com/martinsmiguel/terrinha/issues/94)

## Contexto

A névoa de guerra existia só no cliente (ADR-0004): cada jogador calculava e desenhava a própria visão, e o host
autorizava comandos e escolhia alvos de perseguição, torre e IA sem consultar visão. Na prática o jogo "enxergava" o
que o jogador não via: a torre atirava em qualquer inimigo a 12 de distância, a perseguição seguia o alvo sob névoa e
a IA marchava contra um Centro que nunca descobrira.

## Decisão

- **O host mantém, por dono (jogador ou IA), a visão atual e a exploração** (`OwnerVision`, `src/game/visionAuthority.ts`).
  A grade é atualizada a cada passo a partir das unidades (inclusive barcos) e edifícios do dono. Não faz parte do
  `GameState` transmitido: fica na memória do host.
- **Conhecimento de alvos:** inimigo (unidade) só pode ser atacado e perseguido enquanto **visível**; edifício inimigo,
  recurso e terreno de construção exigem **exploração** (a posição não muda). Entidades próprias são sempre conhecidas.
  Mover para território desconhecido continua permitido (é como se explora).
- **Onde se aplica:** autorização de `attack`, `gather`, `build` e `found_capital` (`isAuthorizedPlayerCommand` recebe a
  visão), perseguição de ataque, alvo da torre, busca do próximo recurso e a IA (coleta e marcha).
- **O cliente só renderiza a névoa:** continua calculando a própria grade para desenhar, pela mesma função de fontes de
  visão (`visionSourcesFor`), sem poder de decisão.
- **Sem visão informada nada é filtrado** (testes e usos legados); o host sempre a informa.

## Consequências

- A IA só age sobre o que descobriu. Como não explora e as ilhas são separadas por mar, hoje ela não ataca; a exploração
  pela IA fica para o card de incursões (#101).
- O estado transmitido ainda contém todas as entidades e os estoques de todos os donos: o filtro por área de interesse é
  o card #75. Até lá, a ocultação de inimigos em minimapa, mapa-múndi e cena depende da névoa do cliente.
- Nova autoridade a refletir em #94: `docs/explanation/adr/0004-nevoa-por-cliente-no-shader.md` descreve a névoa só no
  cliente; este ADR a complementa (host decide, cliente desenha).
