import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
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
      port: 3000,
      localIps: getLocalIpAddresses(),
    });
  });

  // Socket.io for Real-Time Offline LAN Synchronization & Signaling
  registerGameSocketHandlers(io);

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const viteServer = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(viteServer.middlewares);
    app.use('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        const indexPath = path.resolve(__dirname, 'index.html');
        let template = fs.readFileSync(indexPath, 'utf-8');
        template = await viteServer.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        viteServer.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Age of Empires Dev Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
