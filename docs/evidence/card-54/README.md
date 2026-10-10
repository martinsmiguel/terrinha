# Evidências do card #54 (fatia A054)

Ambiente: macOS (Apple M1), Node 22; testes de unidade e verificação no jogo (treino solo, `/poc.html`) no navegador embutido.

| Critério | Prova | Limite |
| --- | --- | --- |
| Todos os caminhos de navegação usam a mesma regra de destino permitido | `resolveNavigationTarget` em `src/game/worldMap.ts` é a única regra. Usada pelo clique no canvas do mapa-múndi, pela lista de ilhas e pelo clique/arrasto do minimapa. A futura paleta de busca (#87) deve usá-la. | Ordens de movimento de unidades para território desconhecido continuam permitidas (é como se explora); a regra vale para a câmera. |
| Ilha só com a borda descoberta: navega a ponto permitido ou explica; não salta a célula desconhecida | `tests/unit/worldMap.test.ts`: só a borda leva ao ponto explorado mais próximo do centro (nunca ao centro desconhecido, sempre dentro do raio da ilha); ilha desconhecida recusa com mensagem. No jogo: a lista mostra "Ilha Árida 28,9 (borda)" em vez do centro (`mapa-mundi-borda-e-aviso.jpg`). A lista deixou de exibir o centro de ilhas parcialmente descobertas, que revelava um ponto desconhecido. | |
| Cobrir ilha parcialmente descoberta, totalmente desconhecida, centro conhecido e modo desenvolvedor | Quatro testes dedicados em `worldMap.test.ts`, mais ponto conhecido e desconhecido e a mesma regra em mundo de 192. | |
| Seleção e ordens pendentes permanecem intactas ao abrir e fechar o mapa | No jogo: aldeões selecionados e modo de construção "Casa" ativo antes de abrir o mapa; após clicar em região desconhecida (mapa continua aberto com o aviso) e fechar com Esc, a seleção e a construção pendente continuam. `hotkeys.test.ts` (#59): Esc fecha só o overlay mais recente sem limpar seleção ou ordens. | A verificação da seleção foi manual no navegador, não automatizada. |
| Prova por critério no SHA final | Este documento e a PR. | Revisão independente pendente por decisão de alpha. |
