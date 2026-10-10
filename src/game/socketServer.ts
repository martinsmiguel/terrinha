import type { Server } from 'socket.io';

const PLAYER_SLOTS = ['player1', 'player2', 'player3', 'player4'] as const;
type PlayerSlot = (typeof PLAYER_SLOTS)[number];

interface JoinRoomRequest {
  roomId: string;
  playerName: string;
  playerSlot: PlayerSlot;
  isHost: boolean;
}

function isJoinRequest(value: unknown): value is JoinRoomRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return (
    Object.keys(request).every((key) => ['roomId', 'playerName', 'playerSlot', 'isHost'].includes(key)) &&
    typeof request.roomId === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(request.roomId) &&
    typeof request.playerName === 'string' && request.playerName.trim().length > 0 && request.playerName.length <= 32 &&
    typeof request.playerSlot === 'string' && PLAYER_SLOTS.includes(request.playerSlot as PlayerSlot) &&
    typeof request.isHost === 'boolean'
  );
}

function roomJoinError(request: JoinRoomRequest, members: Array<{ playerSlot?: string; isHost?: boolean }>): string | null {
  if (members.length >= PLAYER_SLOTS.length) return 'A sala já atingiu o limite de quatro jogadores.';
  const hasHost = members.some((member) => member.isHost === true);
  if ((request.isHost && hasHost) || (!request.isHost && !hasHost)) {
    return request.isHost ? 'Esta sala já tem um anfitrião.' : 'Não há uma partida aberta com esse código.';
  }
  if (members.some((member) => member.playerSlot === request.playerSlot)) {
    return 'Esta civilização já foi escolhida por outro jogador.';
  }
  return null;
}

function isCommandEnvelope(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as Record<string, unknown>).type === 'string';
}

/** Registers the room relay used by the host and LAN clients. */
export function registerGameSocketHandlers(io: Server): void {
  io.on('connection', (socket) => {
    socket.on('join-room', (request: unknown) => {
      if (!isJoinRequest(request)) {
        socket.emit('join-error', 'Dados de entrada inválidos. Confira o código da sala, nome e civilização.');
        return;
      }

      const { roomId, isHost, playerSlot } = request;
      const playerName = request.playerName.trim();
      const members = [...io.sockets.sockets.values()].filter((member) => member.data.roomId === roomId);
      const admissionError = roomJoinError(request, members.map((member) => ({
        playerSlot: member.data.playerSlot,
        isHost: member.data.isHost,
      })));
      if (admissionError) {
        socket.emit('join-error', admissionError);
        return;
      }

      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.playerName = playerName;
      socket.data.isHost = isHost;
      socket.data.playerSlot = playerSlot;

      const room = io.sockets.adapter.rooms.get(roomId);
      const playerCount = room ? room.size : 1;
      socket.to(roomId).emit('player-joined', { id: socket.id, playerName, isHost, playerSlot, playerCount });
      socket.emit('joined-success', { id: socket.id, playerSlot, playerCount });
    });

    // O host envia um snapshot por convidado, já filtrado pela visão dele; o servidor só entrega ao destinatário.
    socket.on('sync-game-state-to', (payload: unknown) => {
      const roomId = socket.data.roomId;
      if (!roomId || !socket.data.isHost || typeof payload !== 'object' || payload === null) return;
      const { slot, state } = payload as { slot?: unknown; state?: unknown };
      if (typeof slot !== 'string') return;
      const target = [...io.sockets.sockets.values()].find((member) => member.data.roomId === roomId && !member.data.isHost && member.data.playerSlot === slot);
      target?.compress(true).emit('game-state-update', state);
    });

    socket.on('request-resync', () => {
      const roomId = socket.data.roomId;
      if (!roomId || socket.data.isHost) return;
      const host = [...io.sockets.sockets.values()].find((member) => member.data.roomId === roomId && member.data.isHost);
      host?.emit('client-resync', { playerSlot: socket.data.playerSlot });
    });

    socket.on('send-command', (command: unknown) => {
      const roomId = socket.data.roomId;
      if (roomId && !socket.data.isHost && isCommandEnvelope(command)) {
        const host = [...io.sockets.sockets.values()].find(
          (member) => member.data.roomId === roomId && member.data.isHost
        );
        host?.emit('client-command', {
          ...command,
          playerSlot: socket.data.playerSlot,
          senderId: socket.id,
        });
      }
    });

    socket.on('chat-message', (data: unknown) => {
      const roomId = socket.data.roomId;
      if (roomId && typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string') {
        const message = data.message.trim();
        if (message.length === 0 || message.length > 500) return;
        io.to(roomId).emit('chat-message-broadcast', {
          sender: socket.data.playerName,
          message,
          timestamp: Date.now(),
        });
      }
    });

    socket.on('disconnect', () => {
      const roomId = socket.data.roomId;
      if (roomId) {
        const room = io.sockets.adapter.rooms.get(roomId);
        const playerCount = room ? room.size : 0;
        socket.to(roomId).emit('player-left', {
          id: socket.id,
          playerName: socket.data.playerName,
          playerSlot: socket.data.playerSlot,
          isHost: socket.data.isHost === true,
          playerCount,
        });
      }
    });
  });
}
