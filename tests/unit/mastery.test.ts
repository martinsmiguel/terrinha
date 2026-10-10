import { describe, expect, it } from 'vitest';
import { MASTERY_MAX_LEVEL, creditAll, creditXp, exploredSectorKeys, newMastery, xpToNext } from '../../src/game/mastery';
import type { GameState, Unit } from '../../src/game/model';
import { filterSnapshotFor } from '../../src/game/snapshotFilter';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';

describe('níveis e pontos', () => {
  it('começa no nível 1 com custo ceil(100 × nível^1.95) e dá um ponto por nível', () => {
    expect(xpToNext(1)).toBe(100);
    expect(xpToNext(2)).toBe(Math.ceil(100 * 2 ** 1.95));
    let m = newMastery();
    expect(m.level.extraction).toBe(1);
    m = creditXp(m, { kind: 'extraction', amount: 1000 }); // 100 XP
    expect(m.level.extraction).toBe(2);
    expect(m.points).toBe(1);
  });

  it('acumula frações e respeita o teto 10', () => {
    let m = newMastery();
    for (let i = 0; i < 10; i += 1) m = creditXp(m, { kind: 'fishing', amount: 0.5 });
    expect(m.xp.seafaring).toBeCloseTo(1, 5);
    for (let i = 0; i < 400; i += 1) m = creditXp(m, { kind: 'freight', amount: 100000 });
    expect(m.level.seafaring).toBe(MASTERY_MAX_LEVEL);
    expect(m.points).toBe(MASTERY_MAX_LEVEL - 1);
  });
});

describe('eventos únicos não repetem crédito', () => {
  it('descoberta, fundação, planta e monumento pagam uma vez por chave', () => {
    let m = newMastery();
    m = creditXp(m, { kind: 'discovery', key: '1,1' });
    const again = creditXp(m, { kind: 'discovery', key: '1,1' });
    expect(again).toBe(m);
    expect(creditXp(m, { kind: 'discovery', key: '1,2' }).xp.exploration).toBe(20);
    const f = creditXp(m, { kind: 'foundation', key: 'b1' });
    expect(creditXp(f, { kind: 'foundation', key: 'b1' })).toBe(f);
    expect(creditXp(creditXp(m, { kind: 'plant', key: 'p' }), { kind: 'monument', key: 'p' }).xp.exploration).toBe(10 + 25 + 40);
  });

  it('o mesmo lote de eventos reaplicado (reconstrução) não paga de novo o que é único', () => {
    const events = [{ owner: 'player1', event: { kind: 'discovery' as const, key: '0,0' } }, { owner: 'player1', event: { kind: 'foundation' as const, key: 'b' } }];
    const once = creditAll(undefined, events)!;
    const twice = creditAll(once, events)!;
    expect(twice.player1.xp).toEqual(once.player1.xp);
  });

  it('setores explorados são enumerados pela célula central', () => {
    expect(exploredSectorKeys((x, z) => x < 16 && z < 16, 48)).toEqual(['0,0']);
  });
});

describe('eventos autoritativos na simulação', () => {
  const ctx = (): SimulationContext => ({
    playerSlot: 'player1', mode: 'host', activeSlots: ['player1', 'player2'], gatherRadiusLimit: 14, sustainableForestryEnabled: false,
    buildingDefinitions: {}, random: () => 0.9, createId: () => 'id',
  });
  const unit = (overrides: Partial<Unit>): Unit => ({
    id: 'v', type: 'villager', owner: 'player1', position: { x: 10, z: 10 }, targetPosition: null, targetEntityId: null,
    health: 100, maxHealth: 100, attackDamage: 8, state: 'idle', ...overrides,
  });
  const res = { wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: 2, maxPop: 10 };
  const world = (units: Unit[], nodeType: 'tree' | 'fish_school' = 'tree'): GameState => ({
    units, buildings: [{ id: 'tc', type: 'town_center', owner: 'player1', position: { x: 5, z: 5 }, health: 2400, maxHealth: 2400, isComplete: true, trainingQueue: [] }, { id: 'tc2', type: 'town_center', owner: 'player2', position: { x: 50, z: 50 }, health: 2400, maxHealth: 2400, isComplete: true, trainingQueue: [] }],
    resourceNodes: [{ id: 'n', type: nodeType, position: { x: 10.5, z: 10 }, remaining: 100 }], playerResources: { player1: res, player2: res },
  });

  it('extração e pesca dão XP em maestrias diferentes, só do dono', () => {
    const wood = tickGameState(world([unit({ state: 'gathering', targetEntityId: 'n' })]), ctx()).state;
    expect(wood.mastery!.player1.xp.extraction).toBeGreaterThan(0);
    expect(wood.mastery!.player1.xp.seafaring).toBe(0);
    expect(wood.mastery!.player2).toBeUndefined();
    const fish = tickGameState(world([unit({ type: 'fishing_boat', state: 'gathering', targetEntityId: 'n' })], 'fish_school'), ctx()).state;
    expect(fish.mastery!.player1.xp.seafaring).toBeGreaterThan(0);
    expect(fish.mastery!.player1.xp.extraction).toBe(0);
  });

  it('dano efetivo paga combate pelo que foi realmente tirado', () => {
    const state = world([unit({ type: 'soldier', state: 'attacking', targetEntityId: 'foe', attackDamage: 24, position: { x: 20, z: 20 } }), unit({ id: 'foe', owner: 'player2', position: { x: 21, z: 20 }, health: 5 })]);
    const result = tickGameState(state, ctx()).state;
    expect(result.mastery?.player1.xp.combat ?? 0).toBeLessThanOrEqual(5 * 0.05 + 1e-9);
  });

  it('sem eventos o estado não ganha XP nem registro de maestria', () => {
    expect(tickGameState(world([]), ctx()).state.mastery).toBeUndefined();
  });

  it('o snapshot leva só a maestria do destinatário, sem o registro de eventos', () => {
    const m = creditXp(newMastery(), { kind: 'discovery', key: '1,1' });
    const state: GameState = { ...world([]), mastery: { player1: m, player2: m } };
    const view = filterSnapshotFor(state, 'player1', undefined);
    expect(Object.keys(view.mastery!)).toEqual(['player1']);
    expect(view.mastery!.player1.credited).toEqual({});
    expect(view.mastery!.player1.xp.exploration).toBe(10);
  });
});
