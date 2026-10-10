import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it } from 'vitest';
import { Server as SocketServer } from 'socket.io';
import { io as connectSocket, type Socket } from 'socket.io-client';
import { GAME_STATE_COMPRESSION_OPTIONS, GAME_STATE_COMPRESSION_THRESHOLD_BYTES } from '../../src/game/networkSync';
import { registerGameSocketHandlers } from '../../src/game/socketServer';

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const onEvent = (payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    };
    socket.once(event, onEvent);
  });
}

async function connectPlayer(url: string, slot: number): Promise<Socket> {
  const socket = connectSocket(url, { autoConnect: false, reconnection: false, transports: ['websocket'] });
  const connected = waitForEvent<void>(socket, 'connect');
  socket.connect();
  await connected;

  const joined = waitForEvent<{ playerSlot: string; playerCount: number }>(socket, 'joined-success');
  socket.emit('join-room', {
    roomId: 'four-player-latency',
    playerName: `Player ${slot}`,
    playerSlot: `player${slot}`,
    isHost: slot === 1,
  });
  const result = await joined;
  expect(result.playerSlot).toBe(`player${slot}`);
  expect(result.playerCount).toBe(slot);
  return socket;
}

function createSnapshot(tick: number) {
  return {
    tick,
    units: Array.from({ length: 160 }, (_, index) => ({
      id: `unit-${index}`,
      type: index % 2 === 0 ? 'villager' : 'soldier',
      owner: `player${(index % 4) + 1}`,
      position: { x: (index * 17 + tick) % 60, z: (index * 29 + tick) % 60 },
      targetPosition: { x: (index * 31) % 60, z: (index * 11) % 60 },
      targetEntityId: null,
      health: 100,
      maxHealth: 100,
      state: 'moving',
    })),
  };
}

describe('four-player Socket.IO state relay', () => {
  let server: SocketServer | undefined;
  let clients: Socket[] = [];

  afterEach(async () => {
    clients.forEach((client) => client.disconnect());
    clients = [];
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = undefined;
    }
  });

  it('delivers every compressed 20 Hz per-guest snapshot to all three clients', async () => {
    const httpServer = createServer();
    server = new SocketServer(httpServer, {
      ...GAME_STATE_COMPRESSION_OPTIONS,
      transports: ['websocket'],
    });
    registerGameSocketHandlers(server);

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}`;

    for (let slot = 1; slot <= 4; slot++) clients.push(await connectPlayer(url, slot));

    const latenciesMs: number[] = [];
    const frameCount = 10;
    for (let tick = 0; tick < frameCount; tick++) {
      const snapshot = createSnapshot(tick);
      expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeGreaterThan(GAME_STATE_COMPRESSION_THRESHOLD_BYTES);
      const deliveries = clients.slice(1).map((client) => waitForEvent<typeof snapshot>(client, 'game-state-update'));
      const startedAt = performance.now();
      // O host envia um snapshot por convidado (slots 2 a 4), já filtrado por ele; o servidor só entrega ao destinatário.
      [2, 3, 4].forEach((slot) => clients[0].emit('sync-game-state-to', { slot: `player${slot}`, state: snapshot }));
      const received = await Promise.all(deliveries);
      latenciesMs.push(performance.now() - startedAt);
      received.forEach((state) => expect(state).toEqual(snapshot));

      if (tick < frameCount - 1) await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const sortedLatencies = [...latenciesMs].sort((left, right) => left - right);
    const p95LatencyMs = sortedLatencies[Math.ceil(sortedLatencies.length * 0.95) - 1];
    expect(latenciesMs).toHaveLength(frameCount);
    expect(p95LatencyMs).toBeLessThan(400);
  }, 10000);
});
