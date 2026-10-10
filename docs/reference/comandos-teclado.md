# Referência: comandos de teclado

> Quadrante **Referência** — dados exatos. Fonte: `src/game/hotkeys.ts` (registro único de atalhos).

## Câmera e navegação

| Tecla | Ação |
| --- | --- |
| `W` `A` `S` `D` / setas | Mover câmera |
| Borda da tela | Pan automático ao mover o mouse |
| Scroll do mouse | Zoom |
| Botão do meio + arrastar | Pan livre |
| `Espaço` | Centralizar na seleção (ou no Centro da Vila) |
| `L` | Travar/destravar câmera |

## Seleção e ordens

| Ação | Comando |
| --- | --- |
| Selecionar | Clique esquerdo |
| Seleção múltipla | Arrastar retângulo |
| Ordem (mover/atacar/coletar) | Clique direito |
| Cancelar modo/limpar seleção | `Esc` |

## HUD

| Tecla | Ação |
| --- | --- |
| `H` | Mostrar/ocultar HUD (modo cinemático) |
| `C` | Alternar HUD completo ↔ compacto |
| `M` | Recolher/expandir minimapa |
| `K` | Abrir/fechar catálogo do império |
| `Z` | Abrir/fechar modal de zonas de trabalho |

## Construção (com aldeão selecionado)

| Tecla | Edifício |
| --- | --- |
| `Q` | Casa Colonial |
| `W` | Quartel Militar |
| `E` | Torre de Vigia |
| `R` | Serralheria & Madeireira |
| `T` | Mineradora & Pedreira |
| `Y` | Mercadão do Império |
| `F` | Fazenda & Granja |
| `B` | Cais & Doca Naval (só em margem do oceano navegável) |

## Treino (com edifício próprio selecionado e concluído)

| Edifício | Tecla | Unidade |
| --- | --- | --- |
| Centro da Vila | `V` | Aldeão |
| Quartel Militar | `S` | Soldado |
| Quartel Militar | `G` | Cavalaria |
| Cais Naval | `P` | Barco de Pesca |
| Cais Naval | `M` | Barco Mercante |
| Cais Naval | `G` | Barco de Guerra |

## Regras de resolução

- **Colisão do `M`:** com o Cais próprio e concluído selecionado, `M` treina o Barco Mercante e
  não alterna o minimapa; o minimapa continua no botão. Em qualquer outro caso `M` recolhe/expande
  o minimapa. É a única tecla repetida entre escopos e está declarada em `RESOLVED_CONFLICTS`.
- **Modificadores:** `Ctrl`, `Cmd` e `Alt` nunca disparam comandos de jogo (`Ctrl+C`, `Cmd+L` etc.
  ficam para o navegador e o sistema).
- **Controles nativos:** em `input`, `textarea`, `select` e `contenteditable` o teclado é do controle.
  `Espaço` e `Enter` ativam botões e links focados em vez de centralizar a câmera.
- **Overlays:** com mapa-múndi, zonas de trabalho, catálogo, controles ou tutorial abertos, nenhum
  atalho de fundo nem a câmera (`WASD`/setas) responde. `Esc` fecha apenas o overlay mais recente e não
  limpa seleção nem ordens. `Tab`/`Shift+Tab` ficam dentro do diálogo e o foco volta ao gatilho ao fechar.
