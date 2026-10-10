# Card #161 — ilhas com 20x a área (mundo padrão de 280)

O raio das ilhas é proporcional ao lado do mundo, então 20x em área pede lado de 60 x raiz de 20 (cerca de 268). 270 deu razão entre 19,6x e 20,7x, sem margem; o padrão passou a **280** ((280/60)^2 = 21,8).

Reprodução: `npx vitest run tests/unit/worldDefault.test.ts tests/unit/islandEconomy.test.ts` e `npx vitest run tests/perf/archipelagoBenchmark.test.ts`.
Ambiente: macOS arm64, 8 núcleos, Node 25.6.1, Vitest 5.0.2.

## Área (varredura do mapa gerado, 280 contra 60, mesma semente)

Medida em 270 antes de subir para 280: terra caminhável 19,6x, 20,3x e 20,5x (sementes 4242, 1, 42). Em 280 o teste exige no mínimo 20x tanto na terra caminhável quanto na área útil somada das quatro natais, nas três sementes.

## Viabilidade

Sementes 4242, 1 e 42 geram mundo viável na primeira tentativa, com 3 sítios de capital por natal, e `islandEconomy` confirma que toda natal sustenta a jornada em 280 (seis sementes).

## Desempenho (120 unidades na ilha natal, semente 4242)

| Mundo | 1º tick (ordem em massa) | Tick p50 / p95 |
| --- | --- | --- |
| 60 | 6,5 ms | 0,54 / 0,66 ms |
| 192 | 24,5 ms | 0,45 / 1,01 ms |
| 280 | 35,6 ms | 0,38 / 0,53 ms |
| 384 | 67,2 ms | 0,41 / 0,56 ms |
| 768 | 127,9 ms | 0,43 / 0,74 ms |

O orçamento de 50 ms por tick vale para 280 (36 ms).

## Limites

- Uma semente e 120 unidades; não há medição de partida inteira com várias ordens nem com quatro jogadores reais.
- O mapa 3D e a névoa em 280 não foram medidos em quadros por segundo.
- Gerar o mundo leva cerca de 0,25 s (contra 0,05 s em 60).
