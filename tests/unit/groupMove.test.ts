import { describe, expect, it } from 'vitest';
import { bodyOf } from '../../src/game/bodyModel';
import { formationSlots, marchVectors, nearestStandable, planGroupMove, type Formation, type GroupUnit, type Point } from '../../src/game/groupMove';
import type { GameState, Unit, UnitType } from '../../src/game/model';
import { isAuthorizedPlayerCommand } from '../../src/game/networkCommands';
import { generateProceduralTerrain } from '../../src/game/proceduralMap';

const SIZE = 60;
const map = generateProceduralTerrain(SIZE, 4242);
const canStand = map.canStandAt;
const terrain = { canStandAt: map.canStandAt };

const unitAt = (id: string, type: UnitType, position: Point): Unit => ({
  id, type, owner: 'player1', position, targetPosition: null, targetEntityId: null, health: 100, maxHealth: 100, attackDamage: 5, state: 'idle',
});
const stateOf = (units: Unit[]): GameState => ({ units, buildings: [], resourceNodes: [], playerResources: { player1: { wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: 0, maxPop: 99 } } });
const groupOf = (units: Unit[]): GroupUnit[] => units.map((u) => ({ id: u.id, position: u.position, body: bodyOf(u.type) }));

/** Grupo de soldados na ilha natal do jogador 1. */
const squad = (count: number): Unit[] => Array.from({ length: count }, (_, i) =>
  unitAt(`s${i}`, 'soldier', { x: map.player1Spawn.x + (i % 4) * 0.8, z: map.player1Spawn.z + Math.floor(i / 4) * 0.8 }));

/** Quantas ordens o host aceitaria (o host recusa em silêncio o resto). */
const accepted = (units: Unit[], orders: { unitId: string; target: Point }[]) => {
  const state = stateOf(units);
  return orders.filter((o) => isAuthorizedPlayerCommand(state, { type: 'move', unitId: o.unitId, target: o.target }, 'player1', undefined, terrain)).length;
};

/** Pontos de terra firme cujo entorno de formação invade água funda ou rochedo (a costa da ilha natal). */
function coastalClicks(count: number, formation: Formation): Point[] {
  const found: Point[] = [];
  for (let x = 2; x < SIZE - 2; x += 0.5) {
    for (let z = 2; z < SIZE - 2; z += 0.5) {
      if (!canStand('human', x, z)) continue;
      const units = squad(count);
      const slots = formationSlots(count, { x, z }, marchVectors(groupOf(units), { x, z }), formation, SIZE);
      if (slots.some((s) => !canStand('human', s.x, s.z))) found.push({ x, z });
    }
  }
  return found;
}

describe('REPRODUÇÃO: a formação original perde unidades perto da costa', () => {
  it('há muitos pontos clicáveis em que o host recusa parte das ordens do grupo (o grupo se parte)', () => {
    const units = squad(12);
    const clicks = coastalClicks(12, 'box');
    expect(clicks.length).toBeGreaterThan(50);
    let rejectedSomewhere = 0;
    for (const click of clicks.slice(0, 200)) {
      const slots = formationSlots(12, click, marchVectors(groupOf(units), click), 'box', SIZE);
      const orders = units.map((u, i) => ({ unitId: u.id, target: slots[i] }));
      if (accepted(units, orders) < units.length) rejectedSomewhere += 1;
    }
    expect(rejectedSomewhere).toBeGreaterThan(0); // o defeito: clicar em terra válida deixa unidades paradas
  });
});

describe('planGroupMove: todo destino enviado ao host é aceito', () => {
  for (const formation of ['box', 'line', 'spread'] as Formation[]) {
    it(`${formation}: em todo clique costeiro as ${12} ordens são aceitas pelo host e o centro escolhido é respeitado`, () => {
      const units = squad(12);
      const clicks = coastalClicks(12, formation);
      expect(clicks.length).toBeGreaterThan(0);
      for (const click of clicks.slice(0, 150)) {
        const plan = planGroupMove(groupOf(units), click, formation, SIZE, canStand);
        expect(plan.centerMoved, `clique ${click.x},${click.z}`).toBe(false);
        expect(plan.center).toEqual(click);
        expect(plan.unplaced, `clique ${click.x},${click.z}`).toEqual([]);
        expect(accepted(units, plan.orders), `clique ${click.x},${click.z}`).toBe(units.length);
      }
    });
  }

  it('em terra aberta não ajusta nada: a formação é a original', () => {
    const units = squad(9);
    const open = { x: map.player1Spawn.x, z: map.player1Spawn.z };
    const plan = planGroupMove(groupOf(units), open, 'box', SIZE, canStand);
    expect(plan.adjusted).toBe(0);
    const slots = formationSlots(9, open, marchVectors(groupOf(units), open), 'box', SIZE);
    expect(plan.orders.map((o) => o.target)).toEqual(slots);
  });

  it('destinos dos soldados nunca coincidem', () => {
    const units = squad(16);
    for (const click of coastalClicks(16, 'box').slice(0, 60)) {
      const plan = planGroupMove(groupOf(units), click, 'box', SIZE, canStand);
      for (let i = 0; i < plan.orders.length; i += 1) {
        for (let j = i + 1; j < plan.orders.length; j += 1) {
          expect(Math.hypot(plan.orders[i].target.x - plan.orders[j].target.x, plan.orders[i].target.z - plan.orders[j].target.z)).toBeGreaterThanOrEqual(0.7);
        }
      }
    }
  });

  it('clique na água: o centro vai ao ponto de terra mais próximo e o plano avisa', () => {
    const units = squad(6);
    let water: Point | null = null;
    for (let x = 2; x < SIZE - 2 && !water; x += 1) {
      for (let z = 2; z < SIZE - 2 && !water; z += 1) {
        if (!canStand('human', x, z) && nearestStandable({ x, z }, 'human', canStand, SIZE)) water = { x, z };
      }
    }
    expect(water).not.toBeNull();
    const plan = planGroupMove(groupOf(units), water!, 'box', SIZE, canStand);
    expect(plan.centerMoved).toBe(true);
    expect(canStand('human', plan.center.x, plan.center.z)).toBe(true);
    expect(accepted(units, plan.orders)).toBe(units.length);
  });

  it('CONTROLE NEGATIVO: sem nenhum ponto válido por perto, ninguém recebe ordem inválida', () => {
    const units = squad(4);
    const none: typeof canStand = () => false;
    const plan = planGroupMove(groupOf(units), { x: 30, z: 30 }, 'box', SIZE, none);
    expect(plan.orders).toEqual([]);
    expect(plan.unplaced).toHaveLength(4);
    expect(plan.centerMoved).toBe(false);
  });

  it('barcos mantêm o destino da formação (o host leva ao oceano navegável)', () => {
    const boats: GroupUnit[] = [
      { id: 'b1', position: { x: 5, z: 5 }, body: 'boat' },
      { id: 'b2', position: { x: 6, z: 5 }, body: 'boat' },
    ];
    const plan = planGroupMove(boats, { x: 5, z: 40 }, 'line', SIZE, () => false);
    expect(plan.orders).toHaveLength(2);
    expect(plan.unplaced).toEqual([]);
  });

  it('o destino é limitado à margem do mundo', () => {
    const plan = planGroupMove(groupOf(squad(3)), { x: -50, z: 500 }, 'spread', SIZE, () => true);
    for (const order of plan.orders) {
      expect(order.target.x).toBeGreaterThanOrEqual(2);
      expect(order.target.z).toBeLessThanOrEqual(SIZE - 2);
    }
  });
});
