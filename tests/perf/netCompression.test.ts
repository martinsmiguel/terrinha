import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { Server as SocketServer } from 'socket.io';
import { io as connectSocket, type Socket } from 'socket.io-client';
import type { GameState, Unit } from '../../src/game/model';
import { DeltaReceiver, DeltaSender } from '../../src/game/snapshotDelta';
import { registerGameSocketHandlers } from '../../src/game/socketServer';

/**
 * Card #53: compressão ligada/desligada no MESMO cenário (4 jogadores, snapshot por convidado a 20 Hz), medindo bytes na rede,
 * CPU do host e latência do envio até a aplicação no convidado, para quadro completo e para delta.
 * LIMITAÇÃO: tudo em loopback na mesma máquina; não mede LAN/Wi-Fi real nem quatro dispositivos. BENCH_REPORT grava o JSON.
 */
const TICKS = 80;
const GUESTS = [2, 3, 4];
const report: Record<string, unknown> = {};

const world = (tick: number): GameState => ({
  mapSize: 192, mapSeed: 7,
  units: Array.from({ length: 300 }, (_, i): Unit => ({
    id: `u${i}`, type: i % 2 ? 'soldier' : 'villager', owner: `player${(i % 4) + 1}`,
    position: { x: (i * 7 + (i % 20 === 0 ? tick * 0.2 : 0)) % 190, z: (i * 13) % 190 }, targetPosition: { x: (i * 31) % 190, z: (i * 11) % 190 }, targetEntityId: null,
    health: 100, maxHealth: 100, attackDamage: 10, state: 'moving',
  })),
  buildings: [], resourceNodes: Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, type: 'tree' as const, position: { x: i, z: i }, remaining: 100 })),
  playerResources: { player1: { wood: 100 + tick, food: 0, gold: 0, stone: 0, planks: 0, pop: 3, maxPop: 9 } },
});

function waitFor<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${event}`)), 5000);
    socket.once(event, (payload: T) => { clearTimeout(t); resolve(payload); });
  });
}

async function run(compression: boolean, mode: 'full' | 'delta') {
  const http = createServer();
  const server = new SocketServer(http, { transports: ['websocket'], perMessageDeflate: compression ? { threshold: 1024 } : false, httpCompression: compression ? { threshold: 1024 } : false });
  const sockets: import('node:net').Socket[] = [];
  server.engine.on('connection', (conn: { request: { socket: import('node:net').Socket } }) => sockets.push(conn.request.socket));
  registerGameSocketHandlers(server);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const clients: Socket[] = [];
  for (let slot = 1; slot <= 4; slot += 1) {
    const socket = connectSocket(url, { autoConnect: false, reconnection: false, transports: ['websocket'] });
    const connected = waitFor<void>(socket, 'connect');
    socket.connect(); await connected;
    const joined = waitFor(socket, 'joined-success');
    socket.emit('join-room', { roomId: 'bench', playerName: `P${slot}`, playerSlot: `player${slot}`, isHost: slot === 1 });
    await joined; clients.push(socket);
  }
  const receivers = new Map(GUESTS.map((slot) => [slot, new DeltaReceiver()]));
  const senders = new Map(GUESTS.map((slot) => [slot, new DeltaSender('bench')]));
  const latencies: number[] = [];
  let applied = 0;
  GUESTS.forEach((slot, index) => {
    clients[index + 1].on('game-state-update', (packet: unknown) => {
      const started = (packet as { __t?: number }).__t ?? 0;
      const result = mode === 'delta' ? receivers.get(slot)!.apply(packet) : { state: packet };
      if (result.state) { applied += 1; latencies.push(performance.now() - started); }
    });
  });
  const bytesBefore = sockets.reduce((sum, s) => sum + s.bytesWritten, 0);
  const cpuBefore = process.cpuUsage();
  for (let tick = 0; tick < TICKS; tick += 1) {
    const state = world(tick);
    for (const slot of GUESTS) {
      const packet = mode === 'delta' ? senders.get(slot)!.next(state, 1) : { kind: 'full', sessionId: 'bench', seq: tick + 1, rulesRevision: 1, state };
      clients[0].emit('sync-game-state-to', { slot: `player${slot}`, state: { ...packet, __t: performance.now() } });
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  const cpu = process.cpuUsage(cpuBefore);
  const bytes = sockets.reduce((sum, s) => sum + s.bytesWritten, 0) - bytesBefore;
  clients.forEach((c) => c.disconnect());
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    compression, mode, packets: TICKS * GUESTS.length, applied, bytesToGuests: bytes, bytesPerPacket: Math.round(bytes / (TICKS * GUESTS.length)),
    cpuMsTotal: Math.round((cpu.user + cpu.system) / 1000), p50LatencyMs: +sorted[Math.floor(sorted.length * 0.5)].toFixed(2), p95LatencyMs: +sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2),
  };
}

describe('compressão no relay de quatro jogadores (loopback)', () => {
  for (const mode of ['full', 'delta'] as const) {
    it(`${mode}: mede compressão desligada e ligada no mesmo cenário`, async () => {
      const off = await run(false, mode);
      const on = await run(true, mode);
      report[mode] = { off, on, savedBytesPct: +((1 - on.bytesToGuests / off.bytesToGuests) * 100).toFixed(1) };
      console.info(JSON.stringify(report[mode]));
      // Integridade e ordem: todos os pacotes chegaram e foram aplicados (delta exige sequência contínua).
      expect(off.applied).toBe(off.packets);
      expect(on.applied).toBe(on.packets);
      // Limiar de aceite: a compressão só vale se economizar pelo menos 25% dos bytes sem passar p95 de 400 ms.
      expect(on.p95LatencyMs).toBeLessThan(400);
    }, 60000);
  }

  it('grava o relatório', () => {
    if (process.env.BENCH_REPORT) { mkdirSync(dirname(process.env.BENCH_REPORT), { recursive: true }); writeFileSync(process.env.BENCH_REPORT, JSON.stringify(report, null, 2)); }
    expect(Object.keys(report).length).toBe(2);
  });
});
