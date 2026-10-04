# ADR-0007: Geografia sincronizada por semente e exploração local

## Status

Aceito — 2026-10-04 · Implementado nos cards #38, #39, #40 e consolidado no #41

## Contexto

A épica de expansão por arquipélago ([#37](https://github.com/martinsmiguel/terrinha/issues/37))
introduziu quatro ilhas, transporte naval e mapa-múndi. Isso levantou três
perguntas de integração que o código precisava responder de forma explícita:

1. **Como todos os jogadores veem a mesma geografia?** Cada cliente gera o
   próprio terreno procedural; sem uma semente compartilhada, as ilhas
   divergiriam e um movimento válido no host seria água no cliente.
2. **O que é "ilha descoberta"?** O mapa-múndi e o minimapa precisam mostrar
   só o que o jogador viu, mas a névoa vive no cliente (ADR-0004), não no
   `GameState`.
3. **O que viaja na rede?** Unidades embarcadas em barcos e a fila de
   comandos de comércio/transporte precisavam de autoridade clara.

## Decisão

- **A semente do mundo é estado da partida.** O host/single gera o mapa com
  `generateProceduralTerrain(MAP_SIZE)` e grava a semente em
  `GameState.mapSeed`. O snapshot de 20 Hz carrega a semente; o cliente só
  regenera terreno quando ela difere da local (`applyTerrainSeed`). O layout é
  determinístico (`computeArchipelago` usa `SeededRandom(seed + 7)`), então
  semente iguais ⇒ mesmas ilhas, costas, rios e spawns em qualquer processo.
- **A exploração é derivada, nunca sincronizada.** Cada cliente mantém sua
  grade de névoa (`visionGridRef`, `Uint8Array` 60×60) recalculada a cada tick
  a partir das suas unidades próprias — mesmo comportamento do ADR-0004 para o
  terreno 3D. "Ilhas descobertas" (`isIslandDiscovered`) e o clique no
  mapa-múndi (`worldMapClickTarget`) são funções puras sobre essa grade; não
  existe campo de exploração em `GameState`. Consequência: em partida em rede
  cada jogador tem seu próprio mapa-múndi, coerente com o que sua névoa viu.
- **Autoridade de comandos no host, com carimbo do servidor.** Todo comando
  (inclusive `embark`, `disembark` e `trade`) passa por
  `isValidNetworkCommand` (forma) e `isAuthorizedPlayerCommand` (posse, custo
  e regras) antes de `handleIncomingCommand`; o servidor injeta o
  `playerSlot` autenticado na chegada (`socketServer.ts`), então o dono de um
  comando não é escolhível pelo cliente.
- **Passageiros são dados aninhados do estado.** `Unit.passengers` e
  `Unit.embarkTargetId` são objetos/valores plain-JSON dentro do
  `GameState`, então sobrevivem ao `JSON.stringify` do snapshot sem esquema
  próprio. Unidades embarcadas saem da lista de unidades ativas (não colidem
  nem recebem ordens terrestres) e voltam ao mundo no desembarque.
- **Geometria compartilhada entre superfícies.** Minimapa, mapa-múndi e câmera
  usam a mesma projeção (`mapProjection.ts`), garantindo que um clique em
  qualquer tela aponte para a mesma célula do mundo.

## Consequências

- Alterar o gerador sem manter a determinismo por semente quebra a partida em
  rede silenciosamente (os clientes passam a ver outra ilha) — os testes de
  `archipelago.test.ts`/`proceduralMap.test.ts` cobrem esse contrato.
- A névoa não sobrevive a recarregar a página nem é compartilhada entre
  observadores; é aceito para o modelo por-cliente.
- O tamanho do mapa continua fixo em 60×60 (ver ADR-0004): `mapSeed` permite
  regenerar o mundo, não redimensioná-lo.
- Clientes maliciosos não conseguem revelar área nem forjar donos de
  comandos, mas o snapshot completo ainda confia no host (model de
  confiança — ADR-0002).
