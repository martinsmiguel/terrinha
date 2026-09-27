# PoC: ciclo de arquipélago

## Pergunta

Uma fatia jogável em estilo voxel, com assentamento, barco e ilhas vizinhas de
estados diferentes (outra civilização, aldeia abandonada e ruínas), consegue
comunicar a fantasia de expansão por arquipélago sem reescrever o jogo atual?

## Hipótese

Uma fatia jogável com ilhas de perfis econômicos distintos, cais, pesquisa de
Navegação e descoberta de uma ilha vizinha pode representar a promessa central
do estudo usando Three.js e uma simulação local pequena.

## Limites desta PoC

- Experimento isolado: não importa código de produção nem altera `src/App.tsx`.
- Usa Three.js, já presente no Terrinha; não compara nem migra para Babylon.js.
- Não implementa multiplayer, persistência, diplomacia, balanceamento ou o HUD
  final. Recursos e ações existem apenas para testar o fluxo conceitual.
- O estado é descartado ao recarregar a página.

## Roteiro de avaliação

1. Observar a ilha inicial, as construções e o barco no cais.
2. Construir o cais e pesquisar Navegação.
3. Escolher uma rota e acompanhar o barco até a ilha próxima.
4. Ler a descoberta: povo vizinho, lugar abandonado ou ruínas.
5. Avaliar se a viagem e o tipo de descoberta despertam vontade de continuar.

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
