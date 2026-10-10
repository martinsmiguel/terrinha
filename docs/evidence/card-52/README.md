# Card #52 — validação final do arquipélago com pathfinding real e mapas maiores

Cenário: terreno procedural real (sementes 1, 42, 777777), cache de rotas persistente, ordem de movimento de 120 unidades, tick de 50 ms.
Hardware: Apple M1, 8 núcleos, 8 GB, Node 25 (ver `benchmark-final.json`, campo `environment`). Relatórios: `benchmark-final.json` (este card), `../card-77/astar-por-escala.json` (A* isolado)
e `../card-78/ordem-em-massa.json` (campo de fluxo).

| Critério | Resultado |
| --- | --- |
| Mapa real, bloqueios, cache e ordens de 120+ unidades | `tests/perf/archipelagoBenchmark.test.ts` (ordem em massa 120 unidades) |
| Duração por tick e latência da ordem | Tick estável p50 0,4–0,6 ms, p95 ≤ 1,2 ms em 60/192/384/768. Latência da 1ª ordem em massa: 6,7 / 27,8 / 57,3 / 154,2 ms (60 / 192 / 384 / 768) |
| 60x60 e maiores | 60, 192, 384 e 768 medidos; gerador 60/90/120 em ~70–100 ms |
| Ciclo de construção, embarque, viagem e desembarque sem cheats | Seção `navalCycle` do relatório (cais, treino, embarque, viagem, desembarque) |
| Orçamento coerente com 50 ms e decisão | **Suporte garantido até 192** (ordem em massa abaixo de 50 ms). **384 e 768 são experimentais**: o tick estável é leve, mas a primeira ordem em massa engasga 57–154 ms uma vez |
| Resultado e revisão no SHA final | Este PR; `supportedSize` do relatório atualizado |

## Limites

- A latência da 1ª ordem em massa em 384/768 passa de 50 ms; a decisão é documentar o limite suportado (192), não esconder.
- Só ilhas natais e uma única máquina; sem LAN real (ver #53).
- A navegação hierárquica foi dispensada com medição (#77); o campo de fluxo (#78) ajuda grupos de 6 ou mais mas o cenário deste relatório ainda tem custo alto em 768.
