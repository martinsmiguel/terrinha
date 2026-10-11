import { describe, expect, it } from 'vitest';
import type { Unit } from '../../src/game/model';
import { attackOrder } from '../../src/game/unitOrders';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';

const soldier = (extra: Partial<Unit> = {}): Unit => ({
  id: 's1', type: 'soldier', owner: 'player1', position: { x: 10, z: 10 }, targetPosition: null, targetEntityId: null,
  health: 150, maxHealth: 150, attackDamage: 16, state: 'idle', ...extra,
});
const enemy = (): Unit => ({
  id: 'e1', type: 'villager', owner: 'player2', position: { x: 12, z: 10 }, targetPosition: null, targetEntityId: null,
  health: 100, maxHealth: 100, attackDamage: 5, state: 'idle',
});
const ctx: SimulationContext = {
  playerSlot: 'player1', mode: 'host', pathCache: new Map(), gatherRadiusLimit: 14, sustainableForestryEnabled: false, buildingDefinitions: {},
  random: () => 0.5, createId: () => 'x', activeSlots: ['player1', 'player2'],
};

describe('ordem de ataque', () => {
  it('limpa o destino de marcha pendente e passa a atacar', () => {
    const marching = soldier({ state: 'moving', targetPosition: { x: 40, z: 40 } });
    const attacking = attackOrder(marching, 'e1');
    expect(attacking).toMatchObject({ state: 'attacking', targetEntityId: 'e1', targetPosition: null });
  });

  it('REGRESSÃO: um soldado em marcha que recebe a ordem de atacar ataca em vez de seguir ao ponto antigo', () => {
    const state = {
      units: [attackOrder(soldier({ state: 'moving', targetPosition: { x: 50, z: 50 } }), 'e1'), enemy()],
      buildings: [], resourceNodes: [], playerResources: { player1: { wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: 1, maxPop: 9 }, player2: { wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: 1, maxPop: 9 } },
    };
    let current = state;
    for (let i = 0; i < 60; i += 1) current = tickGameState(current, ctx).state as typeof state;
    const target = current.units.find((u) => u.id === 'e1');
    expect(target === undefined || target.health < 100).toBe(true); // o alvo foi atingido (ou morreu)
    const attacker = current.units.find((u) => u.id === 's1')!;
    expect(attacker.position.x).toBeLessThan(20); // não andou até (50, 50)
  });

  it('CONTROLE NEGATIVO: com o destino antigo preservado (comportamento anterior) o soldado vai ao ponto antigo e não ataca', () => {
    const old = { ...soldier({ state: 'moving', targetPosition: { x: 50, z: 50 } }), targetEntityId: 'e1', state: 'attacking' as const };
    const state = {
      units: [old, enemy()],
      buildings: [], resourceNodes: [], playerResources: { player1: { wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: 1, maxPop: 9 }, player2: { wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: 1, maxPop: 9 } },
    };
    let current = state;
    for (let i = 0; i < 60; i += 1) current = tickGameState(current, ctx).state as typeof state;
    expect(current.units.find((u) => u.id === 'e1')!.health).toBe(100);
    expect(current.units.find((u) => u.id === 's1')!.position.x).toBeGreaterThan(10.05); // seguiu rumo a (50, 50), sem atacar
  });
});
