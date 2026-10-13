import { BOT_PROFILE_LABEL, DEFAULT_BOT_PROFILE, type BotProfile } from './bots';
import { sanitizeName } from './identity';
import { DEFAULT_WORLD_SIZE, WORLD_SIZE_OPTIONS } from './worldConfig';

/**
 * Preferências do jogador (#199), lembradas no navegador entre sessões. Tudo validado ao ler: valor desconhecido
 * volta ao padrão, então um armazenamento antigo ou corrompido nunca quebra o jogo. Regra pura.
 */

export interface Preferences {
  playerName: string;
  botProfile: BotProfile;
  worldSize: number;
  matchSize: 2 | 3 | 4;
  cameraLocked: boolean;
  muted: boolean;
}

export const PREFERENCES_KEY = 'terrinha.preferencias';

export const DEFAULT_PREFERENCES: Preferences = {
  playerName: 'Comandante',
  botProfile: DEFAULT_BOT_PROFILE,
  worldSize: DEFAULT_WORLD_SIZE,
  matchSize: 2,
  cameraLocked: true,
  muted: false,
};

/** Lê preferências de qualquer valor (JSON já interpretado), aproveitando só o que for válido. */
export function parsePreferences(raw: unknown): Preferences {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const bot = typeof value.botProfile === 'string' && value.botProfile in BOT_PROFILE_LABEL ? (value.botProfile as BotProfile) : DEFAULT_PREFERENCES.botProfile;
  const size = typeof value.worldSize === 'number' && WORLD_SIZE_OPTIONS.some((option) => option.size === value.worldSize) ? value.worldSize : DEFAULT_PREFERENCES.worldSize;
  const match = value.matchSize === 2 || value.matchSize === 3 || value.matchSize === 4 ? value.matchSize : DEFAULT_PREFERENCES.matchSize;
  return {
    playerName: sanitizeName(value.playerName) ?? DEFAULT_PREFERENCES.playerName,
    botProfile: bot,
    worldSize: size,
    matchSize: match,
    cameraLocked: typeof value.cameraLocked === 'boolean' ? value.cameraLocked : DEFAULT_PREFERENCES.cameraLocked,
    muted: typeof value.muted === 'boolean' ? value.muted : DEFAULT_PREFERENCES.muted,
  };
}

/** Lê do armazenamento do navegador; sem acesso (modo privado, bloqueio), devolve o padrão. */
export function loadPreferences(storage: Pick<Storage, 'getItem'> | undefined): Preferences {
  try {
    const text = storage?.getItem(PREFERENCES_KEY);
    return parsePreferences(text ? JSON.parse(text) : null);
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(storage: Pick<Storage, 'setItem'> | undefined, preferences: Preferences): void {
  try {
    storage?.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Sem armazenamento: as preferências valem só nesta sessão.
  }
}
