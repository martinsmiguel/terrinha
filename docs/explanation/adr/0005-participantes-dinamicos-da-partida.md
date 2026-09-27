# ADR-0005: Participantes dinâmicos da partida (2 a 4 jogadores)

## Status

Aceito — 2026-09-27 · Implementado nos cards #13 e #17

## Contexto

O código original assumia `player1` contra `player2`: a condição de vitória
checava só as duas casas, a IA controlava apenas o `player2`, o mapa gerava
exatamente duas bases e um jogador que entrasse depois ficava sem base inicial.

O card #13 introduziu `MatchStatus` em `victory.ts`; o #17 pediu partida com
3 e 4 jogadores, o que tornaria insustentável qualquer lista fixa de slots.

## Decisão

Tratar os participantes como **conjunto mutável de slots**:

- `MatchStatus.players` é a fonte da verdade de quem joga a partida; o fim é
  avaliado quando restam menos de 2 participantes ou quando um slot é
  destruído (guarda contra partida "fantasma").
- O mapa nasce com **4 spawns válidos** (`proceduralMap.ts`), todos em planície,
  afastados de árvores/pedreiras (`distToAnySpawn`), para qualquer combinação.
- `soloMatchSlots(humanSlot, matchSize)` define quem é o inimigo no Treino Solo
  (2, 3 ou 4 jogadores — seletor no lobby).
- A base inicial é construída **por slot** (`buildStarterBase(slot, spawn)`), e
  quem entra no multiplayer recebe a própria base ao entrar
  (`spawnStarterBaseFor(slot)`), em vez de nascer no mapa vazio.
- A IA roda para **todos os slots não humanos**, não só para o `player2`.

## Consequências

- Pro: lobby com 2/3/4 jogadores sem mudar a regra de fim de partida.
- Pro: jogador que entra atrasado já joga — sem "nascido sem casa".
- Pro: `victory.ts` continua puro e testado com qualquer número de slots.
- Contra: sem espectador, sem reconexão de slot, sem times.
- Contra: spawns são fixos no mapa — balanceamento por recursos não é avaliado.

## Alternativas descartadas

- **Manter 1v1 e simular 3º/4º jogador como IA**: não é partida multiplayer de
  verdade — rejeitado pelo card #17.
- **Slots fixos `player1..player4` sempre presentes**: jogadores ausentes
  apareciam como bases vazias e a vitória não tinha como saber quem saiu.
