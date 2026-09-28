# PoC: ciclo de arquipélago

## Pergunta

Uma partida RTS em estilo voxel consegue sustentar um império dentro de cada
ilha — com aldeões, coleta, construções e tropas — enquanto barcos conectam
ilhas com outras civilizações, aldeias abandonadas e ruínas?

## Hipótese

Cada ilha tem uma visão de estratégia para o arquipélago e um mapa de jogo
expandido ao desembarcar. O terreno em detalhe ocupa mais de mil vezes a área
do marcador da ilha no mapa geral. A simulação inclui coleta direta de
recursos, aldeões selecionáveis, ordens de movimento, casas, quartel e treino
de espadachins.

## Limites desta PoC

- Experimento isolado: não importa código de produção nem altera `src/App.tsx`.
- Usa Three.js, já presente no Terrinha; não compara nem migra para Babylon.js.
- Não implementa multiplayer, persistência, combate, formação de tropas,
  diplomacia, balanceamento ou o HUD final. Coleta e treino são simplificados
  para testar o ciclo conceitual.
- O estado é descartado ao recarregar a página.

## Roteiro de avaliação

1. Entrar na ilha inicial e percorrer o terreno amplo com a câmera.
2. Selecionar um aldeão e ordenar movimento com o botão direito.
3. Reunir recursos, construir casa e quartel; criar aldeões e espadachins.
4. Voltar ao arquipélago, erguer cais, pesquisar Navegação e enviar o barco.
5. Desembarcar em uma civilização vizinha, aldeia abandonada ou ruínas.

## Executar

Na raiz do repositório, dentro desta branch:

```bash
npm ci
npx vite --host 127.0.0.1 --port 5173
```

Abra `http://127.0.0.1:5173/poc.html`. Isso inicia um servidor local separado;
não usa o container do jogo.

## Decisão após a demonstração

- **Avançar:** o ciclo é compreensível e desejável; criar épica e fatiar trabalho
  de produto com critérios e riscos próprios.
- **Reformular:** a fantasia funciona, mas a informação, os custos ou o fluxo não.
- **Encerrar:** o ciclo não melhora a experiência ou exige uma mudança técnica
  desproporcional.

Não reutilizar automaticamente este código na versão do jogo. A implementação
de produto deve começar numa branch nova a partir da `main` atual, depois da
decisão e da revisão técnica.
