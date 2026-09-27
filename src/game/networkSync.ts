/** Compression settings for full game-state snapshots sent through Socket.IO. */
export const GAME_STATE_COMPRESSION_OPTIONS = {
  httpCompression: { threshold: 1024 },
  perMessageDeflate: { threshold: 1024 },
} as const;

export const GAME_STATE_COMPRESSION_THRESHOLD_BYTES = 1024;
