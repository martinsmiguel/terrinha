# Evidências do card #98 (fatia N01-01)

Ambiente: macOS, Node 22, `npm run dev`, rota `/poc.html` (partida solo, 2 jogadores), navegador embutido
em viewport estreito. Mapa com semente aleatória por carga; sondagem de mapas por teste unitário.
A fatia N01-02 (sede no mundo ampliado) depende de #65, #66 e #74 e não é coberta aqui.

| Critério | Prova | Limite |
| --- | --- | --- |
| Começar sem Centro, com carroça, kit e 2 aldeões e 1 soldado; spawn seguro; 3 sítios distintos, viáveis e descobertos | `tests/unit/capitalSitesOnMap.test.ts`: 10 sementes x 4 chegadas, todas válidas e com 3 ou mais sítios. No navegador o painel ofereceu 3 sítios, todos com "Sítio explorado: sim". Capturas em `painel-tres-sitios-e-verificacao.jpg`. | Mapa atual de ilhas pequenas; o espaço de capital do mundo ampliado é do #65. |
| Preview informa espaço, terreno, acesso e kit; cancelar não muta; host revalida e converte uma vez | `FoundationPanel` mostra as cinco verificações; no navegador, cancelar manteve população 4/15 e recursos. `foundation.test.ts` (uma conversão, sem clonar kit) e `networkCommands.test.ts` (autorização). | Comando de convidado não foi exercitado em rede real, só validado por teste unitário. |
| Defaults: carroça 300 HP, 0,16 por passo, visão 10, sem ataque, conta população; kit 400 madeira e 200 pedra reservado à parte; suprimento 350/350/200/100/0; fundação 20 s, Centro 2400 HP | `foundation.test.ts` ("defaults") e `unitAttributes`. Capital concluiu em 20 s no navegador (`capital-em-obras.jpg`, `capital-concluida.jpg`). | O card pede revisão dos defaults antes do merge: valores seguem a proposta do card e a calibração de jogo fica para a avaliação humana (#56, #89). |
| Vida por fase; ausência inicial de Centro não derrota; entreposto não dá vida extra; limpar eliminado; vitória ou empate com 2, 3 e 4 | `foundation.test.ts` (fases, vitória e empate com 2, 3 e 4, `clearEliminatedOrders`), `simulation.test.ts` (tick e eliminação). | Rotas de comércio ainda não existem; entram com #72 e #73. |
| Host perdido encerra a sessão; convidado que sai conserva ordens, sem IA | `tests/integration/sessionLeave.test.ts` (Socket.IO real, `isHost` no aviso), `networkCommands.test.ts`, `simulation.test.ts` (modo host sem IA). | Tela de sessão encerrada não foi exercitada com dois navegadores. |
| UI, tutorial, minimapa, população e estoque reais | Passo "Fundar a capital" no tutorial (`tutorial.test.ts`); câmera e minimapa centram na carroça antes da capital; população 4/15 para 3/15 ao fundar. | Avaliação humana de usabilidade não foi feita. |
| Prova por critério no SHA final | Este documento e a PR. | Revisão independente pendente por decisão de alpha. |

Descoberta durante a verificação no navegador: o grid de névoa é indexado por inteiros, então a consulta
de "explorado" arredonda para a célula; sem isso apenas sítios de coordenada inteira passavam.
