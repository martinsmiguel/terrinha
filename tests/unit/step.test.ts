import { describe, expect, it } from 'vitest';
import { canOccupy, stepToward, type StepTerrain } from '../../src/game/movement/step';

// Água para x >= 10; terra para x < 10. O oceano é a mesma região de água.
const terrain: StepTerrain = {
  isImpassableAt: (x) => x >= 10,
  isOceanAt: (x) => x >= 10,
};

describe('canOccupy', () => {
  it('terra para unidades terrestres e oceano para barcos', () => {
    expect(canOccupy('villager', 5, 0, terrain)).toBe(true);
    expect(canOccupy('villager', 12, 0, terrain)).toBe(false);
    expect(canOccupy('warship', 12, 0, terrain)).toBe(true);
    expect(canOccupy('warship', 5, 0, terrain)).toBe(false);
    expect(canOccupy('villager', 99, 99)).toBe(true);
  });
});

describe('stepToward', () => {
  it('anda a velocidade pedida e nunca ultrapassa o alvo', () => {
    expect(stepToward('villager', { x: 0, z: 0 }, { x: 4, z: 0 }, 0.5, terrain)).toEqual({ x: 0.5, z: 0 });
    expect(stepToward('villager', { x: 0, z: 0 }, { x: 0.2, z: 0 }, 0.5, terrain)).toEqual({ x: 0.2, z: 0 });
  });

  it('recusa passo para dentro da água e desliza pelo eixo livre', () => {
    expect(stepToward('villager', { x: 9.9, z: 0 }, { x: 20, z: 0 }, 0.5, terrain)).toBeNull();
    const slide = stepToward('villager', { x: 9.9, z: 0 }, { x: 20, z: 5 }, 0.5, terrain);
    expect(slide).not.toBeNull();
    expect(slide!.x).toBeLessThan(10);
    expect(slide!.z).toBeGreaterThan(0);
  });

  it('barcos não saem do oceano nem deslizam por terra', () => {
    expect(stepToward('warship', { x: 10.2, z: 0 }, { x: 0, z: 0 }, 0.5, terrain)).toBeNull();
    expect(stepToward('warship', { x: 12, z: 0 }, { x: 20, z: 0 }, 0.5, terrain)).toEqual({ x: 12.5, z: 0 });
  });

  it('recusa velocidade inválida, alvo no mesmo ponto e coordenadas não finitas', () => {
    expect(stepToward('villager', { x: 0, z: 0 }, { x: 4, z: 0 }, 0, terrain)).toBeNull();
    expect(stepToward('villager', { x: 0, z: 0 }, { x: 4, z: 0 }, Number.NaN, terrain)).toBeNull();
    expect(stepToward('villager', { x: 1, z: 1 }, { x: 1, z: 1 }, 0.5, terrain)).toBeNull();
    expect(stepToward('villager', { x: 0, z: 0 }, { x: Number.POSITIVE_INFINITY, z: 0 }, 0.5, terrain)).toBeNull();
  });
});
