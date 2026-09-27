/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PlayerResources } from './engine';

export type MarketResourceType = 'wood' | 'food' | 'stone';

export interface MarketRate {
  buyPrice: number;
  sellPrice: number;
}

/** Taxas do Mercadão (preço em ouro por 100 unidades do recurso). */
export const MARKET_RATES: Record<MarketResourceType, MarketRate> = {
  wood: { buyPrice: 50, sellPrice: 35 },
  food: { buyPrice: 55, sellPrice: 38 },
  stone: { buyPrice: 70, sellPrice: 48 },
};

export const MARKET_LABELS: Record<MarketResourceType, string> = {
  wood: 'madeira',
  food: 'comida',
  stone: 'pedra',
};

export const goldCostForBuy = (type: MarketResourceType, amount: number): number =>
  Math.round((amount / 100) * MARKET_RATES[type].buyPrice);

export const goldGainForSell = (type: MarketResourceType, amount: number): number =>
  Math.round((amount / 100) * MARKET_RATES[type].sellPrice);

export interface TradeOutcome {
  ok: boolean;
  reason?: string;
  next?: PlayerResources;
}

/**
 * Compra/vende `amount` unidades de um recurso por ouro no Mercadão.
 * Operação pura: devolve o novo estado dos recursos ou o motivo da recusa.
 */
export function tradeResource(
  resources: PlayerResources,
  type: MarketResourceType,
  action: 'buy' | 'sell',
  amount: number
): TradeOutcome {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'Quantidade de comércio inválida.' };
  }

  const label = MARKET_LABELS[type];

  if (action === 'buy') {
    const totalGoldCost = goldCostForBuy(type, amount);
    if (resources.gold < totalGoldCost) {
      return { ok: false, reason: `Ouro insuficiente! Necessário ${totalGoldCost} ouro.` };
    }
    return {
      ok: true,
      next: {
        ...resources,
        gold: resources.gold - totalGoldCost,
        [type]: resources[type] + amount,
      },
    };
  }

  const currentSupply = resources[type];
  if (currentSupply < amount) {
    return { ok: false, reason: `Sem ${label} suficiente no armazém para vender!` };
  }
  const totalGoldGain = goldGainForSell(type, amount);
  return {
    ok: true,
    next: {
      ...resources,
      [type]: currentSupply - amount,
      gold: resources.gold + totalGoldGain,
    },
  };
}
