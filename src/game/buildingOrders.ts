import type { Building, GameState } from './engine';
import type { ResourceCost } from './economy';
import { HOME, canPayAt, debitAt } from './depots';

/** Revalidação e débito atômicos na aplicação do host, após validar o comando. */
export function applyBuildingFoundation(
  state: GameState,
  foundation: Building,
  cost: ResourceCost,
  builderIds: readonly string[],
  placementAllowed: (state: GameState) => boolean,
  /** Localidade que paga a obra: o estoque local numa colônia, a metrópole (`HOME`) no resto. */
  payFrom: string = HOME,
): GameState {
  if (!state.playerResources[foundation.owner] || !canPayAt(state, foundation.owner, payFrom, cost) || !placementAllowed(state)) return state;
  if (state.buildings.some((building) => building.id === foundation.id)) return state;
  const builders = new Set(builderIds);
  if (builderIds.some((id) => !state.units.some((unit) =>
    unit.id === id && unit.owner === foundation.owner && unit.type === 'villager' && unit.health > 0
  ))) return state;
  const paid = debitAt(state, foundation.owner, payFrom, cost);
  if (!paid) return state;
  return {
    ...paid,
    buildings: [...state.buildings, foundation],
    units: state.units.map((unit) => builders.has(unit.id)
      ? { ...unit, state: 'building' as const, targetEntityId: foundation.id, targetPosition: null }
      : unit),
  };
}
