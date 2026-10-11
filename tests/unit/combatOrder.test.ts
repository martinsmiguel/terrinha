import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '../../src/game/model';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';

const resources = { wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: 2, maxPop: 99 };
const soldier = (id: string, owner: string, x: number, z: number, target: string): Unit => ({
  id, type: 'soldier', owner, position: { x, z }, targetPosition: null, targetEntityId: target, health: 150, maxHealth: 150, attackDamage: 24, state: 'attacking',
});
const ctx: SimulationContext = {
  playerSlot: 'player1', mode: 'host', pathCache: new Map(), gatherRadiusLimit: 14, sustainableForestryEnabled: false, buildingDefinitions: {},
  random: () => 0.5, createId: () => 'x', activeSlots: ['player1', 'player2'],
};
const run = (units: Unit[], ticks: number): GameState => {
  let state: GameState = { units, buildings: [], resourceNodes: [], playerResources: { player1: { ...resources }, player2: { ...resources } } };
  for (let i = 0; i < ticks; i += 1) state = tickGameState(state, ctx).state;
  return state;
};
const healthOf = (state: GameState, id: string) => state.units.find((u) => u.id === id)?.health ?? 0;

describe('combate: o dano não depende da ordem das unidades na lista', () => {
  it('REGRESSÃO: um soldado que também está atacando perde vida mesmo quando vem ANTES do atacante na lista', () => {
    // O inimigo (índice 0) ataca o nosso; o nosso (índice 1) ataca o inimigo. Antes, o dano ao índice 0 se perdia.
    const state = run([soldier('inimigo', 'player2', 12, 10, 'nosso'), soldier('nosso', 'player1', 10, 10, 'inimigo')], 40);
    expect(healthOf(state, 'inimigo'), 'o inimigo que vem antes na lista também leva dano').toBeLessThan(150);
    expect(healthOf(state, 'nosso'), 'e o nosso também').toBeLessThan(150);
  });

  it('o resultado é simétrico: trocar a ordem na lista não muda quem leva dano', () => {
    const a = run([soldier('inimigo', 'player2', 12, 10, 'nosso'), soldier('nosso', 'player1', 10, 10, 'inimigo')], 40);
    const b = run([soldier('nosso', 'player1', 10, 10, 'inimigo'), soldier('inimigo', 'player2', 12, 10, 'nosso')], 40);
    expect(healthOf(a, 'inimigo')).toBe(healthOf(b, 'inimigo'));
    expect(healthOf(a, 'nosso')).toBe(healthOf(b, 'nosso'));
  });

  it('dez soldados contra um derrubam o alvo mesmo que ele esteja atacando e venha primeiro na lista', () => {
    const ours = Array.from({ length: 10 }, (_, i) => soldier(`n${i}`, 'player1', 10, 10 + (i % 5) * 0.3, 'inimigo'));
    const state = run([soldier('inimigo', 'player2', 12, 10, 'n0'), ...ours], 120);
    expect(state.units.find((u) => u.id === 'inimigo'), 'o inimigo morre').toBeUndefined();
    expect(state.units.filter((u) => u.owner === 'player1').length).toBeGreaterThanOrEqual(8);
  });

  it('o dano de vários atacantes no mesmo passo se soma e mata sem passar de zero', () => {
    const ours = Array.from({ length: 4 }, (_, i) => ({ ...soldier(`n${i}`, 'player1', 10, 10 + i * 0.3, 'alvo'), attackDamage: 24 }));
    const target: Unit = { ...soldier('alvo', 'player2', 12, 10, 'n0'), health: 30 };
    const state = run([target, ...ours], 2);
    expect(state.units.find((u) => u.id === 'alvo')).toBeUndefined();
  });
});
