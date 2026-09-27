# Referência: unidades, edifícios e recursos

> Quadrante **Referência** — dados exatos. Fontes: `src/App.tsx` (custos de
> treino), `src/game/buildingDefs.ts` (catálogo), `src/game/engine.ts` (tipos).

## Recursos

| Recurso | Fonte | Notas |
| --- | --- | --- |
| Madeira (`wood`) | Árvores/florestas | Serralheria: +35% de eficiência; reflorestamento sustentável (~18 s) |
| Comida (`food`) | Arbustos, peixes, fazendas | Fazenda: +2/s passivo |
| Ouro (`gold`) | Jazidas | Mineradora: +40%; Mercado: +1/s; barco mercante: +3/s |
| Pedra (`stone`) | — | Sem nó de recurso no mapa; ver card de correção de recursos |
| População (`pop`) | Casas (+5 cada) | Vazamento ao perder unidades; ver card de correção |
| Tábuas (`planks`) | — | Planejado, ainda não produzido (valor sempre 0) |

## Unidades

| Unidade | Custo | Onde treina | Papel |
| --- | --- | --- | --- |
| Aldeão | 50 comida | Centro da Vila | Coleta e construção |
| Soldado | 80 comida + 40 ouro | Quartel Militar | Combate (mosquete) |
| Barco de Pesca | 75 madeira | Cais Naval | Coleta de peixe |
| Barco Mercante | 100 madeira + 30 ouro | Cais Naval | +3 ouro/s |

- Fila de treino: máx. **5** por edifício; cancelamento reembolsa 100%.
- `cavalry` existe no tipo `UnitType` mas ainda não é treinável.

## Edifícios

| Edifício | Tecla | Custo | Construção | Efeito |
| --- | --- | --- | --- | --- |
| Casa Colonial | Q | 60 madeira | 8 s | +5 pop máx. |
| Quartel Militar | W | 120 madeira + 30 ouro | 14 s | Treina soldados |
| Torre de Vigia | E | 100 madeira + 40 ouro | 12 s | Tiro automático (16 dmg, alcance 12) |
| Serralheria & Madeireira | R | 110 madeira | 11 s | +35% coleta de madeira |
| Mineradora & Pedreira | T | 130 madeira + 25 ouro | 14 s | +40% coleta de ouro |
| Mercadão do Império | Y | 150 madeira + 50 ouro | 16 s | +1 ouro/s; compra/venda |
| Fazenda & Granja | F | 75 madeira | 9 s | +2 comida/s |
| Cais & Doca Naval | B | 140 madeira | 15 s | Treina barcos; só em margem |

Centro da Vila (Town Center): 2400 HP, criado no início da partida; não
consta no catálogo de construção.

## Combate (resumo)

| | Soldado | Aldeão | Torre |
| --- | --- | --- | --- |
| Dano | 24 | 8 | 16 |
| Alcance | 4.5–5.5 | 1.2–2.5 | 12 |
| Recarga | ~1 s | ~1 s | ~1.1 s |
