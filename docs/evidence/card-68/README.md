# Card #68 — depósitos e estoques locais

Código: `src/game/depots.ts` (domínio puro, na lista de fronteiras), `GameState.localStocks`, `localityOf` no terreno procedural,
pagamento local em `applyBuildingFoundation`, `networkCommands` (obra e treino), treino/cancelamento no `App.tsx` e perda de estoque no tick.
Testes: `tests/unit/depots.test.ts` (476 no total, lint e build ok).

| Critério | Prova |
| --- | --- |
| Estoque = (dono, ilha); local paga ação local; agregado não paga | `canPayAt`/`debitAt`: com metrópole de 1000 e estoque local vazio, obra e treino na colônia são recusados |
| Kit desembarcado cria depósito provisório, sem coleta/produção antes de posto completo; kit transfere uma vez | `landKit` (idempotente, exige posto na ilha), `creditAt` e `productionPaused` |
| Débito/crédito/cancelamento conservam quantidade e origem; recusa saldo insuficiente; vários depósitos preservam saldo; último destruído perde o local | transferência soma 1000 antes e depois; `refundAt`; `reconcileDepots` |
| Perda do posto não debita de novo; repetição não duplica | reconcile idempotente, uma única notificação no tick; devolução sem depósito é perdida, não duplicada |

Controle negativo: se o estoque local cair no agregado da metrópole, 8 testes falham.

## Limites

- Aplicado em obra, treino e refino (serralheria colonial refina o estoque da ilha, só com posto concluído). O câmbio local (`tradeAt`)
  existe e é testado, mas o comando `trade` não identifica o mercado usado; continua na metrópole até a seleção de mercado do #69.
- Coleta de recursos ainda credita a metrópole; a coleta local por ilha entra com o transporte (#70/#72).
- O primeiro posto de uma ilha sem depósito é pago pela metrópole (não há estoque local antes dele).
- A pesquisa continua na metrópole, como pedido.
- Sem avaliação humana de jogo.
