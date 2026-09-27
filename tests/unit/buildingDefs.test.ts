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
      expect(definition.buildTimeSeconds).toBeGreaterThan(0);
    }
  });

  it('keeps the documented house and barracks costs', () => {
    expect(BUILDING_CATALOG.house.cost).toEqual({ wood: 60 });
    expect(BUILDING_CATALOG.barracks.cost).toEqual({ wood: 120, gold: 30 });
  });
});
