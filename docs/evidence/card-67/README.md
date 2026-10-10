# Card #67 — fundar entrepostos com território e cura

Código: `src/game/colonies.ts`, catálogo (`outpost`), autorização em `networkCommands.ts`, preview em `buildingGhost.ts`,
cura no tick de `simulation.ts`. Testes: `tests/unit/colonies.test.ts` (463 testes no total, lint e build ok).

| Critério | Prova |
| --- | --- |
| Funda em solo conhecido e transitável, com posse; 150 madeira/50 pedra/20 s/900 HP/raio 18 | Autorização exige dono, aldeões próprios, saldo, `explored` e `canStandAt('human')`; dados em catálogo e `OUTPOST` |
| Múltiplos postos, inclusive na natal (24), sem vida extra | Espaçamento ≥24 de postos e capital próprios (teste a 23 e 24); `lifePhase` ignora o posto |
| Cura terrestre própria viva, 2 HP, sem stack/reviver/exceder | 2 HP/s (0,1 por tick); dois postos não somam; morto, barco, alheio e fora do raio não curam; limite em maxHealth |
| Destruição remove efeitos | Simulação: com o posto a 0 de vida a cura para |

Controle negativo: sem a checagem de espaçamento na autorização o teste de recusa falha.

## Limites

- A cura é fracionária (0,1 HP/tick); a interface arredonda.
- O depósito de #68 não existe ainda: a destruição só remove território e cura. O gancho fica no #68.
- Território e cais: o cais continua exigindo margem do oceano; o posto não substitui a regra.
- "Economia local habilitada" (estoque) depende do #68; aqui o posto só marca território.
- Sem avaliação humana de jogo.
