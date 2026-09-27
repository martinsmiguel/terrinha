import { describe, expect, it } from 'vitest';
import {
  SAWMILL_PLANKS_PER_TICK,
  SAWMILL_WOOD_PER_TICK,
  UNIT_COSTS,
  applyCost,
  canAfford,
  describeCost,
  halfCost,
  missingCost,
  refinePlanks,
  refundCost,
  tradeResource,
} from '../../src/game/economy';
import type { PlayerResources } from '../../src/game/engine';

const resources = (): PlayerResources => ({
  wood: 200,
  food: 300,
  gold: 500,
  stone: 75,
  planks: 0,
  pop: 3,
  maxPop: 15,
});

describe('tradeResource', () => {
  it('debits gold and adds the purchased resource', () => {
    const result = tradeResource(resources(), 'wood', 'buy', 100);

    expect(result.ok).toBe(true);
    expect(result.next?.wood).toBe(300);
    expect(result.next?.gold).toBe(450);
  });

  it('buying stone changes stone rather than food', () => {
    const initial = resources();
    const result = tradeResource(initial, 'stone', 'buy', 100);

    expect(result.ok).toBe(true);
    expect(result.next?.stone).toBe(175);
    expect(result.next?.food).toBe(initial.food);
    expect(result.next?.gold).toBe(430);
  });

  it('selling stone removes stone and credits gold', () => {
    const initial = resources();
    const result = tradeResource(initial, 'stone', 'sell', 50);

    expect(result.ok).toBe(true);
    expect(result.next?.stone).toBe(25);
    expect(result.next?.food).toBe(initial.food);
    expect(result.next?.gold).toBe(524);
  });

  it('rejects a purchase when the player lacks gold', () => {
    const poor = { ...resources(), gold: 10 };
    const result = tradeResource(poor, 'stone', 'buy', 100);

    expect(result.ok).toBe(false);
    expect(result.next).toBeUndefined();
    expect(poor.stone).toBe(75);
  });

  it('rejects a sale when the player lacks the resource', () => {
    const initial = resources();
    const result = tradeResource(initial, 'stone', 'sell', 100);

    expect(result.ok).toBe(false);
    expect(result.next).toBeUndefined();
    expect(initial.gold).toBe(500);
  });

  it('rejects non-positive and non-finite amounts', () => {
    expect(tradeResource(resources(), 'food', 'buy', 0).ok).toBe(false);
    expect(tradeResource(resources(), 'food', 'sell', Number.NaN).ok).toBe(false);
  });
});

describe('canAfford', () => {
  it('accepts a cost the player can pay', () => {
    expect(canAfford(resources(), { wood: 200, stone: 75 })).toBe(true);
  });

  it('rejects when a single resource is missing', () => {
    expect(canAfford(resources(), { wood: 201 })).toBe(false);
    expect(canAfford(resources(), { planks: 1 })).toBe(false);
  });

  it('treats absent resources as zero', () => {
    const noStone = { ...resources(), stone: 0 };
    expect(canAfford(noStone, { stone: 0 })).toBe(true);
    expect(canAfford(noStone, { stone: 1 })).toBe(false);
  });
});

describe('applyCost and refundCost', () => {
  it('debits every listed resource', () => {
    const next = applyCost(resources(), { wood: 80, stone: 40, planks: 20 });

    expect(next.wood).toBe(120);
    expect(next.stone).toBe(35);
    expect(next.planks).toBe(-20);
    expect(next.food).toBe(300);
  });

  it('never mutates the original object', () => {
    const initial = resources();
    applyCost(initial, { wood: 10 });

    expect(initial.wood).toBe(200);
  });

  it('refundCost reverses applyCost exactly', () => {
    const initial = resources();
    const cost = { wood: 75, gold: 40, planks: 25 };
    const refunded = refundCost(applyCost(initial, cost), cost);

    expect(refunded).toEqual(initial);
  });
});

describe('missingCost', () => {
  it('returns null when the player can pay', () => {
    expect(missingCost(resources(), { wood: 100 })).toBeNull();
  });

  it('reports the first missing resource with its full name', () => {
    const empty = { ...resources(), stone: 0 };
    expect(missingCost(empty, { wood: 60, stone: 40 })).toBe('Falta 40 Pedra');
  });

  it('uses the short label when asked', () => {
    const empty = { ...resources(), planks: 0 };
    expect(missingCost(empty, { planks: 30 }, 'short')).toBe('Falta 30 T');
  });
});

describe('describeCost', () => {
  it('formats only the resources present in the cost', () => {
    expect(describeCost(UNIT_COSTS.soldier)).toBe('80C · 40O');
    expect(describeCost(UNIT_COSTS.fishing_boat)).toBe('75M · 25T');
  });

  it('returns an empty string for an empty cost', () => {
    expect(describeCost({})).toBe('');
  });
});

describe('refinePlanks', () => {
  it('trades wood for planks at the sawmill rate', () => {
    const next = refinePlanks(resources(), 2);

    expect(next.wood).toBeCloseTo(200 - 2 * SAWMILL_WOOD_PER_TICK);
    expect(next.planks).toBeCloseTo(2 * SAWMILL_PLANKS_PER_TICK);
  });

  it('does nothing without a completed sawmill', () => {
    const initial = resources();
    expect(refinePlanks(initial, 0)).toBe(initial);
  });

  it('stops refining when wood runs out', () => {
    const nearlyEmpty = { ...resources(), wood: 0.02, planks: 0 };
    const next = refinePlanks(nearlyEmpty, 5);

    expect(next.wood).toBe(0);
    expect(next.planks).toBeCloseTo(0.02 * (SAWMILL_PLANKS_PER_TICK / SAWMILL_WOOD_PER_TICK));
  });
});

describe('halfCost', () => {
  it('floors every resource at half and drops zero entries', () => {
    expect(halfCost({ wood: 80, stone: 40, planks: 20 })).toEqual({ wood: 40, stone: 20, planks: 10 });
    expect(halfCost({ wood: 75, gold: 31 })).toEqual({ wood: 37, gold: 15 });
    expect(halfCost({ gold: 1 })).toEqual({});
    expect(halfCost({})).toEqual({});
  });
});
