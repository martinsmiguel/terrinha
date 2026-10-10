# Card #57 — composição contextual e painéis recolhíveis do HUD

Código: `src/game/hudConfig.ts` (domínio puro: composições, indicadores, histórico, regra de recarga, leitura do estado real),
`src/hooks/useHudConfig.ts` (dono único da configuração: modo, minimapa, seleção, painel, composição, inatividade),
`src/components/HudContextPanel.tsx` (painel contextual), atalhos `I`, `J`, Ctrl/Cmd+Z e Ctrl/Cmd+Shift+Z em `hotkeys.ts`, ligação em `App.tsx`.
Testes: `tests/unit/hudConfig.test.ts` e `hotkeys.test.ts` (541 no total, lint e build ok).

| Critério | Prova |
| --- | --- |
| Estado real: madeira, comida, ouro, pedra, tábuas, população, filas e seleção; nada demonstrativo | `readHud` lê só `GameState` do jogador (teste com dois donos e jogador sem registro = zeros); no navegador o painel mostrou 350/350/200/100/0 e 4/15, os valores reais da partida |
| Modos com conjunto declarado; vitais sempre acessíveis | `COMPOSITION_INDICATORS` por composição; teste: os 6 vitais aparecem em toda composição e modo não oculto |
| Trocar composição e recolher/reabrir não altera seleção, câmera, ordens nem simulação | O histórico guarda só `HudConfig` (teste de chaves); teste com estado congelado: ler e reconfigurar não muta unidades, ordens nem recursos |
| Painel inicia fechado; centro livre; colisões em 1440x900, 1165x650, 390x844 | Medição no navegador (tabela abaixo) |
| Minimalista com botão e atalho; nada essencial depende de hover | `H` e o botão "Exibir Interface" (já existentes) restauram: verificado; o botão do painel e o desfazer são cliques, sem hover |
| Desfazer/refazer da configuração completa, limite e regra de recarga; nunca a partida | `commit/undo/redo` com limite 50; Ctrl/Cmd+Z e Ctrl/Cmd+Shift+Z (não valem com overlay, em campo de texto nem com Alt); a recarga restaura a configuração, o painel volta fechado e o modo oculto volta completo, o histórico começa vazio |
| Inatividade opcional, desligada por padrão | `idleCollapse: false`; ligada, recolhe o HUD completo para o compacto após 20 s sem entrada |

## Medições no navegador (partida solo real, painel fechado e aberto)

| Viewport | Painel fechado (botão) | Painel aberto |
| --- | --- | --- |
| 1440x900 | não toca o centro, o cabeçalho nem o minimapa; alcançável | 288x363 na borda esquerda, sem colisão |
| 1165x650 | idem | altura limitada à faixa livre (98 px, com rolagem), sem colisão com centro, cabeçalho nem minimapa |
| 390x844 | idem | **cobre parte do centro** (cabeçalho do HUD já ocupa 223 px; o painel aberto passa de 253 a 506 px) |

O painel se posiciona pela medida real do cabeçalho e do minimapa (`data-hud-region="minimap"`), e a rolagem horizontal da página não aparece em nenhum viewport.

Controle negativo: sem a checagem de overlay ou campo de texto, os testes de Ctrl+Z falham; sem o limite, o teste do histórico falha.

## Limites

- Em 390x844, com o painel aberto, o centro do mapa é coberto; o painel é fechável por `J` e pelo botão. O estado padrão (fechado) mantém o centro livre.
- Escolher a composição "Gestão" abre o painel; em tela estreita isso cobre o centro até o jogador fechar.
- Seleção no painel mostra o tipo e o início do ID; o detalhe completo continua no painel de seleção do jogo.
- Atalho único para refazer é Ctrl/Cmd+Shift+Z; Shift+Z sozinho continua sendo o atalho das zonas de trabalho (decisão do #56).
- A verificação por teclado usou eventos sintéticos no navegador do app; não houve teste com leitor de tela.
- Avaliação humana de leitura e controle fica para o #89.
