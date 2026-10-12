import { describe, expect, it } from 'vitest';
import { MAX_NAME_LENGTH, civNameOf, nickOf, sanitizeName, setCivName, setNick, suggestCivName } from '../../src/game/identity';
import type { GameState } from '../../src/game/model';
import { isValidNetworkCommand } from '../../src/game/networkCommands';
import { applyDelta, diffStates } from '../../src/game/snapshotDelta';

const empty = (): GameState => ({ units: [], buildings: [], resourceNodes: [], playerResources: {} });

describe('identidade dos jogadores (#198)', () => {
  it('limpa o nome: colapsa espaços e aceita acentos e emoji dentro do limite', () => {
    expect(sanitizeName('  Reino   da  Ilha  ')).toBe('Reino da Ilha');
    expect(sanitizeName('Império Lusitano 🏰')).toBe('Império Lusitano 🏰');
    expect(sanitizeName('a'.repeat(MAX_NAME_LENGTH))).toHaveLength(MAX_NAME_LENGTH);
  });

  it('CONTROLE NEGATIVO: vazio, longo demais, controle/invisível e não-texto são recusados', () => {
    for (const bad of ['', '   ', 'a'.repeat(MAX_NAME_LENGTH + 1), 'Rei\u0000no', 'Rei​no', 'Rei\nno\u0007', 42, null, undefined]) {
      expect(sanitizeName(bad), String(bad)).toBeNull();
    }
  });

  it('grava nick e nome da civilização por jogador; inválido não altera nada', () => {
    let state = setNick(empty(), 'player1', ' Miguel ');
    state = setCivName(state, 'player1', 'Reino do Sol');
    expect(state.profiles).toEqual({ player1: { nick: 'Miguel', civName: 'Reino do Sol' } });
    expect(setCivName(state, 'player1', '')).toBe(state);
    expect(setNick(state, 'player1', 'Miguel')).toBe(state); // igual: mesmo estado (sem re-render)
    expect(civNameOf(state, 'player1')).toBe('Reino do Sol');
    expect(civNameOf(state, 'player2')).toBe('Império Espanhol (Vermelho)'); // sem nome: o da facção
    expect(nickOf(state, 'player2')).toBeNull();
  });

  it('sugere "Reino de <nick>" dentro do limite', () => {
    expect(suggestCivName('player1', 'Miguel')).toBe('Reino de Miguel');
    expect([...suggestCivName('player1', 'x'.repeat(MAX_NAME_LENGTH))].length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    expect(suggestCivName('player2', null)).toBe('Império Espanhol (Vermelho)');
  });

  it('fundar com nome: o formato do comando aceita só nome válido', () => {
    const cmd = { type: 'found_capital', wagonId: 'w1', position: { x: 10, z: 10 } };
    expect(isValidNetworkCommand(cmd)).toBe(true);
    expect(isValidNetworkCommand({ ...cmd, civName: 'Reino do Sol' })).toBe(true);
    expect(isValidNetworkCommand({ ...cmd, civName: '' })).toBe(false);
    expect(isValidNetworkCommand({ ...cmd, civName: 'x'.repeat(MAX_NAME_LENGTH + 1) })).toBe(false);
    expect(isValidNetworkCommand({ ...cmd, civName: 7 })).toBe(false);
  });

  it('os nomes viajam na diferença entre snapshots (todos veem)', () => {
    const named = setCivName(setNick(empty(), 'player2', 'Ana'), 'player2', 'Ilha da Ana');
    expect(applyDelta(empty(), diffStates(empty(), named)).profiles).toEqual(named.profiles);
  });
});
