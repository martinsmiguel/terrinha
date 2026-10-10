# Referência: unidades, edifícios e recursos

> Quadrante **Referência** — dados exatos. Fontes: `src/game/economy.ts`
> (`UNIT_COSTS`, taxas do Mercadão, refino de tábuas), `src/game/buildingCatalog.ts`
> (catálogo), `src/game/engine.ts` (tipos), `src/game/proceduralMap.ts` (pedreiras).

> **Estado ≠ contrato.** Esta página descreve o **código atual**, não a entrega
> da alpha. Divergências conhecidas com o
> [contrato da alpha](../explanation/contrato-alpha.md) — previstas, ainda não
> implementadas: início por **carroça/kit com escolha da sede** em vez de Centro
> fixo no spawn; **sem renda passiva de ouro** do mercante (o contrato prevê frete
> real, sem ouro criado por viagem); **entreposto** e **ponte** como infraestrutura nova, e **transporte colonial**
> como unidade naval nova. Enquanto não houver prova no SHA final,
> considere os valores desta página como baseline e o contrato como compromisso.

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
| Transporte Colonial | 180 madeira + 40 ouro + 50 tábuas | Cais Naval | 360 HP, sem ataque nem renda; 6 passageiros e porão de 200 (ou o kit de 150 madeira + 50 pedra); desembarca 1 a cada 0,5 s (0,25 s com talento) |
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
| Posto Avançado | U | 150 madeira + 50 pedra | 20 s | 900 HP; território de raio 18; cura terrestre própria 2 HP/s (sem somar, sem reviver); mínimo 24 de outro posto ou da capital; sem vida extra |

Centro da Vila (Town Center): 2400 HP, fundado pelo jogador a partir da carroça
(20 s, uso único do kit reservado de 400 madeira e 200 pedra); não consta no
catálogo de construção nem é treinável.

## Carroça de fundação

| Atributo | Valor |
| --- | --- |
| Vida | 300 HP |
| Velocidade | 0,16 por passo (20 Hz) |
| Visão | 10 |
| Ataque | nenhum |
| Origem | só no início da partida (não treinável); conta como 1 de população |

Cada jogador recebe também 2 aldeões e 1 soldado. O suprimento inicial é 350
madeira, 350 comida, 200 ouro, 100 pedra e 0 tábuas; o kit de fundação é
reservado à parte e só pode ser gasto fundando a capital.

## Fases de vida

| Fase | Quando | Eliminado se |
| --- | --- | --- |
| Chegando | só a carroça | a carroça é destruída antes de fundar |
| Fundando | capital em obras | a capital em obras é destruída e não há carroça |
| Ativo | capital concluída | a capital é destruída |

Entrepostos e outras construções não dão vida extra. Ao ser eliminado, o jogador
perde ordens e filas de produção. Fonte: `src/game/foundation.ts`.

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
