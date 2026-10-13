import { describe, expect, it } from 'vitest';
import { currentGoal } from '../../src/game/goals';
import type { Building, GameState, Unit } from '../../src/game/model';
import { createTechState } from '../../src/game/tech';

const b = (type: Building['type'], owner = 'player1', isComplete = true): Building => ({ id: `${type}-${owner}-${Math.random()}`, type, owner, position: { x: 1, z: 1 }, health: 100, maxHealth: 100, isComplete, trainingQueue: [] });
const v = (n: number, owner = 'player1'): Unit[] => Array.from({ length: n }, (_, i) => ({ id: `v${i}`, type: 'villager', owner, position: { x: 1, z: 1 }, targetPosition: null, targetEntityId: null, health: 100, maxHealth: 100, attackDamage: 3, state: 'idle' }));
const state = (buildings: Building[], units: Unit[] = [], era = 'pedra'): Pick<GameState, 'units' | 'buildings' | 'techs'> =>
  ({ buildings, units, techs: { player1: { ...createTechState(), era: era as never } } });

describe('meta atual (#181)', () => {
  it('segue a ordem natural: capital, casa, aldeões…', () => {
    expect(currentGoal(state([]), 'player1')).toMatchObject({ id: 'capital', progress: 0, target: 1 });
    expect(currentGoal(state([b('town_center')]), 'player1')).toMatchObject({ id: 'casa' });
    expect(currentGoal(state([b('town_center'), b('house')], v(4)), 'player1')).toMatchObject({ id: 'aldeoes', progress: 4, target: 6 });
  });

  it('obra em andamento e prédios de outros não contam', () => {
    expect(currentGoal(state([b('town_center'), b('house', 'player1', false)]), 'player1').id).toBe('casa');
    expect(currentGoal(state([b('town_center'), b('house', 'player2')]), 'player1').id).toBe('casa');
  });

  it('com tudo feito, a meta vira expandir e enfeitar', () => {
    const all = ['town_center', 'farm', 'barracks', 'sawmill', 'dock', 'outpost', 'house', 'house', 'house', 'house', 'house'] as const;
    expect(currentGoal(state(all.map((type) => b(type)), v(6), 'bronze'), 'player1').id).toBe('livre');
  });
});
