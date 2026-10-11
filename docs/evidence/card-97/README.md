# Card #97 — protótipo de personalização local do HUD, para avaliação humana

**Nenhuma decisão foi tomada.** O protótipo existe para o jogador decidir quais controles agregam valor e se a personalização avança, é reformulada ou é encerrada (#56).
Se não for aprovada, o card fecha como descartado, sem fingir entrega.

## Como avaliar

`npm run dev` e abra `http://localhost:3000/poc-personalizacao.html` (em produção, a mesma rota).

- Clique em uma caixa do palco (ou use o seletor) para editar: visível, âncora, deslocamento X e Y, escala, opacidade e grupo.
- Toda mudança é **prévia**; o perfil em uso só muda em **Aplicar**. **Cancelar** descarta; **Restaurar padrão** também entra como prévia.
- Perfis nomeados ficam no navegador (máximo de 8). Exportar e importar usam JSON validado; importar só abre prévia.
- Desfazer e refazer (botões ou Ctrl/Cmd+Z) guardam **só a configuração**, até 20 passos.
- A página guarda sua decisão e observações só no navegador.

O conteúdo dos painéis é **ilustrativo (mock)**. Nada aqui executa ação da partida, e o jogo não lê estes perfis.

## O que está implementado (`src/game/hudLayoutProfile.ts`, 21 testes)

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
