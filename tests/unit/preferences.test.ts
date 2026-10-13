import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, PREFERENCES_KEY, loadPreferences, parsePreferences, savePreferences } from '../../src/game/preferences';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, data };
};

describe('preferências do jogador (#199)', () => {
  it('guarda e devolve as preferências válidas', () => {
    const store = memory();
    const prefs = { playerName: 'Miguel', botProfile: 'raids' as const, worldSize: 384, matchSize: 3 as const, cameraLocked: false, muted: true };
    savePreferences(store, prefs);
    expect(JSON.parse(store.data.get(PREFERENCES_KEY)!)).toEqual(prefs);
    expect(loadPreferences(store)).toEqual(prefs);
  });

  it('padrão: câmera fixa, som ligado, mundo e IA padrão', () => {
    expect(loadPreferences(memory())).toEqual(DEFAULT_PREFERENCES);
    expect(DEFAULT_PREFERENCES.cameraLocked).toBe(true);
  });

  it('CONTROLE NEGATIVO: valores inválidos ou armazenamento quebrado voltam ao padrão, campo a campo', () => {
    expect(parsePreferences({ playerName: '', botProfile: 'hacker', worldSize: 999, matchSize: 9, cameraLocked: 'sim', muted: 1 })).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences({ playerName: 'Ana', worldSize: 60 })).toMatchObject({ playerName: 'Ana', worldSize: 60, botProfile: DEFAULT_PREFERENCES.botProfile });
    expect(loadPreferences({ getItem: () => '{json quebrado' })).toEqual(DEFAULT_PREFERENCES);
    expect(loadPreferences({ getItem: () => { throw new Error('modo privado'); } })).toEqual(DEFAULT_PREFERENCES);
    expect(() => savePreferences({ setItem: () => { throw new Error('cheio'); } }, DEFAULT_PREFERENCES)).not.toThrow();
  });
});
