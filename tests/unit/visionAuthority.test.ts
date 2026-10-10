import { describe, expect, it } from 'vitest';
import type { Building, Unit } from '../../src/game/model';
import { canTarget, isExploredBy, isVisibleTo, updateOwnerVision, visionSourcesFor } from '../../src/game/visionAuthority';

const unit = (owner: string, x: number, z: number, extra: Partial<Unit> = {}): Unit => ({
  id: `${owner}-${x}-${z}`, type: 'villager', owner, position: { x, z }, targetPosition: null, targetEntityId: null,
  health: 100, maxHealth: 100, attackDamage: 5, state: 'idle', ...extra,
});
const building = (owner: string, x: number, z: number): Building => ({
  id: `b-${owner}`, type: 'house', owner, position: { x, z }, health: 100, maxHealth: 100, isComplete: true, trainingQueue: [],
});

describe('visão autoritativa por dono', () => {
  it('cada dono vê só o que as próprias unidades e edifícios revelam', () => {
    const state = { units: [unit('player1', 10, 10), unit('player2', 50, 50)], buildings: [building('player2', 40, 40)] };
    const vision = updateOwnerVision(undefined, state, ['player1', 'player2'], 60);
    expect(isVisibleTo(vision, 'player1', 10, 10)).toBe(true);
    expect(isVisibleTo(vision, 'player1', 50, 50)).toBe(false);
    expect(isVisibleTo(vision, 'player2', 50, 50)).toBe(true);
    expect(isVisibleTo(vision, 'player2', 10, 10)).toBe(false);
    expect(isVisibleTo(vision, 'player3', 10, 10)).toBe(false);
  });

  it('o que saiu de vista continua explorado, mas deixa de ser visível', () => {
    const first = updateOwnerVision(undefined, { units: [unit('player1', 10, 10)], buildings: [] }, ['player1'], 60);
    const moved = updateOwnerVision(first, { units: [unit('player1', 40, 40)], buildings: [] }, ['player1'], 60);
    expect(isVisibleTo(moved, 'player1', 10, 10)).toBe(false);
    expect(isExploredBy(moved, 'player1', 10, 10)).toBe(true);
    expect(isVisibleTo(moved, 'player1', 40, 40)).toBe(true);
    expect(isExploredBy(moved, 'player1', 55, 5)).toBe(false);
  });

  it('unidades mortas não revelam e a grade acompanha a dimensão do mundo', () => {
    const state = { units: [unit('player1', 100, 100, { health: 0 })], buildings: [] };
    expect(visionSourcesFor(state, 'player1')).toEqual([]);
    const vision = updateOwnerVision(updateOwnerVision(undefined, state, ['player1'], 60), { units: [unit('player1', 100, 100)], buildings: [] }, ['player1'], 192);
    expect(vision.player1.length).toBe(192 * 192);
    expect(isVisibleTo(vision, 'player1', 100, 100)).toBe(true);
  });

  describe('canTarget', () => {
    const vision = updateOwnerVision(undefined, { units: [unit('player1', 10, 10)], buildings: [] }, ['player1'], 60);
    const enemy = (x: number, z: number) => ({ owner: 'player2', position: { x, z } });

    it('inimigo só é alvo enquanto visível; fora de vista, mesmo explorado, não', () => {
      expect(canTarget(vision, 'player1', enemy(12, 10), 'visible')).toBe(true);
      expect(canTarget(vision, 'player1', enemy(50, 50), 'visible')).toBe(false);
      const aged = updateOwnerVision(vision, { units: [unit('player1', 40, 40)], buildings: [] }, ['player1'], 60);
      expect(isExploredBy(aged, 'player1', 12, 10)).toBe(true);
      expect(canTarget(aged, 'player1', enemy(12, 10), 'visible')).toBe(false);
      expect(canTarget(aged, 'player1', enemy(12, 10), 'explored')).toBe(true);
    });

    it('próprios são sempre conhecidos e sem informação de visão nada é bloqueado', () => {
      expect(canTarget(vision, 'player1', { owner: 'player1', position: { x: 55, z: 55 } }, 'visible')).toBe(true);
      expect(canTarget(undefined, 'player1', enemy(55, 55), 'visible')).toBe(true);
      expect(canTarget(vision, 'player1', { position: { x: 55, z: 55 } }, 'explored')).toBe(false);
    });
  });
});
