# How-to: roteiro de partida passo a passo (do primeiro frame à vitória)

> Quadrante **How-to**. Fonte executável: [`tests/scenario/partidaBasica.test.ts`](../../tests/scenario/partidaBasica.test.ts) com o host em [`tests/scenario/host.ts`](../../tests/scenario/host.ts). Relatório da última execução: [`docs/evidence/roteiro/execucao.json`](../evidence/roteiro/execucao.json).

O roteiro joga uma partida solo inteira, sem interface, a **20 passos por segundo** (um passo = um frame de simulação, "F"). Meta: fundar a capital, montar a economia, construir quartel e cais, cruzar o mar com um transporte colonial, **ocupar uma segunda ilha** (posto avançado na ilha do inimigo) e **derrotar o inimigo** até a vitória.

Mundo 280, semente 4242. Cada etapa tem um orçamento de passos: se estourar, o teste falha e diz em que frame parou. Todo comando passa pela autorização real do host (posse, recurso, névoa de guerra, terreno), e o teste exige **zero comandos recusados**.

## Como rodar

```bash
npx vitest run tests/scenario                                                    # roda e confere
SCENARIO_REPORT=docs/evidence/roteiro/execucao.json npx vitest run tests/scenario  # grava o relatório
```

## Resultado da última execução

10041 passos (**8.4 min** de jogo), simulados em cerca de 4 s de CPU. Edifícios próprios concluídos em duas localidades (`home`, `1`). Vitória: `{"status":"finished","winner":"player1","players":["player1","player2"]}`.

