# Referência: economia das ilhas

> Quadrante **Referência** — dados exatos. Fontes: `src/game/islandEconomy.ts`, `src/game/archipelago.ts`,
> `src/game/proceduralMap.ts`, `src/game/simulation.ts`.

## O que a ilha natal precisa fornecer

A jornada natal é três eras, a cadeia mínima de produção (3 casas, quartel, serralheria, mineradora, mercado, fazenda e
cais), um barco de pesca e 8 aldeões, tudo calculado dos custos do próprio jogo (`journeyCost`). Descontado o suprimento
inicial (350 madeira, 350 comida, 200 ouro, 100 pedra) e com 25% de margem, cada ilha natal precisa ter ao menos:

| Madeira | Comida | Ouro | Pedra |
| --- | --- | --- | --- |
| 1850 | 63 | 819 | 300 |

Todo mundo gerado é checado contra isso (`evaluateNativeEconomy`); um mundo em que alguma natal não cobre a jornada é
rejeitado como as demais sementes inviáveis (ver `mundo-e-ilhas.md`). Refino (tábuas na serralheria), produção
(fazendas e minas) e câmbio (mercado) não dependem de barco.

## Capacidade dos nós

Árvore 160 (ilha natal pequena com poucas árvores ganha até 640 por árvore), mina de ouro 900, pedreira 700, pomar 450 e
cardume 600. O cardume renova até 600 ao esgotar, sem crédito extra: a última coleta rende só o que restava. A coleta
final sempre rende `min(taxa, restante)`, inclusive com os bônus de serralheria e mineradora.

## Rendimento declarado por perfil

O visual de uma ilha não implica rendimento fora desta tabela.

| Perfil | Papel | Fertilidade |
| --- | --- | --- |
| Ilha Verde (floresta) | madeireira e agrícola | 1,2 |
| Ilha das Ruínas (ruintas) | balanceada | 1,0 |
| Ilha Árida (arida) | aurífera | 0,6 |
| Ilha Glacial (glacial) | pedreira | 0,5 |
| Ilha Vulcânica (montanhosa) | mineradora | 0,25 (natal: piso de 0,4) |

A fazenda rende 0,1 por passo vezes a fertilidade da ilha onde está. Fazendas só podem ser erguidas com fertilidade a
partir de 0,3 (preview e host usam `farmPlacementReason`); o piso de 0,4 das ilhas natais garante que nenhuma natal
fica sem cultivo, enquanto uma ilha vulcânica neutra não aceita fazendas.

## Ilhas neutras

Plano enxuto que dobra a especialidade do perfil (ouro, pedra ou madeira) e mantém um pomar e os cardumes. Nunca
monopolizam um insumo básico: as quatro ilhas natais sempre têm madeira, comida, ouro e pedra.

## Escala com o mundo

Contagens de nós de recurso multiplicam por `min(4, max(1, round(dimensão / 60)))`: 1 em 60, 3 em 192 e 4 de 240 em
diante. O piso de capacidade por árvore só atua quando a ilha tem poucas árvores.
