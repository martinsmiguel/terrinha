import { FACTION_COLORS } from './factions';
import type { GameState } from './model';

/**
 * Identidade dos jogadores (#198): nick de cada um e o nome que ele dá à civilização ao fundar a capital. Os nomes
 * são públicos (todos veem) e passam pela mesma limpeza no cliente e no host. Regra pura, sem DOM.
 */

export const MAX_NAME_LENGTH = 32;

export interface PlayerProfile {
  nick?: string;
  civName?: string;
}

/** Nome limpo (espaços colapsados) ou `null` quando vazio, longo demais ou com caracteres de controle/invisíveis. */
export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (/[\p{Cc}\p{Cf}]/u.test(raw)) return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length === 0 || [...name].length > MAX_NAME_LENGTH) return null;
  return name;
}

type WithProfiles = Pick<GameState, 'profiles'>;

const withProfile = <T extends WithProfiles>(state: T, slot: string, patch: PlayerProfile): T => ({
  ...state,
  profiles: { ...state.profiles, [slot]: { ...state.profiles?.[slot], ...patch } },
});

/** Grava o nick do jogador (recusa nome inválido devolvendo o mesmo estado). */
export function setNick<T extends WithProfiles>(state: T, slot: string, nick: unknown): T {
  const clean = sanitizeName(nick);
  if (!clean || state.profiles?.[slot]?.nick === clean) return state;
  return withProfile(state, slot, { nick: clean });
}

/** Grava o nome da civilização (recusa nome inválido devolvendo o mesmo estado). */
export function setCivName<T extends WithProfiles>(state: T, slot: string, civName: unknown): T {
  const clean = sanitizeName(civName);
  if (!clean) return state;
  return withProfile(state, slot, { civName: clean });
}

/** Nome da civilização para exibir: o batizado pelo jogador ou o da facção. */
export const civNameOf = (state: WithProfiles, slot: string): string =>
  state.profiles?.[slot]?.civName ?? FACTION_COLORS[slot]?.name ?? slot;

/** Nick para exibir, ou `null` quando ainda não há (ex.: IA). */
export const nickOf = (state: WithProfiles, slot: string): string | null => state.profiles?.[slot]?.nick ?? null;

/** Sugestão de nome ao fundar: "Reino de <nick>" (cabe no limite) ou o nome da facção. */
export function suggestCivName(slot: string, nick?: string | null): string {
  const clean = sanitizeName(nick);
  const suggestion = clean ? `Reino de ${clean}` : FACTION_COLORS[slot]?.name ?? 'Meu Reino';
  return [...suggestion].slice(0, MAX_NAME_LENGTH).join('').trim();
}
