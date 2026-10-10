import type { GameState } from './model';
import { isExploredBy, isVisibleTo, type OwnerVision } from './visionAuthority';

/** Lado do setor de interesse, em células. */
export const SECTOR_SIZE = 16;

export const sectorOf = (x: number, z: number): string => `${Math.floor(x / SECTOR_SIZE)},${Math.floor(z / SECTOR_SIZE)}`;

/**
 * Snapshot de um destinatário: o que é dele (unidades, edifícios, saldos, pesquisa, estoques) vai inteiro, sem depender da
 * câmera; do resto, só o que ele vê agora (unidades e edifícios de outros) e o que já explorou (recursos). Sem visão do
 * destinatário, o fallback envia apenas o que é dele, nunca o mundo inteiro.
 */
export function filterSnapshotFor(state: GameState, owner: string, vision: OwnerVision | undefined): GameState {
  const hasVision = Boolean(vision?.[owner]);
  const own = <T extends { owner: string }>(entity: T): boolean => entity.owner === owner;
  const seen = (entity: { owner: string; position: { x: number; z: number } }): boolean =>
    own(entity) || (hasVision && isVisibleTo(vision, owner, entity.position.x, entity.position.z));
  const pick = <T,>(record: Record<string, T> | undefined): Record<string, T> | undefined =>
    record && owner in record ? { [owner]: record[owner] } : record ? {} : undefined;

  return {
    ...state,
    units: state.units.filter(seen),
    buildings: state.buildings.filter(seen),
    resourceNodes: hasVision ? state.resourceNodes.filter((node) => isExploredBy(vision, owner, node.position.x, node.position.z)) : [],
    playerResources: pick(state.playerResources) ?? {},
    ...(state.techs ? { techs: pick(state.techs) } : {}),
    ...(state.foundationKits ? { foundationKits: pick(state.foundationKits) } : {}),
    ...(state.localStocks ? { localStocks: pick(state.localStocks) } : {}),
    // XP só do próprio dono, sem o registro de eventos já creditados (é só do host e pesaria em todo snapshot).
    ...(state.mastery ? { mastery: owner in state.mastery ? { [owner]: { ...state.mastery[owner], credited: {} } } : {} } : {}),
  };
}
