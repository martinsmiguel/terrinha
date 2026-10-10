# Card #77 — navegação hierárquica na escala alvo

**Decisão: HPA* (setores/portais) não é necessário na escala efetiva; mantém-se o A* com peso único por célula e cache versionado.**

Medição (`tests/perf/pathScale.test.ts`, terreno real, semente 31337, pares de pontos pisáveis da mesma ilha natal, `maxExpanded` 2400 como na simulação, corpo humano):

| Mundo | Amostras | Chegaram | Parciais | p50 ms | p95 ms | p99 ms |
| --- | --- | --- | --- | --- | --- | --- |
| 60 | 17 | 17 | 0 | 0,07 | 0,31 | 0,31 |
| 192 | 106 | 106 | 0 | 0,22 | 0,83 | 2,14 |
| 384 | 113 | 113 | 0 | 0,46 | 1,50 | 2,66 |
| 768 | 119 | 119 | 0 | 1,07 | 3,26 | 5,18 |

Relatório bruto: `astar-por-escala.json`. Comprimento médio da rota ≈ 1,05× a linha reta. Rota parcial não conta como chegada (o teste exige alcançar o destino).

Leitura: uma busca isolada custa no máximo ~5 ms no pior percentil, mesmo em 768, bem abaixo do orçamento de 50 ms do tick. O gargalo medido no #99
(tick de 112 ms em 768) vem de **muitas unidades ao mesmo tempo**, não de uma busca; isso é tratado com o compartilhamento de gradiente do #78.

## Limites

- Só pares de terra dentro de uma ilha (as ilhas são separadas por mar; o transporte entre ilhas é naval, não por A*).
- Não mede ponte (N03/#100) nem rotas de barco; o A* de barco usa a mesma superfície e a mesma implementação.
- Nada de 340 como teto: a escala efetiva medida vai até 768.
- Sem HPA*, o critério "setores/portais/refinamento" não foi implementado por decisão baseada na medição acima; a reconciliação do critério fica registrada aqui para o Miguel confirmar.