| Etapa | Fase | Frames | Passos | Orçamento | O que acontece | Comando | Verificação |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E01 | 1 Capital | F0 → F400 | 400 (20.0 s) | 450 | F0: fundar a capital com a carroça no melhor sítio | `found_capital` (carroça, melhor sítio) | carroça some; capital em obras; completa em exatos 400 passos (20 s) |
| E02 | 2 Economia | F400 → F600 | 200 (10.0 s) | 600 | F400: treinar 4 aldeões no Centro (200 comida) | `train` villager ×4 no Centro | população 7; 6 aldeões |
| E03 | 2 Economia | F600 → F688 | 88 (4.4 s) | 400 | Aldeões coletam madeira, comida e ouro (só em recurso explorado) | `gather` ×6 (madeira, comida, ouro) | madeira, comida e ouro sobem, só em recurso explorado |
| E04 | 2 Economia | F688 → F809 | 121 (6.0 s) | 500 | Construir a casa (60 madeira, 8 s): +5 de população máxima | `build` house | população máxima 20 |
| E04b | 2 Economia | F809 → F899 | 90 (4.5 s) | 500 | Construir a fazenda (75 madeira, 9 s): comida passiva (+2/s), porque arbusto acaba | `build` farm |  |
| E05 | 2 Economia | F899 → F1064 | 165 (8.3 s) | 700 | Construir o quartel (120 madeira + 30 ouro, 14 s) | `build` barracks | quartel concluído |
| E05b | 2 Economia | F1064 → F1353 | 289 (14.4 s) | 1500 | Desbloquear a serralheria: Carpintaria 2 (cortar madeira dá XP; um estudo de 60 madeira + 20 ouro completa) | `study_craft` carpintaria (se ainda faltar) | Carpintaria 2: serralheria desbloqueada (antes, `missingFor` aponta Carpintaria 1/2) |
| E06 | 2 Economia | F1353 → F1520 | 167 (8.3 s) | 600 | Construir a serralheria junto das árvores (110 madeira, 11 s): refina tábuas | `build` sawmill | serralheria concluída |
| E07 | 3 Costa e exército | F1520 → F1617 | 97 (4.8 s) | 1500 | Explorar a costa: o soldado inicial anda até o futuro cais (obra exige local explorado) | `move` soldado até a costa | costa explorada (obra exige local explorado) |
| E08 | 3 Costa e exército | F1617 → F1874 | 257 (12.8 s) | 700 | Construir o cais na margem do oceano navegável (140 madeira, 15 s) | `build` dock | cais concluído na margem do oceano navegável |
| E09 | 3 Costa e exército | F1874 → F2324 | 450 (22.5 s) | 12000 | Treinar 9 soldados no quartel (80 comida + 40 ouro cada), enfileirando conforme o ouro chega: 10 com o inicial | `train` soldier ×9 (quando há recurso e fila < 5) | 10 soldados (com o inicial) |
| E10 | 3 Costa e exército | F2324 → F2520 | 196 (9.8 s) | 4000 | Esperar 50 tábuas refinadas pela serralheria (custo do transporte colonial) | nenhum: a serralheria refina | 50 tábuas |
| E11 | 4 Mar e segunda ilha | F2520 → F2570 | 50 (2.5 s) | 6000 | Treinar o transporte colonial no cais (180 madeira + 40 ouro + 50 tábuas) | `train` colonial_transport | transporte treinado (nasce em mar folgado) |
| E11b | 4 Cadeia da madeira | F2570 → F2691 | 121 (6.0 s) | 600 | Serralheria passa a rachar lenha (combustível): 12 de lenha | `set_recipe` serralheria → lenha | 12 de lenha (combustível) |
| E11c | 4 Cadeia da madeira | F2691 → F2741 | 50 (2.5 s) | 600 | Serralheria entalha cabo de ferramenta (Carpintaria 2): 1 cabo | `set_recipe` serralheria → cabo | 1 cabo de ferramenta (exige Carpintaria 2) |
| E11d | 4 Cadeia da madeira | F2741 → F2905 | 164 (8.2 s) | 600 | Centro da Vila monta a ferramenta de pedra (1 cabo + 5 pedra): a coleta rende +20%; a serralheria volta à lenha | `set_recipe` serralheria → lenha e Centro → ferramenta; `gather` pedra | 1 ferramenta de pedra; pedra ≥ 100 para kit e posto |
| E11e | 4 Cadeia da madeira | F2905 → F3206 | 301 (15.1 s) | 1500 | Avançar à Era do Bronze (Mineração 2 e Carpintaria 2; 100 madeira + 50 ouro, 15 s) | `study_craft` mineração (se faltar) e `research` era:bronze | Era do Bronze |
| E11f | 4 Cadeia da madeira | F3206 → F3307 | 101 (5.0 s) | 600 | Serralheria queima a lenha em carvão vegetal (Bronze): 5 de carvão | `set_recipe` serralheria → carvão | 5 de carvão vegetal; a serralheria volta às tábuas |
| E12 | 4 Mar e segunda ilha | F3307 → F3307 | 0 (0.0 s) | 60 | Carregar o kit de colonização (150 madeira + 50 pedra) no porão | `load_kit` | kit a bordo |
| E13 | 4 Mar e segunda ilha | F3307 → F3451 | 144 (7.2 s) | 2500 | Embarcar 2 aldeões e 4 soldados (capacidade 6): primeira viagem | `embark` 2 aldeões + 4 soldados | 6 passageiros |
| E14 | 4 Mar e segunda ilha | F3451 → F5287 | 1836 (91.8 s) | 12000 | Navegar até a costa da ilha do inimigo | `move` do transporte | chega a menos de 60 células da capital inimiga |
| E15 | 4 Mar e segunda ilha | F5287 → F5343 | 56 (2.8 s) | 600 | Desembarcar a tropa (uma unidade a cada 0,5 s) e entregar o kit | `disembark` | tropa em terra firme, em outra localidade; kit entregue |
| E16 | 4 Mar e segunda ilha | F5363 → F5572 | 209 (10.4 s) | 900 | Fundar o posto avançado (kit) na segunda ilha: duas ilhas ocupadas | `build` outpost com os 2 aldeões | posto avançado concluído na segunda ilha: edifícios em 2 localidades |
| E17 | 5 Reforços | F5572 → F7355 | 1783 (89.2 s) | 12000 | Voltar ao cais: o transporte navega de volta à ilha natal | `move` do transporte ao cais | transporte junto ao cais |
| E18 | 5 Reforços | F7355 → F7827 | 472 (23.6 s) | 2500 | Embarcar os 6 soldados que ficaram na ilha natal | `embark` 6 soldados | 6 passageiros |
| E19 | 5 Reforços | F7827 → F9659 | 1832 (91.6 s) | 12000 | Navegar de novo até a costa da segunda ilha | `move` do transporte à costa | transporte na costa da segunda ilha |
| E20 | 5 Reforços | F9659 → F9715 | 56 (2.8 s) | 600 | Desembarcar os reforços junto do posto avançado | `disembark` | 10 soldados na segunda ilha |
| E21 | 6 Combate | F9715 → F9746 | 31 (1.6 s) | 1500 | Marchar em formação até avistar o inimigo (o host só deixa atacar o que se vê) | `move` em formação (planejador de grupo) | algum inimigo visível |
| E22 | 6 Combate | F9746 → F10041 | 295 (14.8 s) | 14000 | Atacar: o soldado inimigo primeiro, depois as demais unidades visíveis e a capital, até a vitória | `attack` (soldado inimigo primeiro, depois unidades visíveis, depois a capital) | único sobrevivente é o jogador 1 |
| E23 | 6 Combate | F10041 → F10041 | 0 (0.0 s) | - | Vitória registrada (evaluateMatch: único sobrevivente é o jogador 1) | avaliação da vitória | `evaluateMatch` = finished, winner player1 |

