import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { Server } from 'socket.io';
import { describe, expect, it } from 'vitest';

async function smoke(fallback: boolean) {
  const titles: Record<string, string> = {
    '/': 'Age of Empires: Browser Clone',
    '/poc.html': 'Terrinha — Partida RTS',
    '/poc-hud.html': 'Terrinha — PoC de HUD',
    '/poc-avaliacao.html': 'Terrinha — Avaliação da PoC de HUD',
    '/poc-personalizacao.html': 'Terrinha — Protótipo de personalização do HUD',
    '/poc-radial.html': 'Terrinha — Protótipo do menu radial',
  };
  const http = createServer((req, res) => {
    if (req.url === '/api/lan-info') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ port: 3000, localIps: [] }));
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<title>${titles[fallback ? '/' : req.url ?? '/']}</title>`);
    }
  });
  const io = new Server(http);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Endereço HTTP indisponível');
  const child = spawn(process.execPath, ['scripts/smoke-production.mjs', `http://127.0.0.1:${address.port}`]);
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  const timeout = setTimeout(() => child.kill(), 15000);
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
    return { code, output };
  } finally {
    clearTimeout(timeout);
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
}

describe('smoke de páginas de produção #55', () => {
  it('aceita páginas próprias, contrato de API e websocket', async () => {
    const result = await smoke(false);
    expect(result.code).toBe(0);
    expect(result.output).toContain('Socket.IO: conexão websocket confirmada');
  }, 20000);
  it('recusa HTTP 200 quando fallback entrega a página errada', async () => {
    const result = await smoke(true);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('/poc.html: título incorreto/fallback');
  }, 20000);
});
