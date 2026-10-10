# Evidências do card #74 (fatia A074)

Ambiente: macOS (Apple M1), Node 22; testes de unidade e verificação no jogo (treino solo) no navegador embutido.

| Critério | Prova | Limite |
| --- | --- | --- |
| Host mantém visão atual e exploração por dono; unidades, edifícios e barcos revelam; cliente só renderiza a névoa | `src/game/visionAuthority.ts` (`updateOwnerVision`), mantido em `hostVisionRef` no `App` a cada passo. `tests/unit/visionAuthority.test.ts`: dono só vê o que os seus revelam, exploração persiste e a visão atual não, barcos e edifícios revelam pelo raio do tipo, grade acompanha a dimensão. O cliente usa a mesma `visionSourcesFor`, sem decidir nada. | A grade do host não é transmitida; o cliente recalcula a própria para desenhar. |
| Autorização, perseguição e IA não alcançam alvo desconhecido nem rastreiam posição oculta | `networkCommands.test.ts`: ataque a unidade só visível, a edifício e recurso só explorados, construir e fundar a capital só em terreno explorado, mover para o desconhecido permitido. `simulation.test.ts`: perseguição acaba quando o alvo sai de vista, torre só atira no que o dono enxerga, coletor só troca de recurso para um explorado, IA só marcha contra o que descobriu. **Controle negativo:** revertendo a simulação para a versão sem visão, os 4 cenários falham. | Unidade inimiga exige visão atual; edifício exige só exploração (a posição não muda). |
| Próprios e logística conhecidos fora da câmera; testar visível, explorado e desconhecido; registrar a nova autoridade em #94 | `canTarget` nunca bloqueia entidades do próprio dono; os três estados são cobertos nos testes acima. Autoridade registrada em `docs/explanation/adr/0009-visao-autoritativa-por-dono-no-host.md` e comentada no #94. Jogo: fundar a capital passa pela checagem de exploração e conclui em 20 s sem erro (`window.onerror` vazio, sem tela de derrota). | Não verifiquei dois navegadores em rede: a autorização do convidado é provada por teste unitário. |
| Prova por critério no SHA final | Este documento e a PR. | Revisão independente pendente por decisão de alpha. |

## O que este card não resolve (ficou para outros)

- O `GameState` transmitido ainda traz todas as unidades e os estoques de todos os donos; filtrar por área de interesse é o
  card #75. Minimapa, mapa-múndi e cena só ocultam inimigos pela névoa do cliente até lá.
- Mapas, listas e busca: o minimapa e o mapa-múndi já desenham inimigos só sob visão; a paleta de busca (#87) ainda não
  existe e deverá consultar `canTarget`.
- A IA não explora: com ilhas separadas por mar e sem exploração, ela não ataca por terra (incursões são o #101).
