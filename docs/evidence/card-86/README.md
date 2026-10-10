# Card #86 — carga, rotas e alertas no minimapa

Código: `src/game/alerts.ts` (alertas agrupados por objeto: rota, tempestade, combate, sede em risco; marcadores de barco com porão/rota; descrição de perna e porão),
faixa de alertas única no `App.tsx` (substitui as faixas separadas de rota e tempestade) e marcadores no `Minimap.tsx` (anel âmbar = porão, anel ciano = rota, ponto vermelho = alerta).
Testes: `tests/unit/alerts.test.ts`.

## Medição do padrão fechado (partida solo real, painel contextual fechado, sem alertas)

| Viewport | HUD cobre | Colisão entre elementos | Toca o centro (30–70%) |
| --- | --- | --- | --- |
| 1440x900 | **19,3%** (meta < 21%) | nenhuma | nenhum |
| 1165x650 | 35,9% | nenhuma | nenhum |
| 390x844 | 52,5% | nenhuma | 2 elementos (cabeçalho e minimapa) |

Cobertura = união das caixas de cabeçalho, minimapa, dock de seleção e botões Painel/Talentos/Ponte sobre a área da janela (grade 120x120).

## Limites

- A meta de 21% é cumprida só em 1440x900; em 1165x650 ela sobe a 35,9% (sem colisão, como pedido) e em 390x844 o HUD ocupa mais da metade da tela e invade o centro: o celular não é promessa deste card.
- Som de alerta opcional não foi implementado (texto e localização sim).
- "Localizar" só move a câmera para algo próprio ou região conhecida; não emite ordem nem cita o agressor (teste).
- Também: o servidor aceita `PORT` (padrão 3000), necessário porque a porta 3000 já estava ocupada por um contêiner Docker durante a medição.
