# Explicação: arquitetura geral

> Quadrante **Explicação** — entenda o como e o porquê.
>
> Esta página descreve o **código atual**. O compromisso de produto da entrega
> `v0.8.0-alpha.1` — seis ilhas amplas, fundação por carroça, vida por fase,
> física de profundidade, ponte, bots e settings — está no
> [contrato da alpha](contrato-alpha.md).

## Visão em uma frase

O Terrinha é um RTS de navegador com **simulação autoritativa no host**:
quem hospeda roda o jogo, transmite o estado completo 20×/s por Socket.io, e
os clientes apenas renderizam e enviam comandos de volta.

## Peças

```
src/
├── main.tsx             → bootstrap React
├── App.tsx              → lobby, HUD, input e wiring (~3,3 mil linhas após o card #14)
├── components/          → UI React (GameHeader, GameDialogs, SelectionPanel, Minimap, WorldMapModal…)
├── hooks/               → useSceneSynchronization (cena Three vs GameState)
└── game/                → regras de jogo em módulos puros (ver ADR-0003)
    ├── engine.ts        → cena Three.js, câmera, tipos do domínio (GameState…)
    ├── simulation.ts    → tick puro: movimento, coleta, combate, IA, treino
    ├── archipelago.ts   → layout determinístico de 4 ilhas por semente
    ├── proceduralMap.ts → terreno do arquipélago: biomas, rios, 4 spawns
    ├── navalTransport.ts → embarque/desembarque de unidades em barcos
    ├── worldMap.ts      → regras do mapa-múndi (descoberta, clique, névoa)
    ├── mapProjection.ts → projeção única mundo ↔ pixel (minimapa/mapa-múndi)
    ├── buildingCatalog.ts → catálogo puro dos 8 edifícios (custos, footprint, HP, duração)
    ├── buildingScaffold.ts → andaimes e prévia 3D (Three), consomem o catálogo
    ├── buildingGhost.ts → posicionamento válido (cliff/água/inclinação/colisão)
    ├── economy.ts       → custos de unidades/edifícios, compra/venda, reembolso
    ├── victory.ts       → MatchStatus, participantes, fim de partida
    ├── tech.ts          → eras, tecnologias, fila e efeitos (ADR-0006)
    ├── visibility.ts    → grade de névoa 60×60 (ADR-0004)
    ├── population.ts    → limite de população
    ├── networkCommands.ts → validação/autorização de comandos do cliente
    ├── movement/        → A* (pathfinding) e separação de unidades
    ├── workZone.ts      → hologramas de zona de trabalho
    ├── particles.ts     → partículas de dano/construção/marcadores de ordem
    ├── healthBar.ts     → barras de vida 3D (billboard)
    ├── audio.ts         → sons 100% sintetizados (WebAudio)
    └── multiplayer.ts   → cliente Socket.io (join, broadcast, comandos, chat)

server.ts                → Express + Socket.io + Vite middleware, porta 3000
tests/unit/              → 182 testes Vitest cobrindo os módulos puros
```

## Fluxo de uma partida

1. **Lobby** — host cria sala, clientes entram com ID (`join-room`); o seletor
   define a partida como 2, 3 ou 4 jogadores (ver [ADR-0005](adr/0005-participantes-dinamicos-da-partida.md)).
2. **Boot** — host/single gera o arquipélago a partir de uma semente grava em
   `GameState.mapSeed`, com 4 spawns (um por ilha), base inicial por slot
   (Centro da Vila + aldeões + soldado) e recursos ao redor. O cliente regera
   o mesmo terreno a partir da semente recebida — ver [ADR-0007](adr/0007-geografia-por-semente-e-exploracao-local.md).
3. **Tick (20 Hz, só no host)** — `App.tsx` roda `setInterval(50ms)`:
   movimento (A* + separação), coleta (com bônus de edifícios/tecnologias),
   combate, manutenção (reparo/demolição), filas de treino e de pesquisa,
   torres, névoa e IA de todos os slots não humanos.
4. **Broadcast** — a cada mutação o host envia o `GameState` completo
   (com compressão acima de um limite, card #21) → servidor repassa
   (`game-state-update`) → clientes fazem `setGameState` e recalculam sua
   névoa localmente (a descoberta de ilhas é derivada dessa grade, nunca um
   campo sincronizado).
5. **Comandos** — cliente envia `send-command` → host valida posse/custo em
   `networkCommands.ts` e aplica em `handleIncomingCommand` (mover, gather,
   build, train, attack, repair, demolish, research, … ).

## Por que host-autoritativo (e não P2P/lockstep)?

Simplicidade para rodar em casa: um processo, sem sincronização determinística,
sem checksum. Custo: o host envia estado completo ~20×/s (sem diff) e a
partida depende do host. Ver [ADR-0002](adr/0002-manter-socket-io.md).

## Caminho evolutivo

A [especificação](especificacao-v2.html) descreve o alvo: **Plugin Host +
Event Bus**, simulacao desacoplada de renderização e testes por módulo. O
caminho é incremental — cada card do quadro move o código na direção do alvo
sem perder a jogabilidade. Ver [ADR-0001](adr/0001-evoluir-prototipo.md).

Os módulos puros já extraídos (economia, vitória, névoa, tecnologias,
movimento, validação de comandos) são o núcleo reusável de um futuro host
desacoplado — ver [ADR-0003](adr/0003-modulos-puros-testaveis.md).

## Conhecidas limitações

- O `GameState` é enviado **completo** 20×/s (com compressão acima do
  limite, card #21), sem diff incremental.
- Sem predição de movimento no cliente: ordens demoram ~1 RTT para aparecer
  (exceto o débito otimista de treino/comércio, reconciliado pelo snapshot).
- A IA é simples (mesma estratégia para todos os slots não humanos), restrita
  à própria ilha, sem dificuldade configurável.
- O tamanho do mapa é fixo em **60×60** (`MAP_SIZE`): o gerador aceita outros
  tamanhos, mas comandos, névoa e HUD ainda assume 60 (ADR-0004).
- Sem espectador, reconexão de slot nem observação de partida em andamento.
- Eras/tecnologias são um catálogo único (sem civilizações/estratégias).