## Regras do jogo que o roteiro obedece (e que um jogador também encontra)

- **Fundar a capital** leva 20 s (400 passos). Sem capital não há treino de aldeões.
- **Névoa de guerra:** o host só aceita coletar, construir e atacar em lugar explorado, e só ataca unidade inimiga que esteja visível. Por isso a E07 manda um soldado explorar a costa antes do cais, e a E21 marcha até avistar o inimigo.
- **Comida de arbusto é finita** (450 por arbusto): o primeiro acaba em menos de 700 passos com 2 aldeões. A fazenda (E04b) dá comida passiva.
- **Desbloqueios (card #177):** a serralheria exige Carpintaria 2 e o posto avançado exige um cais de pé. Cortar madeira dá XP de Carpintaria e um estudo completa o que faltar (E05b); o cais (E08) vem antes do posto (E16).
- **Cadeia da madeira (card #178):** depois do transporte, a serralheria racha lenha e entalha um cabo, o Centro da Vila monta a ferramenta de pedra (+20% de coleta), a colônia avança ao Bronze e a serralheria queima a lenha em carvão vegetal. A ferramenta gasta 5 de pedra, então um aldeão vai à pedreira para cobrir o kit e o posto (50 + 50).
- **Embarque atrás do cais:** o alvo do embarque é o barco, na água; quem empaca atrás do cais espera o barco se aproximar e recebe a ordem de novo (E18).
- **Madeira explorada acaba:** quando as árvores à vista se esgotam, o roteiro recoloca os aldeões no ouro visível.
- **Transporte colonial** custa 50 tábuas, e só a serralheria refina tábuas: ela precisa estar de pé uns 200 passos antes (E10).
- **Capacidade do transporte: 6.** O inimigo tem 1 soldado e vários aldeões que também lutam, então 4 soldados perdem. O roteiro faz duas viagens: 2 aldeões + 4 soldados (para fundar o posto) e depois mais 6 soldados.
- **Aldeões não voltam sozinhos ao trabalho** depois de construir: o roteiro os recoloca.

## Limites

- **O host do roteiro espelha os efeitos dos comandos de `handleIncomingCommand` (`src/App.tsx`)**: a autorização, a simulação e as regras puras são as do jogo, mas o corpo de cada comando em estado está reescrito em `host.ts` (com a origem anotada). Se aquele trecho mudar, o espelho precisa mudar. O passo natural é extrair um aplicador puro de comandos.
- O inimigo é a IA do slot 2 com o perfil padrão, sem intervenção. Desde o card #176 ela estuda ofícios a cada 30 s (gasta da própria metrópole), o que encurtou o combate de 317 para 302 passos; com os desbloqueios do #177 (cavalaria só no Ferro com Guerra 2), o combate levou 298; com a cadeia da madeira do #178 (partida mais longa), 295. A semente 4242 é um cenário, não uma garantia para todas.
- Mede simulação, não renderização, som nem rede.
