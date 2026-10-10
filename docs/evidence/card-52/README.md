# Evidências do card #52 (fatia A052-BASE)

Medições reproduzíveis com `npm run bench` (relatório bruto em `benchmark.json`). Hardware: Apple M1,
8 núcleos, 8 GB, Node v22.23.1, darwin/arm64. Sementes: 1, 42, 777777.
Orçamento: 50 ms por passo (20 Hz). Os números são de uma máquina de desenvolvimento; a CI roda o mesmo
ensaio como teste e falha se p95 estourar o orçamento.

## Movimento em massa (mapa procedural real 60x60, bloqueios, path cache, ordem para todos)

80% dos destinos alcançáveis e 20% em outra ilha (pior caso do A*). Duzentos passos por cenário.

| Unidades | Seed | Latência da ordem em massa (ms) | Tick p50 (ms) | Tick p95 (ms) | Em marcha no passo 20 |
| --- | --- | --- | --- | --- | --- |
| 120 | 1 | 24.3 | 0.43 | 0.82 | 115 |
| 120 | 42 | 17.6 | 0.44 | 0.76 | 119 |
| 120 | 777777 | 12.0 | 0.43 | 0.92 | 119 |
| 240 | 1 | 18.5 | 0.96 | 1.54 | 234 |
| 240 | 42 | 20.5 | 0.97 | 1.48 | 234 |
| 240 | 777777 | 20.1 | 0.96 | 1.39 | 237 |

A "latência da ordem" é o primeiro passo após emitir a ordem para todos: nele se calculam todos os caminhos. É o pior
caso observado (12 a 32 ms), abaixo do orçamento de 50 ms, mas com pouca folga a 240 unidades.

## Tamanhos de mapa (gerador e A*)

| Mapa | Geração (ms) | A* p50 (ms) | A* p95 (ms) |
| --- | --- | --- | --- |
| 60x60 | 9.7 | 0.04 | 0.18 |
| 90x90 | 9.7 | 0.09 | 0.26 |
| 120x120 | 16.2 | 0.07 | 0.16 |

**Tamanho suportado pelo produto: 60x60.** `MAP_SIZE`, o limite de posição da validação de rede e o grid de névoa são
fixos em 60. O gerador e o A* aceitam 90 e 120, mas o passo completo da simulação só está validado em 60; ampliar o
mundo é escopo do #65 e exige revalidar (fatia A052 completa).

## Ciclo naval sem cheats (seed 42)

Cais construído por aldeão, barco mercante treinado pela fila, 2 aldeões embarcados por aproximação, viagem do barco até
a costa da outra ilha e desembarque em terra firme dessa ilha (2 unidades).

| Fase | Passos | Tick p95 (ms) | Tick máx (ms) |
| --- | --- | --- | --- |
| construcao-do-cais | 301 | 0.010 | 0.135 |
| treino-do-barco | 50 | 0.018 | 0.128 |
| embarque | 1 | 0.120 | 0.120 |
| viagem | 251 | 0.005 | 0.144 |

## Gargalo encontrado e corrigido

O ensaio expôs um defeito antigo (presente antes do #114): o barco ficava parado, oscilando entre dois pontos da rota,
e a viagem entre ilhas nunca terminava. `nextWaypoint` procurava o primeiro ponto a mais de 0,35 de distância desde o
início da lista, sem descartar os já alcançados; ao se aproximar do ponto 0 a unidade passava a mirar o ponto 1, que a
puxava de volta, e voltava ao ponto 0. A correção (`consumeReachedWaypoints`) descarta os pontos alcançados, e o teste
de regressão em `tests/unit/pathfinding.test.ts` reproduz o caso numérico exato.

## Decisão sobre o limite

Dentro do orçamento de 50 ms: 120 e 240 unidades em marcha no mapa 60x60 (p95 abaixo de 2 ms por passo; pico de 32 ms ao
emitir ordem para 240 de uma vez). Além disso, ou com mapas maiores, o pico de caminhos simultâneos passa a pesar; isso
fica para os cards #77 (navegação hierárquica) e #78 (campos de fluxo para grupos), que dependem do mundo ampliado (#65).

## Limites desta fatia

Esta é a linha de base antes de ampliar o mundo. A validação final (A052) depende de #65, #77, #78, #99 (N02-02) e
#98 (N01-02) e deve repetir `npm run bench` no SHA final, com revisão. Nada aqui mede latência de rede nem renderização.
