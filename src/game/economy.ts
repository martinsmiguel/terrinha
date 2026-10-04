/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PlayerResources, UnitType } from './engine';

export type MarketResourceType = 'wood' | 'food' | 'stone';

/** Recursos que podem compor um custo (edifícios e unidades). */
export type CostKey = 'wood' | 'food' | 'gold' | 'stone' | 'planks';

export interface ResourceCost {
  wood?: number;
  food?: number;
  gold?: number;
  stone?: number;
  planks?: number;
}

export const COST_SHORT: Record<CostKey, string> = {
  wood: 'M',
  food: 'C',
  gold: 'O',
  stone: 'P',
  planks: 'T',
};

export const COST_LABEL: Record<CostKey, string> = {
  wood: 'Madeira',
  food: 'Comida',
  gold: 'Ouro',
  stone: 'Pedra',
  planks: 'Tábuas',
};

/** Cor de exibição de cada chip de custo na UI. */
export const COST_CHIP_CLASS: Record<CostKey, string> = {
  wood: 'text-amber-400 font-bold',
  food: 'text-red-300 font-bold',
  gold: 'text-yellow-300 font-bold',
  stone: 'text-slate-300 font-bold',
  planks: 'text-orange-300 font-bold',
};

const COST_KEYS: CostKey[] = ['wood', 'food', 'gold', 'stone', 'planks'];

/** Custo de cada unidade treinável (fonte única de verdade). */
export const UNIT_COSTS: Record<UnitType, ResourceCost> = {
  villager: { food: 50 },
  soldier: { food: 80, gold: 40 },
  cavalry: { food: 60, gold: 80 },
  fishing_boat: { wood: 75, planks: 25 },
  trade_boat: { wood: 100, gold: 30, planks: 30 },
  warship: { wood: 120, gold: 80, planks: 40 },
};

/** 2 madeira refinadas viram 1 tábua por tick de cada Serralheria concluída. */
export const SAWMILL_WOOD_PER_TICK = 0.1;
export const SAWMILL_PLANKS_PER_TICK = 0.05;

export const canAfford = (resources: PlayerResources, cost: ResourceCost): boolean =>
  COST_KEYS.every((key) => (resources[key] || 0) >= (cost[key] || 0));

/** Descreve o custo no formato curto ("100M · 40P · 20T"). */
export const describeCost = (cost: ResourceCost): string =>
  COST_KEYS.filter((key) => (cost[key] || 0) > 0)
    .map((key) => `${cost[key]}${COST_SHORT[key]}`)
    .join(' · ');

/** Retorna a primeira falta ("Falta 40 Pedra") ou null se puder pagar. */
export const missingCost = (
  resources: PlayerResources,
  cost: ResourceCost,
  style: 'short' | 'full' = 'full'
): string | null => {
  for (const key of COST_KEYS) {
    const required = cost[key] || 0;
    const owned = resources[key] || 0;
    if (owned < required) {
      const name = style === 'short' ? COST_SHORT[key] : COST_LABEL[key];
      return `Falta ${Math.ceil(required - owned)} ${name}`;
    }
  }
  return null;
};

/** Deduz o custo dos recursos (assume canAfford). Operação pura. */
export const applyCost = (resources: PlayerResources, cost: ResourceCost): PlayerResources => {
  const next = { ...resources };
  COST_KEYS.forEach((key) => {
    next[key] = (next[key] || 0) - (cost[key] || 0);
  });
  return next;
};

/** Devolve integralmente o custo (cancelamento de treino). Operação pura. */
export const refundCost = (resources: PlayerResources, cost: ResourceCost): PlayerResources => {
  const next = { ...resources };
  COST_KEYS.forEach((key) => {
    next[key] = (next[key] || 0) + (cost[key] || 0);
  });
  return next;
};

/** Devolve metade (arredondada para baixo) do custo — reembolso da demolição. */
export const halfCost = (cost: ResourceCost): ResourceCost => {
  const half: ResourceCost = {};
  COST_KEYS.forEach((key) => {
    const value = Math.floor((cost[key] || 0) / 2);
    if (value > 0) half[key] = value;
  });
  return half;
};

/**
 * Refino de tábuas na Serralheria: consome madeira e produz tábuas.
 * Operação pura; sem madeira disponível não há refino.
 */
export const refinePlanks = (
  resources: PlayerResources,
  completedSawmills: number
): PlayerResources => {
  if (completedSawmills <= 0) return resources;
  const woodUsed = Math.min(resources.wood, completedSawmills * SAWMILL_WOOD_PER_TICK);
  if (woodUsed <= 0) return resources;
  return {
    ...resources,
    wood: resources.wood - woodUsed,
    planks: resources.planks + woodUsed * (SAWMILL_PLANKS_PER_TICK / SAWMILL_WOOD_PER_TICK),
  };
};

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
