# Card #99 — corpo, profundidade e travessia (N02-02)

## O que entrou

- `src/game/bodyModel.ts`: corpos `human`, `mount` e `cart` (altura, vau máximo, inclinação) e o barco com calado 0,8 + margem 0,2 (precisa de 1,0 de fundo).
- Superfície única por célula (`water`, `depth`, `cliff`): lago 1,4, rio 1,2, vau 0,3; faixa de raso do oceano ≈ 1,0–1,25 célula.
- Movimento, A* (peso único em cache por célula), IA, spawn de barcos, ordens de mover e cais usam a mesma superfície.
- `settleUnits` tira unidades de células que deixaram de ser pisáveis.
- Viabilidade do mapa rejeita sementes em que um corpo atravessa entre ilhas (`interIslandConnections`); ilhas neutras com raio 0,05.

## Medidas (benchmark local)

| Cenário | Latência |
| --- | --- |
| 120 unidades, ordem em massa | 22–35 ms |
| 240 unidades, ordem em massa | 43–56 ms |
| Tick por tamanho 60 / 192 / 384 / 768 | 7 / 29 / 56 / 112 ms |

Tabela de `docs/reference/mundo-e-ilhas.md` atualizada.

## Controle negativo

Fazer o barco usar `isOceanAt` (sem calado) em `simulation.ts` e `step.ts` faz falhar
`calado do barco na simulação > o barco nunca entra no raso de costa…`. Restaurado, 448 testes passam.

## Limites honestos

- A* continua limitado a 2400 expansões (escopo #77/#78).
- Tamanhos ≥384 passam de 50 ms por tick; seguem experimentais.
- Defaults dos corpos revisados contra os modelos, mas sem avaliação humana de jogo.
