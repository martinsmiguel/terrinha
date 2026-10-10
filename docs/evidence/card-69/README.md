# Card #69 — administrar entrepostos e estoques locais

Código: `localityOverview` em `src/game/depots.ts`; seção "Metrópole e colônias" no `WorldMapModal.tsx` (reusa o overlay, o foco e a regra única de descoberta);
bloco do posto no `SelectionPanel.tsx`; comando `trade` com `marketId` (validação, autorização e host) para o câmbio local, selecionando o mercado da colônia.
Testes: `tests/unit/colonyAdmin.test.ts` (513 no total, lint e build ok).

| Critério | Prova |
| --- | --- |
| Metrópole, colônias e regiões com informação conhecida; saldo aplicável e total com rótulos distintos, sem duplicar estoque | Linhas natal/colônia/região; ilha desconhecida omitida; "Saldo aplicável (localidade)" por linha e "Total do império" à parte: 500 + 40 = 540, cada estoque uma vez |
| Posto/depósitos/posse/produção bloqueada e motivo; foco e câmera preservam ordens e descoberta; comandos autorizados | `completeDepots`, `productionBlocked` e `reason`; "Ir" usa `resolveNavigationTarget` (ponto não explorado é recusado) e só move a câmera; câmbio local autorizado só para mercado próprio, concluído e com saldo local |

Controle negativo: contar o estoque em dobro no total faz o teste falhar.

## Limites

- A administração fica no mapa-múndi (tecla M do minimapa/botão); não há tela separada nem atalho próprio.
- Câmbio local: o jogador seleciona o mercado concluído da colônia e usa o Mercadão; sem mercado selecionado continua a metrópole.
- Posse mostrada é sempre "sua" na lista (a visão lista só os postos do jogador local).
- Verificação visual no navegador não foi feita nesta sessão.
