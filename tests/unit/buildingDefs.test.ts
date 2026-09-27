import { describe, expect, it } from 'vitest';
import { BUILDING_CATALOG } from '../../src/game/buildingDefs';

describe('BUILDING_CATALOG', () => {
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
