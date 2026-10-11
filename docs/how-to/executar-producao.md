# Executar o servidor de produção e a avaliação do HUD

Na raiz do repositório:

```bash
npm ci
npm run build
npm start
```

O build gera `dist/` para o cliente e `dist-server/server.js` para o servidor.
`npm start` usa NODE_ENV=production e executa o JavaScript compilado. `npm run dev`
continua usando tsx e Vite; não é o comando de produção. Não executar server.ts
com Node dentro da imagem runtime: os módulos locais são empacotados no build SSR.

## Docker e Watch

```bash
docker compose up --build --watch
```

O Compose reconstrói quando mudam src/, server.ts, os quatro HTMLs, os dois
configs Vite, tsconfig, manifests npm ou Dockerfile. Watch é auxílio de
desenvolvimento: para servidor fixo, usar `docker compose up --build -d`.

## Rotas e smoke

| URL | Conteúdo esperado |
| --- | --- |
| `/` | Jogo normal, começando no lobby |
| `/poc.html` | Prévia solo da partida |
| `/poc-hud.html` | PoC de HUD sobre a prévia |
| `/poc-avaliacao.html` | Página de avaliação da PoC |
| `/poc-personalizacao.html` | Protótipo de personalização local do HUD (#97), para avaliação |
| `/api/lan-info` | JSON com port e localIps |

As PoCs são avaliação, não funcionalidades de HUD aprovadas. A prévia solo e a
ocultação do HUD são condicionadas à rota /poc.html; o parâmetro hud-preview na
rota normal não ativa a prévia. Este trabalho não adiciona comandos de cheat.
Página PoC ausente retorna 404, sem mascarar erro como index.html. O fallback
SPA continua para outras rotas do cliente.

Em outro terminal, com o servidor ativo:

```bash
npm run smoke -- http://127.0.0.1:3000
```

O smoke exige títulos distintos, assets compilados com tipo não HTML, contrato
JSON de LAN e conexão websocket Socket.IO. HTTP 200 do fallback não passa. Uma
conexão local prova disponibilidade do servidor, não jogo entre aparelhos na LAN,
funcionamento visual da PoC, avaliação de jogador ou desempenho.
