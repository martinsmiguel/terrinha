# Card #72 — viagens automáticas entre dois portos

Código: `src/game/tradeRoutes.ts` (domínio puro, nas fronteiras), campo `Unit.route`, passo de rota no tick de `simulation.ts`,
comandos `set_route`, `cancel_route` e `redirect_route` (validação, autorização e aplicação no host), remoção da renda passiva do mercante.
Testes: `tests/unit/tradeRoutes.test.ts` (506 no total, lint e build ok).

| Critério | Prova |
| --- | --- |
| Um mercante liga dois cais próprios: carregar A → viajar B → descarregar B → carregar B → viajar A → descarregar A; recurso e quantidade por perna; retorno vazio | Ciclo completo com troca madeira/pedra e total conservado; teste de retorno vazio |
| Capacidade 100/125; passageiros impedem rota; esperar estoque ou parcial explícito; 1 s de carga/descarga; entrega só após chegada válida; zero ouro passivo | `routeProblems`; barco espera sem debitar, ou leva o que há com `partial`; teste de viagem sem chegada não entrega; ouro estável por 200 ticks |
| Cancelar preserva o porão; porto perdido ou rota impossível bloqueia e admite redirecionar; transições/perda/repetição conservam estoque e entrega única | `cancelRoute` idempotente; porto destruído bloqueia com a carga a bordo e `redirectRoute` retoma; alcançabilidade; ilha sem posto bloqueia sem perder a carga |

Controle negativo: sem a checagem de chegada, 5 testes falham.

## Limites

- Os comandos de rota existem e são autorizados no host, mas a tela de configuração e os avisos de bloqueio são do #73.
- A chegada usa o ponto de atracação informado na rota (a UI do #73 deve escolher a água junto ao cais).
- A alcançabilidade (A*) só é consultada quando o movimento do barco parou, para não pesar o tick.
- Carga e descarga usam 1 s (proposta do card); o talento de 125 é parâmetro (#82).
- A renda passiva de 0,15 de ouro por mercante foi removida; o mercado continua com sua renda própria.
- Sem avaliação humana de jogo.
