# Referência: dimensão do mundo e ilhas

> Quadrante **Referência** — dados exatos. Fontes: `src/game/archipelago.ts`, `src/game/worldConfig.ts`,
> `src/game/worldProofs.ts`, `src/game/proceduralMap.ts`.

## Dimensão

O host (ou o treino solo) escolhe o tamanho do mundo no lobby; o padrão é 280 (`DEFAULT_WORLD_SIZE`), com ilhas de cerca de 21 vezes a área das de 60. O valor viaja em `GameState.mapSize` junto com
`mapSeed`, e o convidado regenera o mesmo mundo. Limites: de 60 a 1024 células de lado (`parseWorldSize`).

| Mundo | Situação | Latência da ordem em massa (120 unidades) |
| --- | --- | --- |
| 60 | suportado (validado) | 7 ms |
| 120 | experimental | dentro de 50 ms |
| 192 | suportado (validado) | 28 ms |
| 280 | padrão do lobby (validado) | 36 ms |
| 384 | experimental | 57 ms (passa de 50 ms) |
| 768 | experimental (dimensão-alvo) | 154 ms (passa de 50 ms) |

Medições em `docs/evidence/card-65/README.md` e `docs/evidence/card-52/`. Acima de 192, a primeira ordem em massa pode causar um engasgo único; o tick
estável fica abaixo de 2 ms. A navegação hierárquica foi dispensada (#77) e os campos de fluxo (#78) reduzem o custo para grupos de 6 ou mais.

## Ilhas

Seis ilhas por semente: quatro **natais** (uma por jogador, com nascedouro no centro) e duas **neutras** (norte e
sul), todas proporcionais à dimensão (`raio = dimensão x 0,1333` nas natais e `x 0,075` nas neutras). Em 768 as natais
têm de 160 a 220 de diâmetro. As neutras não têm nascedouro e só se alcançam de barco.

## Provas por ilha natal

Medidas por varredura da geografia, só em terra alcançável a pé do nascedouro. As metas absolutas valem para 768 e
escalam com a área nos demais tamanhos (`proofThresholds`).

| Prova | Meta em 768 | Como escala |
| --- | --- | --- |
| Área útil | 12000 células | com a área (dimensão ao quadrado) |
| Janela de capital | 64x64 com pelo menos 50% útil | com a dimensão (mínimo 4x4) |
| Regiões ligadas por terra | 4 (quadrantes ao redor do nascedouro) | fixo, com área mínima por região |
| Costas utilizáveis | 2 de 8 setores | células por setor com a dimensão |

Terra útil é transitável, sem água, sem rochedo e com declive de até 0,85.

## Rejeição de sementes inviáveis

`generateProceduralTerrain(tamanho, semente)` tenta até 32 sementes (passo 7919) e só aceita um mundo em que as quatro
natais passam nas provas, cada nascedouro tem 3 sítios de capital e a expansão imediata tem 25 células construíveis. O
resultado traz `seed` (a semente usada), `seedAttempts`, `viable`, `proof` e `capitalSites`. Recriar o mundo com `seed`
dá o mesmo mapa na primeira tentativa.
