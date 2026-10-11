# Roteiro de partida: defeitos de jogabilidade encontrados e corrigidos

O pedido original foi: "ao tentar caminhar com o grupo não consigo escolher livremente o lugar que vai ser o centro". Para reproduzir e achar o resto, o jogo foi jogado de ponta a ponta sem interface (ver [`roteiro-de-partida.md`](../../how-to/roteiro-de-partida.md)). Cada defeito abaixo tem teste que **falha no código anterior** e passa no atual.

Ambiente: macOS arm64, Node 25.6.1, Vitest 5.0.2; mundo 280, semente 4242 (o grupo também foi medido no mundo 60).

## 1. O grupo perde unidades perto de costa, lago e rochedo (o relato do pedido)

- **Sintoma:** ao clicar num ponto de terra, parte do grupo não anda e o grupo se parte; o centro escolhido parece não valer.
- **Causa:** cada unidade recebe um slot da formação ao redor do clique, e o host **recusa em silêncio** (\`isAuthorizedPlayerCommand\`) qualquer \`move\` cujo destino o corpo não possa ocupar. Só o caso de uma unidade verificava isso.
- **Medição** (cliques em terra firme da região da ilha natal, grupos de 8 e 20 soldados): no mundo 60, de **44% a 87%** dos cliques deixavam unidades sem ordem válida; no mundo 280, de **10% a 21%**. Depois da correção: **0 unidade parada** em todos os casos.
- **Correção:** \`src/game/groupMove.ts\` (\`planGroupMove\`). O centro clicado é respeitado quando algum corpo do grupo pode ficar nele; os slots inválidos vão ao ponto válido mais próximo, sem dois soldados no mesmo lugar; clique em água leva o centro ao terreno firme mais próximo e avisa; sem ponto válido por perto, a unidade fica de fora com aviso. Usa o terreno com pontes, como o host.
- **Teste:** \`tests/unit/groupMove.test.ts\` (mapa real e autorização real do host, três formações, controle negativo).

## 2. Barco ordenado a um ponto em terra ficava parado, sem aviso

- **Causa:** \`findNearestOceanCell\` só procurava mar até 8 células e, sem achar, devolvia o ponto em terra.
- **Correção:** \`boatDestination\` (\`src/game/navalTransport.ts\`) procura até 64 células e devolve \`null\` quando não há mar; o jogo avisa em vez de gravar um alvo em terra.

## 3. Rota vazia quando o centro da célula do destino está bloqueado

- **Sintoma:** o transporte saía do cais e parava a ~2 células; qualquer unidade ordenada a um ponto válido na beira da costa andava em linha reta até bater e parar.
- **Causa:** o A* trabalha em centros de célula. Um destino válido **como ponto**, mas com o **centro da célula bloqueado**, dava rota vazia, e a simulação mandava a unidade em linha reta. O código já tratava o início bloqueado, mas não o objetivo.
- **Correção:** \`routeFrom\` (\`src/game/simulation.ts\`) leva a rota ao centro livre mais próximo do objetivo (até 2 células).
- **Evidência:** o transporte passou de "parado a 197 células da capital inimiga" para a viagem completa de 1836 passos (91,8 s).

## 4. Barco nascia preso na costa

- **Causa:** \`findDockOceanSpawnCell\` escolhia o ponto de mar da janela do cais mais próximo sem olhar a vizinhança; no cais testado o único ponto do tipo era um fio de costa, e o primeiro passo cruzava água rasa.
- **Correção:** prefere ponto "folgado" (célula e quatro vizinhas navegáveis) e, se a janela só tiver fio de costa, procura mar folgado num anel de 6 células ao redor do cais (\`src/game/dockPlacement.ts\`).

## 5. Ordem de ataque não cancelava a marcha

- **Sintoma:** um soldado em marcha que recebia ordem de atacar continuava indo ao ponto antigo e, se não chegava, nunca atacava (3 de 4 soldados ficaram "moving" parados por centenas de passos).
- **Causa:** o \`attack\` não limpava \`targetPosition\` (\`gather\`, \`build_order\` e \`move\` limpam), e a simulação trata primeiro o ramo "andando".
- **Correção:** \`attackOrder\` (\`src/game/unitOrders.ts\`), usada pelo jogo. **Teste:** \`tests/unit/unitOrders.test.ts\` (com controle negativo).

## 6. Dano perdido em combate: unidade em combate ficava imune a atacantes mais novos na lista

- **Sintoma:** 10 soldados cercavam o soldado inimigo, todos "attacking" e dentro do alcance, e **nenhum ponto de vida saía dele**, enquanto ele matava um por um. Aldeões inimigos parados levavam dano normalmente.
- **Causa:** o dano era aplicado mutando o objeto do alvo achado dentro do \`map\` que recria as unidades que agem. Se o alvo (também atacando ou andando) vinha antes na lista, ele já tinha devolvido uma cópia, e o dano caía no objeto antigo. Num duelo, ganhava sempre quem vinha primeiro na lista.
- **Correção:** o dano a unidades é somado num registro e aplicado depois do \`map\`, em qualquer ordem (\`src/game/simulation.ts\`).
- **Teste:** \`tests/unit/combatOrder.test.ts\`: os 4 testes **falham no código anterior** e passam no novo, incluindo a simetria (trocar a ordem na lista não muda o resultado).

## 7. Soldado parado não revidava (corrigido a pedido)

- **Sintoma:** tropa sem ordem levava tiro sem reagir; as ordens de ataque precisavam ser dadas uma a uma.
- **Correção:** `src/game/retaliation.ts`. Militar parado (soldado, cavalaria, barco de guerra) sob ataque, ou cujo aliado do mesmo dono é atacado a até seu raio de visão, passa a atacar o agressor visível mais próximo. Quem marcha, coleta, constrói ou já ataca mantém a ordem; aldeão não revida sozinho; barco de guerra só responde a barco; nunca contra aliado do mesmo dono nem contra agressor que o dono não vê. O inimigo também revida.
- **Teste:** `tests/unit/retaliation.test.ts` (12 casos, incluindo a simulação; 2 falham sem a regra). O combate do roteiro passou de 317 para 302 passos.

## Não corrigido, para decisão

- **A IA inimiga reage de verdade** (aldeões também lutam): um jogador precisa de pelo menos ~10 soldados para tomar a capital do inimigo padrão.
- **Aldeões não voltam ao trabalho sozinhos** depois de construir.
- **O revide só vale para a tropa parada:** unidades em marcha ou coletando continuam sem reagir até receberem ordem, e a perseguição acaba quando o agressor sai da visão.
