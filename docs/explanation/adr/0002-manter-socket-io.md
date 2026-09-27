# ADR-0002: Manter Socket.io com host autoritativo (por enquanto)

## Status

Aceito — 2026-09-27 · Em revisão no card de sincronização multiplayer

## Contexto

A [especificação](../../especificacao-v2.html) propõe P2P via WebRTC
(PeerJS) com **lockstep determinístico** (ticks coordenados entre pares,
comandos com tick alvo, checksum anti-divergência).

O código atual usa **Socket.io relayado pelo servidor** com modelo
**host-autoritativo**: o host roda a simulação e envia o `GameState`
completo ~20×/s; clientes enviam comandos e renderizam.

## Decisão

Manter o modelo Socket.io host-autoritativo enquanto o jogo roda em rede
local (LAN). Reavaliar somente quando (a) o bandwidth do estado completo
virar problema real, ou (b) o jogo precisar de partidas pela internet.

## Consequências

- ✅ Funciona em qualquer rede local sem descoberta NAT/ICE — ideal para
  "amigos vindo visitar".
- ✅ Sem necessidade de determinismo: o host é a única fonte de verdade.
- ✅ Servidor único (`server.ts`) já expõe `/api/lan-info` e sala por ID.
- ❌ Estado completo a cada mutação (~20×/s) — sem diff nem compressão.
- ❌ Partida morre se o host sair; sem predição de movimento no cliente.
- ❌ Cliente confia em comandos sem validação de posse/limites (ver card de
  validação de comandos).

## Alternativas descartadas

- **WebRTC + PeerJS**: mais complexo (signaling, ICE, NAT), PeerJS está
  instalado mas não é usado; seria introduzido em um card específico.
- **Lockstep determinístico**: exige simulação 100% determinística (A*,
  floating point estável) — refactor grande, adiado.
