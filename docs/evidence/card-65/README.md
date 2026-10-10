# Evidências do card #65 (fatia A065)

Ambiente: Apple M1, 8 núcleos, 8 GB, Node v22.23.1, darwin/arm64; jogo verificado no
navegador embutido (treino solo, lobby). Medições reproduzíveis com `BENCH_REPORT=docs/evidence/card-65/benchmark.json npx vitest run tests/perf`.

| Critério | Prova | Limite |
| --- | --- | --- |
| Quatro ilhas natais amplas e duas neutras por semente compartilhada; 768 e ilhas de 160 a 220 | `archipelago.test.ts` (seis ilhas, natais com diâmetro de 160 a 220 em 768, ilhas sem encostar e dentro do mapa em 60, 192 e 768); `proceduralMap.test.ts` (neutras com recursos). Mapa-múndi em 768 com as seis ilhas: `mapa-mundi-768-seis-ilhas.jpg`. Semente e dimensão viajam em `GameState` (`mapSeed`, `mapSize`) e o convidado regenera o mesmo mundo. | 768 e 340 são padrões experimentais, não teto: o limite é 1024 (`worldConfig.ts`). |
| Em cada natal: área útil, janela de capital 64x64, 4 regiões conectadas, 2 costas úteis, capital de 50 edifícios e 100 unidades | `worldProofs.ts` mede por varredura da geografia, só em terra alcançável a pé do nascedouro. `worldViability.test.ts`: em 768 cada natal tem área útil acima de 12000 e janela de 64x64 com pelo menos 50% útil; passa em 60, 192, 384 e 768. Controles negativos: sem terra, terra pequena, ilha cortada por rochedo e terra isolada por água reprovam. | A capacidade de 50 edifícios e 100 unidades é provada pela janela de capital de 64x64 (4096 células, 50% úteis), não por posicionar as unidades. |
| Chegada segura e 3 sítios de capital; dimensão coerente em geração, câmera, visão, caminho, mapas e desembarque; rejeição limitada de sementes inviáveis | Gerador tenta até 12 sementes e só aceita mundo com provas e 3 sítios por nascedouro (`MAX_SEED_ATTEMPTS`); a semente usada recria o mesmo mundo na 1ª tentativa. `worldSize.test.ts`: rota num mundo de 192, comandos até o limite da sessão, desembarque e grade de névoa em qualquer tamanho. No navegador: partida em 192 e 768 abre na base do jogador, minimapa e mapa-múndi acompanham, fundar a capital funciona em 192 (3 sítios). | Em 12/20 sementes testadas no padrão a primeira semente é inviável; com a rejeição, nenhum mundo gerado é inviável. |
| Prova por critério no SHA final | Este documento e a PR. | Revisão independente pendente por decisão de alpha. |

## Passo da simulação por dimensão do mundo (120 unidades na ilha natal)

| Mundo | Latência da ordem em massa (ms) | Tick p50 (ms) | Tick p95 (ms) | Em marcha no fim |
| --- | --- | --- | --- | --- |
| 60x60 | 8.9 | 0.56 | 0.99 | 107 |
| 192x192 | 30.1 | 0.34 | 0.72 | 107 |
| 384x384 | 80.8 | 0.32 | 0.59 | 117 |
| 768x768 | 136.0 | 0.32 | 0.65 | 120 |

O passo de regime é barato em qualquer tamanho. A latência da ordem em massa (o passo em que 120 caminhos são calculados)
cresce com o mundo e passa do orçamento de 50 ms a partir de 384. O tamanho validado do produto continua sendo 60; 120 e 192
cabem no orçamento medido; 384 e 768 são experimentais até os cards #77 (navegação hierárquica) e #78 (campos de fluxo).

## Geração e A* por tamanho

| Mapa | Geração (ms) | A* p50 (ms) | A* p95 (ms) |
| --- | --- | --- | --- |
| 60x60 | 311.6 | 0.04 | 0.18 |
| 90x90 | 44.4 | 0.10 | 0.23 |
| 120x120 | 75.2 | 0.10 | 0.23 |

A geração de um mundo de 768 leva cerca de 1,2 s no navegador, incluindo a prova e a rejeição de sementes.

## Limites conhecidos

- Os recursos por ilha não escalam com a área: em 768 a chegada cai num platô enorme e os recursos ficam esparsos. Viabilidade
  econômica e especialização das ilhas são o escopo do #66.
- A* limitado a 2400 expansões: voltas longas viram rota parcial e a unidade desiste (escopo do #77).
- Snapshots inteiros pela rede e visão/filtros por área de interesse em mundos grandes são dos cards #74 a #76.
- Defeito corrigido no caminho: o mapa-múndi era montado dentro da barra do minimapa e, com ele recolhido (padrão em tela
  estreita), o diálogo ficava com 216x14 px; agora é montado por portal em `document.body`.
