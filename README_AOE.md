# Age of Empires Clone - Guia de Uso

Este projeto é um clone de Age of Empires 3 que roda no navegador e permite partidas multiplayer em rede local (LAN).

## Como rodar localmente (Desenvolvimento)

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Inicie o servidor:
   ```bash
   npm run dev
   ```
3. Acesse `http://localhost:3000` no seu navegador.

## Como rodar com Docker (Produção/LAN)

1. Certifique-se de ter o Docker e Docker Compose instalados.
2. Suba o container:
   ```bash
   docker-compose up --build
   ```
3. O jogo estará disponível na porta `3000`.

## Como jogar em Multiplayer LAN

1. **Host**: Um jogador clica em "Criar Partida".
2. **IP**: Descubra o IP local do computador host (ex: `192.168.1.50`).
3. **Outros Jogadores**: Abrem o navegador no endereço do host `http://192.168.1.50:3000`.
4. **Entrar**: Digitem o mesmo ID da sala e cliquem em "Entrar".

## Tecnologias Utilizadas

- **Frontend**: React, Three.js (3D), Tailwind CSS.
- **Backend**: Node.js, Express, Socket.io (Signaling).
- **Multiplayer**: P2P via WebRTC (PeerJS).
- **Pathfinding**: A* algorithm.
