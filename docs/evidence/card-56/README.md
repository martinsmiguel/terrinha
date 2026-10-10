# Card #56 — avaliação do HUD: PoC contra HUD atual (rodada do agente, provisória)

**Status honesto:** esta é a rodada do agente, feita por decisão do Miguel ("a avaliação humana vem ao final dos cards"). Ela mede
**exequibilidade, passos de interação e defeitos observados**, não tempo nem facilidade percebida. Os números de jogador ficam em
`avaliacao-humana.csv` (todas as células vazias), a preencher na fatia ALPHA-HUMANO do #89. As decisões abaixo são provisórias até lá.

## Ambiente reproduzível

- Código: `main` no SHA do PR; `npm install`, `npm run dev` (porta 3000) ou `npm run build && npm start`.
- Página: `http://localhost:3000/poc-avaliacao.html` recém-carregada, viewport 1366x768, mesma partida de teste nas duas interfaces
  (HUD atual = `/poc.html`; PoC = `/poc-hud.html`, que sobrepõe o HUD à partida real e usa números ilustrativos).
- Execução: colar `harness-agente.js` no console da página (ou `fetch` do arquivo servido pelo dev server). Ele troca de interface,
  executa as 13 medições pela DOM do iframe, conta passos e confere o estado final.
- Defeito de ambiente achado e corrigido: o servidor de desenvolvimento servia `index.html` para as três páginas de avaliação
  (`req.path` é `/` dentro de `app.use('*')`). `serverPages.ts` decide pela URL original; teste em `tests/unit/serverPages.test.ts`.

## Resultado por tarefa (agente)

| Tarefa | HUD atual | PoC |
| --- | --- | --- |
| Madeira e contexto do recurso | sim, 1 passo, dados reais | sim, 1 passo, números ilustrativos |
| Aldeão ocioso | sim, 1 passo, seleciona de verdade | **não**: só mostra a contagem |
| Catálogo ou busca | sim, 2 passos (abre e fecha) | sim, 3 passos; sem índice real do catálogo |
| Mapa-múndi, outra ilha | **não**: só a natal está descoberta (névoa) | sim, 1 passo, mas com nomes ilustrativos |
| Localidade e voltar ao foco | sem equivalente | sim, 3 passos; "Limpar foco" não restaura o foco anterior |
| Comando em lote e desfazer | sem equivalente | sim, 5 passos, prévia dos alvos, ilustrativo |
| Radial, comando e Esc | sem equivalente | sim, 4 passos |
| Minimizar e restaurar | sem equivalente | sim, 3 passos (Alt+H restaura) |
| Desfazer/refazer painel | sem equivalente | sim, 5 passos; Shift+Z sozinho não refaz |

## Regra dos 10%

Com passos de interação (e não tempo) como substituto, **nenhuma hipótese comparável mostra ganho de pelo menos 10%**: madeira empata (1 e 1),
catálogo/busca é pior na PoC (3 contra 2), aldeão ocioso piora (a PoC não executa a ação) e o mapa só "ganha" porque a PoC usa dados ilustrativos.
Pela regra, o ganho **não está demonstrado**; manter qualquer hipótese exige a mudança explícita do critério pelo responsável ou o resultado humano.

## Decisões provisórias por fatia

| Fatia | Decisão | Motivo |
| --- | --- | --- |
| Menu radial (#60) | **reformular** | Funciona, mas só repete 5 comandos já acessíveis por teclado e busca; sem ganho demonstrado |
| Comando em lote (#61) | **avançar** | Prévia dos alvos e desfazer funcionam e são o desenho certo para #77/#87; depende de ordens reais |
| Minimizar e restaurar | **avançar** | Baixo risco, 3 passos, complementa o modo oculto (H) já existente |
| Histórico de painéis | **reformular** | Shift+Z sozinho não refaz; definir o atalho e o escopo (só layout) |
| Localidades no HUD | **avançar** | Já coberto pela administração de colônias no mapa-múndi (#69); falta restaurar o foco anterior |
| Busca da paleta (#58) | **reformular** | Precisa de índice real (catálogo, localidades, ociosos), não lista fixa |

## Acessibilidade: inclusões e cortes (ADR-0008)

- Incluídos e medidos no #59: atalhos sem colisão, overlays com foco preso, contraste AA, `prefers-reduced-motion`, encaixe responsivo.
- Adiados (card #115): escala do HUD 75-200%, perfis de daltonismo, remapeamento completo de teclas, contraste AAA.
- Cortes propostos por esta rodada: nenhum; a PoC não mostrou ganho que justifique cortar a acessibilidade da proposta.

## Critérios dos cards de implementação (a revisar após a avaliação humana)

- #57/#58: o painel contextual só avança com os dados reais da partida (a PoC é ilustrativa); a busca precisa de índice real.
- #60: o radial só entra com ganho humano ≥10% ou mudança de critério pelo responsável.
- #61: o lote entra com prévia, confirmação e desfazer; ligar às ordens autorizadas do host.
- #97/#115: personalização local e acessibilidade adiada continuam como estão.

## Limites

- Passos de interação não são tempo; leitura, facilidade e controle percebido não foram avaliados.
- A PoC usa números e nomes ilustrativos; a comparação de conteúdo é qualitativa.
- Uma única execução do harness, sem repetição entre dispositivos; viewport único 1366x768.
