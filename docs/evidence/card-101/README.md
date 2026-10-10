# Card #101 — perfis e incursões de bots (N04-01 e N04-02)

**N04-01** (PR #150): lobby, perfis Pacífico / Defensivo (padrão) / Incursões, bot por comandos autorizados, graça de 300 s, tentativa de 180 a 300 s, grupo de 3 a 6, uma ativa e retirada com 35%.
**N04-02** (esta PR): incursão a outra ilha só pelo ciclo completo.

## Ciclo naval do bot (`src/game/botNaval.ts`)

1. **Preparo** (perfil Incursões, quartel pronto, alvo explorado do outro lado): serraria (tábuas), cais em costa válida (mesma regra do jogador: oceano e terra na janela) e treino do transporte colonial pelas mesmas regras de custo e fila.
2. **Embarque** pelo mesmo `applyEmbarkOrder` do jogador (distância, posse, capacidade); prazo de 60 s.
3. **Travessia** até um ponto de pouso na costa do alvo (oceano), prazo de 240 s.
4. **Desembarque** gradual (0,5 s por passageiro) só onde há terreno; prazo de 20 s, senão aborta.
5. **Ataque** das tropas pousadas e, daí em diante, o plano terrestre (retirada com 35% de perdas).

Registro em `botClocks[slot].navalStats`: lançadas, perdidas e abortadas (frequência e perdas).

## Testes (`tests/unit/botNaval.test.ts`, mundo sintético de duas ilhas)

- Ciclo inteiro: embarca, atravessa, desembarca e ataca o alvo; as tropas chegam à outra ilha.
- Sem cais, sem transporte, sem alvo conhecido ou sem ponto de pouso (água funda): adia e ninguém atravessa a água.
- Porto destruído antes da partida: aborta e conta; transporte afundado na travessia: perde o grupo uma vez e conta como perda.
- Desembarque sem terra por perto: aborta pelo prazo, sem teletransporte.
- Alcançável por terra exige chegar ao destino: **rota parcial não conta** (corrigido; antes uma rota parcial fazia a IA achar que o alvo do outro lado era alcançável).

## Limites

- Só testado em mundo sintético; não rodei partida completa com IA em arquipélago real.
- Perdas medidas no ataque terrestre depois do pouso entram na retirada de 35%, não em `navalStats.lost` (que conta o afundamento do transporte e o grupo a bordo).
- A IA só pesquisa/funda como antes; sem NPC diplomático nem campanha.
- Frequência e perdas "calibradas" são as propostas; calibragem fina precisa de partidas reais.
