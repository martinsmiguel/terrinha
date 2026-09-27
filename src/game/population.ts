import type { PlayerResources } from './engine';

export type ResourceTable = Record<string, PlayerResources>;

interface OwnedWithHealth {
  owner: string;
  health: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Conta quantas unidades mortas (health <= 0) ha por jogador
export function countDeathsByOwner(units: OwnedWithHealth[]): Record<string, number> {
  const deaths: Record<string, number> = {};
  for (const unit of units) {
    if (unit.health <= 0) {
      deaths[unit.owner] = (deaths[unit.owner] || 0) + 1;
    }
  }
  return deaths;
}

// Aplica uma variacao de populacao mantendo pop dentro de [0, maxPop]
export function applyPopDelta(
  resources: ResourceTable,
  owner: string,
  delta: number
): ResourceTable {
  const current = resources[owner];
  if (!current) return resources;
  return {
    ...resources,
    [owner]: {
      ...current,
      pop: clamp(current.pop + delta, 0, current.maxPop),
    },
  };
}
