import { describe, expect, it } from 'vitest';
import { tradeResource } from '../../src/game/economy';
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
