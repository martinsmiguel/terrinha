import { describe, expect, it } from 'vitest';
import { tradeResource } from '../../src/game/economy';
import type { PlayerResources } from '../../src/game/engine';

const resources = (): PlayerResources => ({
  wood: 200,
  food: 300,
  gold: 500,
  stone: 80,
  planks: 10,
  pop: 4,
  maxPop: 15,
});

describe('tradeResource', () => {
  it('buys the selected resource and charges the configured gold price', () => {
    const result = tradeResource(resources(), 'wood', 'buy', 100);

    expect(result).toMatchObject({ ok: true, goldChange: -50 });
    if (result.ok) expect(result.resources).toMatchObject({ wood: 300, gold: 450 });
  });

  it('sells stone from the stone balance and adds the configured gold price', () => {
    const result = tradeResource(resources(), 'stone', 'sell', 50);

    expect(result).toMatchObject({ ok: true, goldChange: 24 });
    if (result.ok) expect(result.resources).toMatchObject({ stone: 30, food: 300, gold: 524 });
  });

  it('rejects purchases without enough gold', () => {
    expect(tradeResource({ ...resources(), gold: 10 }, 'food', 'buy', 100)).toMatchObject({
      ok: false,
      reason: 'insufficient-gold',
      requiredGold: 55,
    });
  });

  it('rejects sales without enough of the selected resource', () => {
    expect(tradeResource(resources(), 'stone', 'sell', 81)).toEqual({
      ok: false,
      reason: 'insufficient-resource',
    });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid trade amount %s', (amount) => {
    expect(tradeResource(resources(), 'wood', 'buy', amount)).toEqual({
      ok: false,
      reason: 'invalid-amount',
    });
  });

  it('does not mutate the original resources', () => {
    const current = resources();
    const original = { ...current };

    tradeResource(current, 'food', 'sell', 100);

    expect(current).toEqual(original);
  });
});
