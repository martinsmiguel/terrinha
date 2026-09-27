# Explicação: arquitetura geral

> Quadrante **Explicação** — entenda o como e o porquê.

## Visão em uma frase

O Terrinha é um RTS de navegador com **simulação autoritativa no host**:
quem hospeda roda o jogo, transmite o estado completo 20×/s por Socket.io, e
os clientes apenas renderizam e enviam comandos de volta.

## Peças

```
src/
├── main.tsx            → bootstrap React
├── App.tsx             → "god component": lobby, HUD, input, tick de simulação
├── components/         → UI React (Minimap, ResourceNavMenu, EmpireCatalogModal)
└── game/
    ├── engine.ts       → cena Three.js, câmera, tipos do domínio (GameState…)
    ├── proceduralMap.ts→ mapa: Perlin próprio, ilha, rio, biomas, recursos
    ├── buildingDefs.ts → catálogo dos 8 edifícios + andaimes
    ├── buildingGhost.ts→ posicionamento válido (cliff/água/inclinação/colisão)
    ├── workZone.ts     → hologramas de zona de trabalho
    ├── particles.ts    → partículas de dano/construção/marcadores de ordem
    ├── healthBar.ts    → barras de vida 3D (billboard)
    ├── audio.ts        → sons 100% sintetizados (WebAudio)
    └── multiplayer.ts  → cliente Socket.io (join, broadcast, comandos, chat)

server.ts               → Express + Socket.io + Vite middleware, porta 3000
```

## Fluxo de uma partida

1. **Lobby** — host cria sala, clientes entram com ID (`join-room`).
2. **Boot** — host/single gera mapa procedural + TCs + unidades iniciais.
3. **Tick (20 Hz, só no host)** — `App.tsx` roda `setInterval(50ms)`:
   movimento, coleta, combate, filas de treino, torres, IA do player2.
4. **Broadcast** — a cada mutação o host envia o `GameState` completo →
   servidor repassa (`game-state-update`) → clientes fazem `setGameState`.
5. **Comandos** — cliente envia `send-command` → host aplica em
   `handleIncomingCommand` ( mover, gather, build, train, attack, … ).

## Por que host-autoritativo (e não P2P/lockstep)?

Simplicidade para rodar em casa: um processo, sem sincronização determinística,
sem checksum. Custo: o host envia estado completo ~20×/s (sem diff) e a
partida depende do host. Ver [ADR-0002](adr/0002-manter-socket-io.md).

## Caminho evolutivo

A [especificação](especificacao-v2.html) descreve o alvo: **Plugin Host +
Event Bus**, simulacao desacoplada de renderização e testes por módulo. O
caminho é incremental — cada card do quadro move o código na direção do alvo
sem perder a jogabilidade. Ver [ADR-0001](adr/0001-evoluir-prototipo.md).

## Conhecidas limitações

- `App.tsx` concentra ~6300 linhas (simulação + UI + input) — alvo de extração.
- Movimento em linha reta com desvio simples (sem A* real, sem colisão unitária).
- Névoa de guerra só no minimapa.
- Sem condição de vitória/derrota; sem tecnologias/eras.
- `pop` não decrementa ao perder unidades (bug conhecido, card dedicado).
