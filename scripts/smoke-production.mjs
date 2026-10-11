import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const base = process.argv[2] ?? 'http://127.0.0.1:3000';
const pages = [
  ['/', 'Age of Empires: Browser Clone'],
  ['/poc.html', 'Terrinha — Partida RTS'],
  ['/poc-hud.html', 'Terrinha — PoC de HUD'],
  ['/poc-avaliacao.html', 'Terrinha — Avaliação da PoC de HUD'],
  ['/poc-personalizacao.html', 'Terrinha — Protótipo de personalização do HUD'],
];
for (const [route, title] of pages) {
  const response = await fetch(new URL(route, base), { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, route);
  const html = await response.text();
  assert.ok(html.includes(`<title>${title}</title>`), `${route}: título incorreto/fallback`);
  assert.ok(!html.includes('/src/main.tsx'), `${route}: entrada não compilada`);
  for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)(?:[^"\s]*)"/g)) {
    const asset = await fetch(new URL(match[1], base), { signal: AbortSignal.timeout(10000) });
    assert.equal(asset.status, 200, match[1]);
    assert.ok(!asset.headers.get('content-type')?.includes('text/html'), `${match[1]}: fallback no lugar do asset`);
  }
  console.log(`${route}: 200, página correta e assets compilados`);
}
const api = await fetch(new URL('/api/lan-info', base), { signal: AbortSignal.timeout(10000) });
assert.equal(api.status, 200);
const info = await api.json();
assert.equal(info.port, 3000);
assert.ok(Array.isArray(info.localIps));
console.log('/api/lan-info: 200, contrato correto');
const socket = io(base, { transports: ['websocket'], reconnection: false, timeout: 10000 });
try {
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  console.log('Socket.IO: conexão websocket confirmada');
} finally { socket.disconnect(); }
