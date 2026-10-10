# Evidências do card #66 (fatia A066)

Ambiente: macOS (Apple M1), Node 22; testes de unidade e verificação no jogo (treino solo) no navegador embutido.
Tabelas geradas com 24 sementes espalhadas por tamanho (10007 + k x 7919); sementes muito pequenas distorcem o gerador
congruencial (`seed x 16807 mod 2^31`) e não representam o jogo, cujas sementes vão de 0 a 99999.

## O que a natal precisa e o que ela entrega (capacidade total por ilha natal)

Meta da jornada (`journeyNeeds`): madeira 1850, comida 63, ouro 819, pedra 300. Em **todos** os mundos gerados, nos três
tamanhos, **0 mundos inviáveis em 24** e toda natal cobre a meta.

### Mundo 60 (média de 3.96 tentativas de semente por mundo)

| Perfil | Natais | Madeira | Ouro | Pedra | Comida |
| --- | --- | --- | --- | --- | --- |
| floresta | 24 | 2880 a 3840 | 900 | 700 | 1500 |
| ruínas | 12 | 1855 a 1856 | 1800 | 700 | 1050 |
| árida | 20 | 1855 a 1856 | 1800 | 700 | 1050 |
| glacial | 24 | 1855 a 1856 | 900 | 1400 | 1050 |
| vulcânica | 16 | 1855 a 1856 | 1800 | 1400 | 1050 |

### Mundo 192 (1 tentativa por mundo)

| Perfil | Natais | Madeira | Ouro | Pedra | Comida |
| --- | --- | --- | --- | --- | --- |
| floresta | 24 | 11360 a 11520 | 2700 | 2100 | 4500 |
| ruínas | 20 | 3840 | 5400 | 2100 | 3150 |
| árida | 17 | 1920 | 5400 | 2100 | 3150 |
| glacial | 16 | 1920 | 2700 | 4200 | 3150 |
| vulcânica | 19 | 1920 | 5400 | 4200 | 3150 |

### Mundo 768 (1 tentativa por mundo)

| Perfil | Natais | Madeira | Ouro | Pedra | Comida |
| --- | --- | --- | --- | --- | --- |
| floresta | 24 | 15360 | 3600 | 2800 | 6000 |
| ruínas | 20 | 5120 | 7200 | 2800 | 4200 |
| árida | 17 | 2560 | 7200 | 2800 | 4200 |
| glacial | 16 | 2560 | 3600 | 5600 | 4200 |
| vulcânica | 19 | 2400 a 2560 | 7200 | 5600 | 4200 |

A comida soma pomares e cardume (o cardume renova). A especialização aparece: floresta com 3 a 6 vezes a madeira das
demais, árida, vulcânica e ruínas com o dobro do ouro, glacial e vulcânica com o dobro da pedra.

## Critérios

| Critério | Prova | Limite |
| --- | --- | --- |
| Natal sustenta cinco recursos, refino, produção, câmbio e três eras sem frete; neutras com vantagem sem exclusividade | `islandEconomy.test.ts` (jornada calculada dos custos do jogo, plano por perfil e tamanho, neutras dobram a especialidade e as natais sempre têm os quatro insumos, controles negativos por insumo faltando). `nativeJourney.test.ts`: **oito aldeões de verdade, num mapa real, por 200 s, cobrem o custo da jornada só com a ilha**, em 3 sementes. Câmbio: madeira, comida e pedra vendem no mercado. | A jornada não inclui o exército nem as 7 pesquisas; o excedente vai ao câmbio. |
| Fertilidade validada em preview e host por papel econômico, sem inviabilizar natal; perfil visual não implica rendimento não declarado | Tabela declarada em `ISLAND_ECONOMY`; piso de 0,4 nas natais; fazenda recusada em solo infértil pela mesma função no preview (`checkBuildingPlacementValid`) e no host; rendimento da fazenda proporcional à fertilidade (`simulation.test.ts`). Papel e fertilidade aparecem no mapa-múndi (`mapa-mundi-papel-e-fertilidade.jpg`). Teste de que os totais por ilha saem do plano do perfil. | Só a fazenda tem regra de papel econômico; serraria e mineradora não exigem recurso por perto. |
| Peixe renova 600 sem crédito extra; coleta final min(taxa, restante) com bônus; provar por perfil e semente e pela jornada natal | `simulation.test.ts`: último cardume rende 0,4 e renova 600 sem crédito extra; coleta final com bônus de serralheria e de mineradora. Tabelas acima por perfil e semente, e a jornada natal ponta a ponta. | |
| Prova por critério no SHA final | Este documento e a PR. | Revisão independente pendente por decisão de alpha. |

## Defeitos reais encontrados pela prova de jornada (e corrigidos)

1. **Aproximação por linha reta (regressão do #114).** Na semente 17926 a mina de ouro fica do outro lado de um lago em
   linha reta, mas existe rota por terra. Desde o passo válido unificado do #114, o aldeão tentava ir reto, era recusado
   na água e **desistia sem coletar nada** (antes atravessava a água). Coleta, obra, reparo e perseguição agora usam
   `routeStep`: reto enquanto livre, rota do A* quando bloqueado.
2. **Rota vazia na borda de célula bloqueada.** O A* trabalha em centros de célula; uma unidade de pé na borda legal de
   uma célula cujo centro é água (costa, margem de lago) recebia rota vazia. `routeFrom` parte da vizinha livre mais próxima.
   Vale também para ordens de movimento.
3. **Sementes inviáveis.** Em 60, só ~25% das sementes passam nas provas e nos 3 sítios de capital (média de 4 tentativas);
   com o limite de 12 tentativas, ~3% dos mundos sairiam inviáveis. O limite passou a 32.

Controle negativo: com a simulação sem as correções 1 e 2, os cenários do lago e da borda de célula falham.

## Limites

- A jornada é com 8 aldeões e sem combate; não mede equilíbrio de partida.
- Rotas por A* seguem limitadas a 2400 expansões (voltas muito longas viram rota parcial): escopo do #77.
- A IA solo não coleta por rota própria além do que já fazia; incursões são o #101.
