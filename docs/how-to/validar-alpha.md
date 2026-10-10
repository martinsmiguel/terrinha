# How-to: testar o alpha e conferir cada marco

Este roteiro serve para a validação **humana** do alpha (card #89): cada passo diz o que fazer, o que deve acontecer e onde olhar quando não acontece.
Tudo foi implementado e testado por automação; **nenhum item abaixo foi validado por jogador** até você marcar.

## Subir a versão atual

```bash
docker compose up --build -d      # reconstrói a imagem; um contêiner antigo na porta 3000 continua com o código velho
```

Sem Docker: `npm ci && npm run build && npm start` (porta 3000) ou `PORT=3100 npm run dev`. Abra `http://localhost:3000`.
No lobby: "Treino Solo", escolha jogadores (2 a 4), **comportamento da IA** (Pacífico, Defensivo, Incursões) e **tamanho do mundo** (60 e 192 são os suportados; 384 e 768 são experimentais).

## Roteiro por marco

| Marco | Faça | Esperado |
| --- | --- | --- |
| **M1 — chegada** | Entre numa partida. Selecione a carroça, escolha um dos sítios de capital, confirme. | Sem Centro fixo no início; carroça, 2 aldeões, 1 soldado; a capital leva 20 s para ficar pronta; cancelar a prévia não muda nada. |
| **M2 — mundo** | Abra o mapa-múndi (botão do minimapa). Jogue em mundo 192. Em LAN, abra com 2 a 4 dispositivos. | Seis ilhas; só as descobertas aparecem; o convidado não vê o que o host não vê; sem engasgo em 192. |
| **M3 — colônias** | Aldeão selecionado, tecla **U**: posto avançado a 24 ou mais da capital. Cais (**B**) e treine o **Transporte Colonial** (**X**). Selecione o transporte: carregue o kit, embarque tropas, navegue, desembarque. | O posto marca território e cura; o transporte leva 6 tropas e 200 de carga; o mapa-múndi mostra saldo por ilha e total do império. |
| **M3 — rotas** | Com dois cais e um **Barco Mercante** selecionado, configure a rota no painel "Rota comercial". | Estados: carregando, viajando, descarregando, retornando, esperando, bloqueada, pausada, perdida; alertas na faixa acima do minimapa com "Localizar". |
| **M3 — pontes** | Botão **Ponte** no painel do HUD, dois cliques nas margens de um rio ou lago da mesma ilha. | Recusa vão acima de 12, oceano e outra ilha; custa 150/50/20 e leva 20 s; só concluída deixa passar; destruída, as unidades voltam à margem. |
| **M3 — IA** | Perfil Incursões: espere 300 s depois da capital. | A IA constrói quartel (e, para outra ilha, serraria, cais e transporte) e ataca só o que já descobriu. |
| **M4 — HUD** | **Ctrl/Cmd+K** busca; **J** painel; **I** composição; **Ctrl/Cmd+Z** e **Ctrl/Cmd+Shift+Z** desfazem a configuração do HUD; **H** oculta/restaura. | Painel começa fechado, dados reais da partida, fluxo líquido por minuto, busca com `#` tecnologias, `@` localidades e `!` ociosos/ordens (prévia e desfazer do lote). |
| **M5 — talentos** | **Alt+T**. Colete, pesque, descubra e funde para ganhar XP; compre um talento. Painel do HUD lista plantas e monumentos conhecidos. | Cinco maestrias, pontos por nível, seis talentos com efeito real; a partida não pausa com o painel aberto. |
| **M6 — mar e regras** | Observe o mar e os barcos (ondas só visuais). Espere uma tempestade (aviso de 10 s). **Alt+R** abre as regras da sessão. | Barcos dentro do raio perdem 2 HP/s; o host aplica regras (prévia, aplicar, redefinir); convidado só consulta. |

## O que ainda não foi validado e limites conhecidos

- Quatro dispositivos em LAN real, avaliação humana do HUD e acessibilidade, e a publicação do pré-release: **só você** pode fechar (gates do #89).
- Mundo 384/768: a primeira ordem em massa engasga (57 a 154 ms); o tick estável é leve.
- Ponte, ondas e tempestade não têm modelo 3D dedicado (só lógica, HUD e alertas); sem som de alerta.
- Em celular (390x844) o HUD cobre mais da metade da tela e o painel aberto invade o centro.
- Cards em Backlog por dependerem da sua decisão: radial (#60) e personalização local (#97).
