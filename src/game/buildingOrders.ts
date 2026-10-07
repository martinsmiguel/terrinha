import type { Building, GameState } from './engine';
import { applyCost, canAfford, type ResourceCost } from './economy';

/** Revalidação e débito atômicos na aplicação do host, após validar o comando. */
export function applyBuildingFoundation(
  state: GameState,
  foundation: Building,
  cost: ResourceCost,
  builderIds: readonly string[],
  placementAllowed: (state: GameState) => boolean,
): GameState {
  const resources = state.playerResources[foundation.owner];
  if (!resources || !canAfford(resources, cost) || !placementAllowed(state)) return state;
  if (state.buildings.some((building) => building.id === foundation.id)) return state;
  const builders = new Set(builderIds);
  if (builderIds.some((id) => !state.units.some((unit) =>
    unit.id === id && unit.owner === foundation.owner && unit.type === 'villager' && unit.health > 0
  ))) return state;
  return {
    ...state,
    buildings: [...state.buildings, foundation],
    units: state.units.map((unit) => builders.has(unit.id)
      ? { ...unit, state: 'building' as const, targetEntityId: foundation.id, targetPosition: null }
      : unit),
    playerResources: { ...state.playerResources, [foundation.owner]: applyCost(resources, cost) },
  };
}
