# ADR-0010: Decisões de escala, rede e economia colonial do alpha

## Status

Aceito e implementado — 2026-10-10 · **Não validado por jogador.** Cards [#75](https://github.com/martinsmiguel/terrinha/issues/75),
[#76](https://github.com/martinsmiguel/terrinha/issues/76), [#68](https://github.com/martinsmiguel/terrinha/issues/68),
[#77](https://github.com/martinsmiguel/terrinha/issues/77), [#78](https://github.com/martinsmiguel/terrinha/issues/78),
[#52](https://github.com/martinsmiguel/terrinha/issues/52), [#53](https://github.com/martinsmiguel/terrinha/issues/53).

## Contexto

O alpha ampliou o mundo (60 a 1024 células), ganhou colônias com estoques próprios e precisou de rede que não revele o mundo inteiro a cada
convidado. As decisões abaixo foram tomadas com medição em terreno real; as medições estão em `docs/evidence/`.

## Decisão

| Tema | Decisão | Estado |
| --- | --- | --- |
| Snapshot | O host envia a cada convidado um snapshot filtrado pela visão dele (`src/game/snapshotFilter.ts`); o servidor entrega só ao destinatário. | Implementado |
| Deltas | Pacotes `full`/`delta` com `sessionId`, `seq`, `base` e `rulesRevision`; buraco ou revisão desconhecida pede ressync (`src/game/snapshotDelta.ts`). Medido: 95,6% menos bytes (`docs/evidence/card-53/`). | Implementado |
| Compressão | Mantida: economiza 91,9% (completo) e 95,8% (delta) com ~+1 ms de latência, em loopback. | Medido só em loopback |
| Estoques | Estoque por (dono, ilha); a metrópole usa `playerResources`; só o saldo local paga ação local (`src/game/depots.ts`). | Implementado |
| Navegação | HPA* dispensado: A* com peso único e cache versionado fica abaixo de 6 ms (p99) até o mundo 768; campo de fluxo para grupos de 6 ou mais (`src/game/movement/flowField.ts`). | Implementado, decisão a confirmar |
| Escala suportada | Suporte garantido até o mundo 192; 384 e 768 são experimentais (engasgo único na primeira ordem em massa). | Documentado |

## Consequências

- O ADR-0002 (Socket.IO) segue válido; o canal agora carrega pacotes sequenciados por destinatário.
- O ADR-0004 foi atualizado: a visão autoritativa do host (ADR-0009) decide o que cada convidado recebe.
- Nada aqui foi validado por jogador em LAN real; isso é o gate do alpha (#89).
