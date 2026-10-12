# Referência: itens e receitas

> Quadrante **Referência**. Fontes: [`src/game/items/`](../../src/game/items/), [`src/game/recipes/`](../../src/game/recipes/), [`src/game/itemGraph.ts`](../../src/game/itemGraph.ts). Cards [#174](https://github.com/martinsmiguel/terrinha/issues/174) e [#178](https://github.com/martinsmiguel/terrinha/issues/178), épico [#182](https://github.com/martinsmiguel/terrinha/issues/182).

Recursos, itens e receitas são **dados**: um arquivo por item e um por receita. Estoques (metrópole e colônias), custos de edifícios e unidades, carga de barcos, rotas comerciais, fluxos, validação de rede e interface leem a lista do registro (`ITEM_IDS`) em vez de uma lista fixa.

## Itens atuais

| Id | Nome | Origem | Etiquetas |
| --- | --- | --- | --- |
| `wood` | Madeira | coleta | madeira, bruto, construção, comercializável |
| `food` | Comida | coleta | comida, bruto, comercializável |
| `gold` | Ouro | coleta | metal, moeda, bruto |
| `stone` | Pedra | coleta | pedra, bruto, construção, comercializável |
| `planks` | Tábuas | refino | madeira, refinado, construção |
| `firewood` | Lenha | refino | madeira, refinado, combustível |
| `tool_handle` | Cabo de ferramenta | refino | madeira, refinado, peça |
| `stone_tool` | Ferramenta de pedra | refino | ferramenta, refinado |
| `charcoal` | Carvão vegetal (Bronze) | refino | refinado, combustível |

Os cinco primeiros são **de base** (`core`): todo saldo os tem. Os demais são opcionais no saldo e valem 0 quando ausentes, então estados e mensagens de antes continuam válidos.

## Receitas atuais

| Id | Onde | Entradas → saídas (por passo, por construção) | Ofício treinado | Nível exigido |
| --- | --- | --- | --- | --- |
| `planks-from-wood` (padrão) | Serralheria | 0,1 madeira → 0,05 tábua | Carpintaria | Pedra, 1 |
| `firewood-from-wood` | Serralheria | 0,1 madeira → 0,1 lenha | Carpintaria | Pedra, 1 |
| `tool-handle-from-wood` | Serralheria | 0,1 madeira → 0,02 cabo | Carpintaria | Pedra, 2 |
| `charcoal-from-firewood` | Serralheria | 0,1 lenha → 0,05 carvão | Carpintaria | Bronze, 2 |
| `stone-tool` | Centro da Vila | 0,01 cabo + 0,05 pedra → 0,01 ferramenta | Cantaria | Pedra, 1 |

## Produção e escolha de receita (#178)

- Cada construção que é **estação** usa a receita escolhida pelo dono (`Building.recipeId`) ou a padrão da estação; o Centro da Vila não tem padrão e só produz depois de escolhida. Receita sem era ou nível de ofício exigidos não roda (`src/game/production.ts`).
- Comando de rede `set_recipe { buildingId, recipeId }`: o host aceita só construção própria, receita daquela estação e exigências cumpridas. Na interface, o painel da construção selecionada lista as receitas, a ativa e o que falta para as bloqueadas.
- A produção usa o **estoque da ilha** da construção: na metrópole, o saldo do jogador; numa colônia, o estoque local, e só com posto concluído.
- **Ferramenta de pedra:** com ao menos uma no estoque da metrópole, cada aldeão coleta em terra **+20%** e gasta 0,0005 ferramenta por passo (uma a cada 100 s de trabalho).
- A tábua já existia na Pedra antes deste card e continua lá, porque o transporte colonial depende dela. O carvão vegetal é a ponte para a metalurgia.

## Livro do império (#179)

**Alt+L** ou o botão **Receitas** do HUD abrem o livro, lido do registro (`src/game/recipeBook.ts`): toda receita com estação, ofício e nível, era, fórmula por 5 s, o que ela abre na cadeia e, para o jogador, se está disponível ou o que falta. Busca sem acento por nome, item ou construção, e filtros por era e ofício. Receita nova no registro aparece sem mexer na interface. A aba **Ofícios** mostra nível, XP e o que o próximo nível abre.

## Acrescentar um item

1. Criar `src/game/items/<id>.ts` exportando `{ id, name, short, era, source, tags, chipClass } as const satisfies ItemDef`.
2. Incluir em `ITEM_DEFS` (`src/game/items/index.ts`). O teste `tests/unit/items.test.ts` falha se um arquivo da pasta não estiver registrado.
3. Se for de **refino**, criar a receita que o produz; o validador recusa item de refino sem receita.

## Acrescentar uma receita

1. Criar `src/game/recipes/<nome>.ts` com `station`, `mode: 'contínua'`, `inputs`, `outputs`, `craft` (ofício treinado) e `requires` (era e nível mínimo do ofício).
2. Uma entrada pode ser um item (`{ item: 'wood', amount }`) ou **qualquer item com uma etiqueta** (`{ tag: 'combustível', amount }`), consumido na ordem do registro.
3. Incluir em `RECIPE_DEFS`.

## Garantias automáticas (`validateItemGraph`)

Sem item ou receita repetidos; toda entrada e saída aponta para item existente; toda etiqueta usada tem item; quantidades positivas; **nenhum ciclo** de receitas; **todo item alcançável** a partir do que se coleta. O teste do grafo real roda na suíte e tem controles negativos.

## Limites desta primeira fatia

- Só as receitas contínuas (produção passiva por construção) existem; receitas por lote ficam para depois; desbloqueio de construções e unidades está em [desbloqueios](unidades-edificios.md#desbloqueios-card-177). Ofícios: ver [ofícios do império](oficios.md).
- O mercado continua trocando madeira, comida e pedra, que são os itens com a etiqueta `comercializável`.
