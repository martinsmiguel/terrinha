# Referência: itens e receitas

> Quadrante **Referência**. Fontes: [`src/game/items/`](../../src/game/items/), [`src/game/recipes/`](../../src/game/recipes/), [`src/game/itemGraph.ts`](../../src/game/itemGraph.ts). Card [#174](https://github.com/martinsmiguel/terrinha/issues/174), épico [#182](https://github.com/martinsmiguel/terrinha/issues/182).

Recursos, itens e receitas são **dados**: um arquivo por item e um por receita. Estoques (metrópole e colônias), custos de edifícios e unidades, carga de barcos, rotas comerciais, fluxos, validação de rede e interface leem a lista do registro (`ITEM_IDS`) em vez de uma lista fixa.

## Itens atuais

| Id | Nome | Origem | Etiquetas |
| --- | --- | --- | --- |
| `wood` | Madeira | coleta | madeira, bruto, construção, comercializável |
| `food` | Comida | coleta | comida, bruto, comercializável |
| `gold` | Ouro | coleta | metal, moeda, bruto |
| `stone` | Pedra | coleta | pedra, bruto, construção, comercializável |
| `planks` | Tábuas | refino | madeira, refinado, construção |

## Receitas atuais

| Id | Onde | Entradas → saídas (por passo, por construção) |
| --- | --- | --- |
| `planks-from-wood` | Serralheria | 0,1 madeira → 0,05 tábua |

## Acrescentar um item

1. Criar `src/game/items/<id>.ts` exportando `{ id, name, short, era, source, tags, chipClass } as const satisfies ItemDef`.
2. Incluir em `ITEM_DEFS` (`src/game/items/index.ts`). O teste `tests/unit/items.test.ts` falha se um arquivo da pasta não estiver registrado.
3. Se for de **refino**, criar a receita que o produz; o validador recusa item de refino sem receita.

## Acrescentar uma receita

1. Criar `src/game/recipes/<nome>.ts` com `station`, `mode: 'contínua'`, `inputs`, `outputs` e `requires`.
2. Uma entrada pode ser um item (`{ item: 'wood', amount }`) ou **qualquer item com uma etiqueta** (`{ tag: 'combustível', amount }`), consumido na ordem do registro.
3. Incluir em `RECIPE_DEFS`.

## Garantias automáticas (`validateItemGraph`)

Sem item ou receita repetidos; toda entrada e saída aponta para item existente; toda etiqueta usada tem item; quantidades positivas; **nenhum ciclo** de receitas; **todo item alcançável** a partir do que se coleta. O teste do grafo real roda na suíte e tem controles negativos.

## Limites desta primeira fatia

- Só as receitas contínuas (refino passivo por construção) existem; receitas por lote, ofícios e pesquisa como exigência entram em #176 e #177.
- O mercado continua trocando madeira, comida e pedra, que são os itens com a etiqueta `comercializável`.
