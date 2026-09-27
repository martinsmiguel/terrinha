import { io, Socket } from 'socket.io-client';
import { isValidNetworkCommand, type NetworkCommand, type PlayerSlot } from './networkCommands';

export interface ChatMessage {
  sender: string;
  message: string;
  timestamp: number;
}

export class MultiplayerManager {
  socket: Socket;
  roomId: string;
  isHost: boolean;
  playerName: string;
  playerSlot: PlayerSlot;
  connected: boolean = false;
  onStateUpdate?: (state: any) => void;
  onCommand?: (cmd: NetworkCommand) => void;
  onPlayerJoined?: (data: { id: string; playerName: string; playerCount: number }) => void;
  onPlayerLeft?: (data: { id: string; playerName: string; playerCount: number }) => void;
  onChatMessage?: (chat: ChatMessage) => void;
  onConnectionStatus?: (connected: boolean) => void;
  onJoinError?: (message: string) => void;

  constructor(roomId: string, isHost: boolean, playerName: string, playerSlot: PlayerSlot) {
    this.roomId = roomId;
    this.isHost = isHost;
    this.playerName = playerName;
    this.playerSlot = playerSlot;

    // Connects to origin host directly (works offline on LAN via IP or localhost)
    this.socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      timeout: 5000,
    });

    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on('connect', () => {
      this.connected = true;
      this.onConnectionStatus?.(true);

      this.socket.emit('join-room', {
        roomId: this.roomId,
        playerName: this.playerName,
        playerSlot: this.playerSlot,
        isHost: this.isHost,
      });
    });

    this.socket.on('join-error', (message: unknown) => {
      this.onJoinError?.(typeof message === 'string' ? message : 'Não foi possível entrar na sala.');
      this.socket.disconnect();
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      this.onConnectionStatus?.(false);
    });

    this.socket.on('player-joined', (data) => {
      this.onPlayerJoined?.(data);
    });

    this.socket.on('player-left', (data) => {
      this.onPlayerLeft?.(data);
    });

    // Client receives state from Host
    this.socket.on('game-state-update', (state) => {
      if (!this.isHost) {
        this.onStateUpdate?.(state);
      }
    });

    // Host receives commands from Clients
    this.socket.on('client-command', (command: unknown) => {
      if (this.isHost && isValidNetworkCommand(command)) {
        this.onCommand?.(command);
      }
    });

    // Chat
    this.socket.on('chat-message-broadcast', (chat: ChatMessage) => {
      this.onChatMessage?.(chat);
    });
  }

  // Host sends state to all clients
  broadcast(gameState: any) {
    if (this.isHost && this.socket.connected) {
      this.socket.compress(true).emit('sync-game-state', gameState);
    }
  }

  // Client sends action to host
  sendToHost(command: any) {
    if (this.socket.connected) {
      this.socket.emit('send-command', command);
    }
  }

  // Send chat
  sendChat(message: string) {
    if (this.socket.connected) {
      this.socket.emit('chat-message', {
        sender: this.playerName,
        message,
      });
    }
  }

  disconnect() {
    this.socket.disconnect();
  }
}
