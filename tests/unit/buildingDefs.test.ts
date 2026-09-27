import { describe, expect, it } from 'vitest';
import { BUILDING_CATALOG } from '../../src/game/buildingDefs';


describe('BUILDING_CATALOG', () => {
  it('defines the eight buildable structures', () => {
    expect(Object.keys(BUILDING_CATALOG)).toHaveLength(8);
  });

  it('has non-negative resource costs and positive build times', () => {
    for (const definition of Object.values(BUILDING_CATALOG)) {
      expect(definition.cost.wood).toBeGreaterThanOrEqual(0);
      expect(definition.cost.food ?? 0).toBeGreaterThanOrEqual(0);
      expect(definition.cost.gold ?? 0).toBeGreaterThanOrEqual(0);
      expect(definition.cost.stone ?? 0).toBeGreaterThanOrEqual(0);
      expect(definition.cost.planks ?? 0).toBeGreaterThanOrEqual(0);
      expect(definition.buildTimeSeconds).toBeGreaterThan(0);
    }
  });

  it('keeps the documented house and barracks costs', () => {
    expect(BUILDING_CATALOG.house.cost).toEqual({ wood: 60 });
    expect(BUILDING_CATALOG.barracks.cost).toEqual({ wood: 120, gold: 30 });
  });

  it('charges the tower in stone and planks instead of gold', () => {
    expect(BUILDING_CATALOG.tower.cost).toEqual({ wood: 80, stone: 40, planks: 20 });
  });

  it('defines a positive resource cost for every building', () => {
    for (const building of Object.values(BUILDING_CATALOG)) {
      expect(Object.keys(building.cost).length, building.type).toBeGreaterThan(0);
      for (const [resource, amount] of Object.entries(building.cost)) {
        expect(amount, `${building.type}.${resource}`).toBeGreaterThan(0);
        expect(Number.isFinite(amount), `${building.type}.${resource}`).toBe(true);
      }
    }
  });

  it('keeps the building catalog key aligned with each definition type', () => {
    for (const [type, building] of Object.entries(BUILDING_CATALOG)) {
      expect(building.type).toBe(type);
    }
  });
});
