# Card #97 — personalização local do HUD: protótipo e decisão

## Decisão: descartado

O responsável do produto avaliou o protótipo e **encerrou a personalização local como descartada** (10/10/2026), sem a avaliação estruturada com jogador (#56) nem revisão independente. Nada foi integrado ao jogo.
O protótipo (`/poc-personalizacao.html`, `src/game/hudLayoutProfile.ts`) foi **removido do `main`** no card #166; o código continua no histórico, no commit `f24a8c8` (PR #165).
A escala global do HUD e o remapeamento de teclas continuam disponíveis pelo card #115.

## O que o protótipo cobria (`src/game/hudLayoutProfile.ts`, 21 testes, hoje só no histórico)

| Critério do card | Estado no protótipo |
| --- | --- |
| Controles de posição, escala, opacidade e grupos | Os quatro existem para avaliar; **você decide quais ficam** |
| Protótipo separado, com dados identificados como mock | Sim: página própria, selo e rótulo "dados ilustrativos" |
| Preview, aplicar, cancelar, reset | Sim, com testes (a prévia não toca o perfil em uso; cancelar o devolve intacto) |
| Perfis locais, importação validada, histórico limitado só da configuração | Sim: 8 perfis, importação estrita com limite de 8 KB, histórico de 20 |
| Colisões, indicadores essenciais, teclado, resoluções | Sim, no modelo (abaixo); teclado: controles nativos de formulário, caixas como botões, Ctrl/Cmd+Z |
| Escala e remapeamento conforme #59 | Não integrados: o #115 entregou escala global do HUD e remapeamento de teclas, que são independentes da escala por painel deste protótipo |
| Decisão e cortes registrados | **Pendente (humano)** |

### Regras que o protótipo impõe

- **Indicadores essenciais** (recursos e população): não podem ficar ocultos (nem por grupo), nem com opacidade abaixo de 0,8, nem cobertos por outro painel ou fora da tela. Aplicar é **bloqueado** com a razão.
- Sobreposição entre outros painéis e painel fora da tela são **avisos**, não bloqueios: o jogador pode querer isso.
- Importação recusa campos e painéis desconhecidos, tipos errados, números fora de faixa, NaN e infinitos, nome vazio ou grande demais, JSON inválido e arquivo grande demais. Nunca lança.
- O perfil padrão não tem sobreposição nem painel fora da tela em 1920x1080, 1366x768, 414x896 e 375x667 (teste).

### Verificado no navegador

Prévia, cancelar, aplicar (com histórico e `localStorage`), bloqueio ao cobrir o indicador essencial em 375x667, importação inválida recusada com os motivos, exportar e importar de volta, salvar perfil e desfazer.

## Limites

- As caixas dos painéis são um **modelo** do HUD, não as caixas renderizadas do jogo. Antes de integrar ao HUD (#57), a análise de colisão precisa rodar sobre as âncoras reais.
- Sem arrastar com mouse: a posição vem de âncora e deslocamento por controles. Se o arrastar importar para você, é um corte ou acréscimo a decidir.
- Sem avaliação com pessoas e sem teste em celular real. Nenhuma facilidade, rapidez ou usabilidade foi medida.
- O armazenamento é por navegador e por origem; não há conta nem sincronização (fora do escopo, como o card pede).
