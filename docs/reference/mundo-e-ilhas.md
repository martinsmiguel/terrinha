# Referência: dimensão do mundo e ilhas

> Quadrante **Referência** — dados exatos. Fontes: `src/game/archipelago.ts`, `src/game/worldConfig.ts`,
> `src/game/worldProofs.ts`, `src/game/proceduralMap.ts`.

## Dimensão

O host (ou o treino solo) escolhe o tamanho do mundo no lobby. O valor viaja em `GameState.mapSize` junto com
`mapSeed`, e o convidado regenera o mesmo mundo. Limites: de 60 a 1024 células de lado (`parseWorldSize`).

| Mundo | Situação | Latência da ordem em massa (120 unidades) |
| --- | --- | --- |
| 60 | validado (passo completo da simulação testado) | 9 ms |
| 120 | experimental | dentro de 50 ms |
| 192 | experimental | 32 ms |
| 384 | experimental | 82 ms (passa de 50 ms) |
| 768 | experimental (dimensão-alvo) | 135 ms (passa de 50 ms) |

Medições em `docs/evidence/card-65/README.md`. Acima de 192, ordens em massa podem causar engasgos até a navegação
hierárquica (#77) e os campos de fluxo (#78).

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

`generateProceduralTerrain(tamanho, semente)` tenta até 12 sementes (passo 7919) e só aceita um mundo em que as quatro
natais passam nas provas, cada nascedouro tem 3 sítios de capital e a expansão imediata tem 25 células construíveis. O
resultado traz `seed` (a semente usada), `seedAttempts`, `viable`, `proof` e `capitalSites`. Recriar o mundo com `seed`
dá o mesmo mapa na primeira tentativa.
