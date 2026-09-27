import type { PlayerResources } from './engine';

export type MarketResource = 'wood' | 'food' | 'stone';
export type TradeAction = 'buy' | 'sell';

export type TradeResult =
  | { ok: true; resources: PlayerResources; goldChange: number }
  | { ok: false; reason: 'invalid-amount' | 'insufficient-gold' | 'insufficient-resource'; requiredGold?: number };

const MARKET_RATES: Record<MarketResource, { buy: number; sell: number }> = {
  wood: { buy: 50, sell: 35 },
  food: { buy: 55, sell: 38 },
  stone: { buy: 70, sell: 48 },
};

/** Applies a market trade without mutating the player's current resources. */
export function tradeResource(
  resources: PlayerResources,
  type: MarketResource,
  action: TradeAction,
  amount: number
): TradeResult {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'invalid-amount' };
  }

  const goldChange = Math.round((amount / 100) * MARKET_RATES[type][action]);

  if (action === 'buy') {
    if (resources.gold < goldChange) {
      return { ok: false, reason: 'insufficient-gold', requiredGold: goldChange };
    }
    return {
      ok: true,
      resources: {
        ...resources,
        gold: resources.gold - goldChange,
        [type]: resources[type] + amount,
      },
      goldChange: -goldChange,
    };
  }

  if (resources[type] < amount) {
    return { ok: false, reason: 'insufficient-resource' };
  }
  return {
    ok: true,
    resources: {
      ...resources,
      [type]: resources[type] - amount,
      gold: resources.gold + goldChange,
    },
    goldChange,
  };
}
