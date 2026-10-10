import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { Server as SocketServer } from 'socket.io';
import { io as connectSocket, type Socket } from 'socket.io-client';
import { registerGameSocketHandlers } from '../../src/game/socketServer';

const waitFor = <T>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => { clearTimeout(timer); resolve(payload); });
  });

async function join(url: string, slot: number): Promise<Socket> {
  const socket = connectSocket(url, { autoConnect: false, reconnection: false, transports: ['websocket'] });
  const connected = waitFor<void>(socket, 'connect');
  socket.connect();
  await connected;
  const joined = waitFor<unknown>(socket, 'joined-success');
  socket.emit('join-room', { roomId: 'leave-room', playerName: `P${slot}`, playerSlot: `player${slot}`, isHost: slot === 1 });
  await joined;
  return socket;
}

describe('aviso de saída de jogador', () => {
  let server: SocketServer | undefined;
  let sockets: Socket[] = [];

  afterEach(async () => {
    sockets.forEach((socket) => socket.disconnect());
    sockets = [];
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  });

  async function room() {
    const http = createServer();
    server = new SocketServer(http);
    registerGameSocketHandlers(server);
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    const host = await join(url, 1);
    const guest = await join(url, 2);
    sockets = [host, guest];
    return { host, guest };
  }

  it('quando o host sai, o convidado recebe o aviso marcado como host', async () => {
    const { host, guest } = await room();
    const left = waitFor<{ isHost: boolean; playerSlot: string }>(guest, 'player-left');
    host.disconnect();
    expect(await left).toMatchObject({ isHost: true, playerSlot: 'player1' });
  });

  it('quando o convidado sai, o host recebe o aviso sem a marca de host', async () => {
    const { host, guest } = await room();
    const left = waitFor<{ isHost: boolean; playerSlot: string }>(host, 'player-left');
    guest.disconnect();
    expect(await left).toMatchObject({ isHost: false, playerSlot: 'player2' });
  });
});
