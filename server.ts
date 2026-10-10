import { EVALUATION_PAGES, pageForUrl } from './serverPages';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { GAME_STATE_COMPRESSION_OPTIONS } from './src/game/networkSync';
import { registerGameSocketHandlers } from './src/game/socketServer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    ...GAME_STATE_COMPRESSION_OPTIONS,
    cors: {
      origin: '*',
    },
  });

  app.use(express.json());

  // Endpoint to return LAN IPs for sharing with other players
  app.get('/api/lan-info', (_req, res) => {
    res.json({
      port: Number(process.env.PORT) || 3000,
      localIps: getLocalIpAddresses(),
    });
  });

  // Socket.io for Real-Time Offline LAN Synchronization & Signaling
  registerGameSocketHandlers(io);

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const viteServer = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(viteServer.middlewares);
    app.use('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        const page = pageForUrl(url);
        const indexPath = path.resolve(__dirname, page);
        let template = fs.readFileSync(indexPath, 'utf-8');
        template = await viteServer.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        viteServer.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const clientDir = path.resolve(__dirname, '../dist');
    app.use(express.static(clientDir));
    // Uma página de avaliação ausente não pode parecer válida via fallback SPA.
    app.get([...EVALUATION_PAGES], (_req, res) => res.sendStatus(404));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Age of Empires Dev Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
