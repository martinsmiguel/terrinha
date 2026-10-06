# Referência: unidades, edifícios e recursos

> Quadrante **Referência** — dados exatos. Fontes: `src/game/economy.ts`
> (`UNIT_COSTS`, taxas do Mercadão, refino de tábuas), `src/game/buildingDefs.ts`
> (catálogo), `src/game/engine.ts` (tipos), `src/game/proceduralMap.ts` (pedreiras).

## Recursos

| Recurso | Fonte | Notas |
| --- | --- | --- |
| Madeira (`wood`) | Árvores/florestas | Serralheria: +35% de eficiência; reflorestamento sustentável (~18 s); refinada em tábuas pela Serralheria |
| Comida (`food`) | Arbustos, peixes, fazendas | Fazenda: +2/s passivo |
| Ouro (`gold`) | Jazidas | Mineradora: +40%; Mercado: +1/s; barco mercante: +3/s |
| Pedra (`stone`) | **Pedreiras** (nós `type: 'stone'`, pés das montanhas) | Mineradora: +40%; vendável no Mercadão; reserve 700 por pedreira |
| População (`pop`) | Casas (+5 cada) | Libera slot ao perder unidade; mantida em `[0, maxPop]` (`src/game/population.ts`) |
| Tábuas (`planks`) | **Serralheria** (refino) | 0,1 madeira → 0,05 tábua por tick por Serralheria concluída |

## Unidades

| Unidade | Custo | Onde treina | Papel |
| --- | --- | --- | --- |
| Aldeão | 50 comida | Centro da Vila | Coleta e construção |
| Soldado | 80 comida + 40 ouro | Quartel Militar | Combate (mosquete, alcance 4.5) |
| Cavalaria | 60 comida + 80 ouro | Quartel Militar | Choque rápido (0.3 m/tick, 32 dmg, alcance 2.5) |
| Barco de Pesca | 75 madeira + 25 tábuas | Cais Naval | Coleta de peixe |
| Barco Mercante | 100 madeira + 30 ouro + 30 tábuas | Cais Naval | +3 ouro/s |
| Barco de Guerra | 120 madeira + 80 ouro + 40 tábuas | Cais Naval | Combate naval (300 HP, 20 dmg, alcance 7) |

- Fila de treino: máx. **5** por edifício; cancelamento reembolsa 100%.
- **Combate naval**: barcos só enfrentam embarcações inimigas (nunca atacam
  terra); tropas de terra podem atirar em barcos da margem. Barcos destruídos
  afundam com efeito de respingo e casco submerso.
- Custo único de verdade: `UNIT_COSTS` em `src/game/economy.ts` (`canAfford`,
  `applyCost`, `refundCost`, `missingCost`, `describeCost`).

## Edifícios

| Edifício | Tecla | Custo | Construção | Efeito |
| --- | --- | --- | --- | --- |
| Casa Colonial | Q | 60 madeira | 8 s | +5 pop máx. |
| Quartel Militar | W | 120 madeira + 30 ouro | 14 s | Treina soldados e cavalaria |
| Torre de Vigia | E | 80 madeira + 40 pedra + 20 tábuas | 12 s | Tiro automático (16 dmg, alcance 12) |
| Serralheria & Madeireira | R | 110 madeira | 11 s | +35% coleta de madeira; refina madeira em tábuas |
| Mineradora & Pedreira | T | 130 madeira + 25 ouro | 14 s | +40% coleta de ouro **e pedra** |
| Mercadão do Império | Y | 150 madeira + 50 ouro | 16 s | +1 ouro/s; compra/venda (madeira/comida/pedra) |
| Fazenda & Granja | F | 75 madeira | 9 s | +2 comida/s |
| Cais & Doca Naval | B | 140 madeira | 15 s | Treina barcos; só em margem do oceano navegável |

Centro da Vila (Town Center): 2400 HP, criado no início da partida; não
consta no catálogo de construção.

## Combate (resumo)

| | Soldado | Aldeão | Torre |
| --- | --- | --- | --- |
| Dano | 24 | 8 | 16 |
| Alcance | 4.5–5.5 | 1.2–2.5 | 12 |
| Recarga | ~1 s | ~1 s | ~1.1 s |

## Progressão

Eras, tecnologias e seus efeitos sobre coleta e dano estão em
[tecnologias-eras](tecnologias-eras.md). Os multiplicadores aplicam-se sobre
os valores desta página no momento do tick.
