# Card #78 — gradiente compartilhado para grupos

Código: `src/game/movement/flowField.ts` (campo de custo mínimo por destino e seguimento do gradiente) e a escolha em `simulation.ts`
(`FLOW_GROUP_MIN = 6`: com seis ou mais unidades do mesmo corpo indo à mesma célula, um campo por (corpo, destino, versão da superfície)
serve o grupo; abaixo disso, ou se o campo não cobre o início, o A* individual segue como fallback seguro).

Testes: `tests/unit/flowField.test.ts` (custo igual ao do A* inclusive no raso, sem cruzar parede/lago nem cortar canto, fallback, invalidação por terreno)
e `tests/perf/flowGroup.test.ts` (ordem em massa em terreno real, semente 42, 120 soldados).

| Cenário | Chegaram (A* individual) | Chegaram (campo) | 1º tick ms (A*) | 1º tick ms (campo) | p95 tick ms (campo) |
| --- | --- | --- | --- | --- | --- |
| mundo 192 | 99/120 | 103/120 | 32,95 | 30,32 | 1,53 |
| mundo 384 | 97/120 | 107/120 | 50,71 | 17,61 | 1,41 |

("Chegada" = ordem concluída ou a menos de 6 do destino; as demais ficam espalhadas em volta pela separação.) Os arquivos brutos estão em `ordem-em-massa.json` e `linha-de-base-astar.json`.

## Limites

- O ganho é no primeiro tick (a ordem em massa): 17,6 ms contra 50,7 ms em 384. Em 192 é parecido.
- Medido só para humanos (soldados) em uma ilha; barcos usam a mesma regra por corpo, sem medição própria.
- Sem a ponte (N03/#100): a invalidação por terreno está coberta pelo teste com peso alterado e pelo `surfaceVersion` do cache.
- O campo é limitado a 40 000 expansões e para ao acertar os inícios do grupo; início não acertado cai no A*.
