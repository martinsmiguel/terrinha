# Card #60 — protótipo do menu radial, para avaliação humana

**Nenhuma decisão foi tomada.** Este protótipo existe para o jogador decidir manter, reformular ou encerrar o radial (#56). Se for encerrado, o card
fecha como descartado, sem implementação.

## Como avaliar

`npm run dev` e abra `http://localhost:3000/poc-radial.html` (em produção, a mesma rota). Clique no palco para escolher o cursor, abra o radial com
**Alt+Q** (ou o botão), escolha um comando com Enter ou clique (nunca por hover), use as setas para mover o foco e **Esc** para fechar; o foco volta ao
elemento anterior. "Medir todas as resoluções" roda 9 posições de cursor em 4 resoluções, com o painel contextual aberto e fechado. A página guarda
sua decisão e suas observações só no navegador.

Os seis comandos são **de interface** (painel, minimapa, catálogo, busca, centralizar, ocultar HUD) e todos já existem por teclado ou botão. Nada é enviado à
partida. O radial da PoC grande (`poc-hud.html`) continua como estava.

## O que foi medido (modelo, `medicao.json`)

| Resolução | Cabe sem cobrir o chrome | Área máxima | Menor alvo |
| --- | --- | --- | --- |
| 1920x1080 | 18 de 18 | 8,0% | 88 px |
| 1366x768 | 18 de 18 | 15,8% | 88 px |
| 414x896 | 18 de 18 | 18,9% | 83 px |
| 375x667 | 18 de 18 | 18,8% | 68 px |

O limite do card é **menos de 20% da tela**; o diâmetro é limitado por isso e a busca escolhe o ponto livre mais próximo do cursor, reduzindo o
diâmetro quando preciso (mínimo 158 px, que acomoda alvos de 44 px). Cursor em canto ou borda desloca o centro para dentro da viewport.

### Limites desta medição

- O chrome é um **modelo** (faixa de recursos, trilho, minimapa, dock e painel), não as caixas renderizadas do jogo. As âncoras reais (corner-top, cartão de
  seleção, avisos e notificações) não entram. A PoC grande mede o DOM real e, em tela estreita, **recolhe o HUD** para abrir o radial; este modelo não prevê isso.
  Antes de implementar, a medição precisa rodar sobre o HUD real.
- Medido sem pessoas: não diz se o radial é mais rápido ou mais fácil do que teclado, busca e botões. A rodada do agente no #56 não mostrou ganho de pelo menos 10%.

## Achados

1. **Alt+R, a tecla sugerida no card, colide hoje com as regras da sessão (#88).** `Alt+T` colide com os talentos. A consulta é feita no resolvedor real
   (`resolveHotkey`), e o teste fixa isso. Letras livres para Alt+letra: `abcdefghijklmnopqsuvwxyz`. O protótipo usa **Alt+Q**.
2. **No macOS, Option+letra muda `event.key`** (por exemplo Option+T vira `†`). O protótipo usa `event.code`. O resolvedor do jogo usa `event.key`, então
   Alt+T e Alt+R já podem não funcionar em Mac; vale conferir antes de pôr mais atalhos Alt.
3. Se aprovado, o radial precisa de um atalho livre, do cuidado com os atalhos Alt no Mac e da medição sobre o HUD real.

## Critérios do card

| Critério | Estado |
| --- | --- |
| Avaliação humana decide manter/reformular/encerrar | Pendente: protótipo pronto, decisão sua |
| Comandos frequentes reais, clique/Enter deliberado | Protótipo: Enter/clique, nunca hover; comandos de interface, sem ordens |
| Alt+R sem colisão | **Não atendido**: colide com #88; alternativa Alt+Q |
| Área menor que 20%, posições de borda e resoluções | Atendido no modelo; sem medição no HUD real |
| Esc, foco e atalhos seguem o contrato de overlays | Protótipo: `role="dialog"`, `aria-modal`, Esc fecha e devolve o foco, setas e Tab dentro do radial; sem integração ao `overlayOrder` do jogo |
| Se reprovado, encerrar como descartado | Aguarda a decisão |
