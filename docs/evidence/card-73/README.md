# Card #73 — configurar rotas e informar bloqueios de comboios

Código: `src/components/RoutePanel.tsx` (configuração e acompanhamento no painel do mercante), `pauseRoute`/`resumeRoute`/`routeView`/`routeAlerts`/`findBerth`
em `src/game/tradeRoutes.ts`, comandos `pause_route` e `resume_route`, faixa de alertas no `App.tsx`.
Testes: `tests/unit/routeUi.test.ts` (522 no total, lint e build ok).

| Critério | Prova |
| --- | --- |
| Configurar portos, recurso e quantidade nas duas pernas e confirmar comando real autorizado | O formulário monta `set_route` (portos A/B, ida, volta ou vazia, parcial) e envia ao host; a prévia usa `routeProblems`; teste de autorização do host com capacidade excedida recusada |
| Estados carregando, viajando, descarregando, retornando, esperando, bloqueada, pausada e perdida com motivo | `routeView` mapeia os oito estados; o motor produz esperando, perdida e pausada com motivo |
| Cancelar, pausar e redirecionar não devolvem carga em trânsito nem duplicam entrega; alerta localiza sem revelar inimigo oculto | Testes: porão intacto em pausa, cancelamento e redirecionamento; uma única entrega no novo porto (100 na colônia, metrópole em 900); `routeAlerts` só lista barcos do próprio jogador e foca no próprio barco |

Controle negativo: sem a checagem de pausa no motor, o teste de pausa falha.

## Limites

- A faixa de alertas aparece acima do minimapa e leva a câmera ao barco; não há som nem histórico.
- O nome dos cais na lista é "Cais N (x, z)"; não há nomes personalizados.
- Um cais só entra na lista se houver água navegável a até 8 células (`findBerth`).
- Verificação visual no navegador não foi feita nesta sessão.
