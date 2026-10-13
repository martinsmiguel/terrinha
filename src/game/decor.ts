import { BUILDING_CATALOG } from './buildingCatalog';
import { decorationById, type DecorationDef } from './decorations';
import { HOME, canPayAt, debitAt, type LocalityResolver } from './depots';
import { worldSizeOf, type Building, type Decoration, type GameState } from './model';
import { ERA_LABEL, eraReached, normalizeEra } from './tech';

/**
 * Decoração das ilhas (card #180): onde um enfeite pode ser posto, girado em quartos de volta, e quanto custa. A mesma
 * regra serve à prévia (verde/vermelho) e ao host, que aplica `place_decoration`. Regra pura, sem DOM.
 */

/** Quartos de volta aceitos: 0, 90, 180 e 270 graus. */
export const DECORATION_ROTATIONS = [0, 1, 2, 3] as const;
export type DecorationRotation = (typeof DECORATION_ROTATIONS)[number];

export const isDecorationRotation = (value: unknown): value is DecorationRotation =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3;

export const nextRotation = (rotation: DecorationRotation): DecorationRotation => ((rotation + 1) % 4) as DecorationRotation;

/** Área ocupada já girada: em 90 e 270 graus largura e profundidade trocam. */
export const rotatedFootprint = (def: Pick<DecorationDef, 'footprint'>, rotation: DecorationRotation): { width: number; depth: number } =>
  rotation % 2 === 0 ? { ...def.footprint } : { width: def.footprint.depth, depth: def.footprint.width };

interface Box { x: number; z: number; w: number; d: number }
const overlaps = (a: Box, b: Box): boolean => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.z - b.z) * 2 < a.d + b.d;

const buildingBox = (building: Building): Box => {
  const def = building.type === 'town_center' ? null : BUILDING_CATALOG[building.type];
  return { x: building.position.x, z: building.position.z, w: def?.footprintWidth ?? 6, d: def?.footprintDepth ?? 6 };
};

const decorationBox = (decoration: Pick<Decoration, 'type' | 'position' | 'rotation'>): Box | null => {
  const def = decorationById(decoration.type);
  if (!def) return null;
  const size = rotatedFootprint(def, decoration.rotation as DecorationRotation);
  return { x: decoration.position.x, z: decoration.position.z, w: size.width, d: size.depth };
};

export interface DecorTerrain {
  canStandAt?(body: 'human', x: number, z: number): boolean;
  isWaterAt?(x: number, z: number): boolean;
  localityOf?: LocalityResolver;
}

export interface DecorationRequest { type: string; position: { x: number; z: number }; rotation: number }

/** Localidade que paga: a ilha onde o enfeite fica (metrópole sem resolvedor). */
export const decorationPayer = (owner: string, position: { x: number; z: number }, terrain?: DecorTerrain): string =>
  terrain?.localityOf ? terrain.localityOf(owner, position) : HOME;

/**
 * Motivo da recusa (texto para o jogador) ou `null` se o enfeite pode ser posto: tipo e rotação válidos, era alcançada,
 * dentro do mapa, em terra firme e seca, sem sobrepor construção, enfeite ou recurso, e custo coberto pelo estoque da ilha.
 */
export function decorationPlacementReason(
  state: Pick<GameState, 'buildings' | 'resourceNodes' | 'decorations' | 'techs' | 'playerResources' | 'localStocks' | 'foundationKits' | 'mapSize'>,
  owner: string,
  request: DecorationRequest,
  terrain?: DecorTerrain
): string | null {
  const def = decorationById(request.type);
  if (!def) return 'Enfeite desconhecido.';
  if (!isDecorationRotation(request.rotation)) return 'Rotação inválida.';
  if (!eraReached(normalizeEra(state.techs?.[owner]?.era), def.era)) return `Exige a ${ERA_LABEL[def.era]}.`;
  const { x, z } = request.position;
  const size = rotatedFootprint(def, request.rotation);
  const half = Math.max(size.width, size.depth) / 2 + 1;
  const limit = worldSizeOf(state);
  if (!(x >= half && z >= half && x <= limit - half && z <= limit - half)) return 'Fora do limite da ilha.';
  if (terrain?.isWaterAt?.(x, z)) return 'Enfeite não vai na água.';
  if (terrain?.canStandAt && !terrain.canStandAt('human', x, z)) return 'Terreno intransitável.';
  const box: Box = { x, z, w: size.width, d: size.depth };
  if (state.buildings.some((building) => building.health > 0 && overlaps(box, buildingBox(building)))) return 'Sobrepõe uma construção.';
  if ((state.decorations ?? []).some((other) => { const otherBox = decorationBox(other); return otherBox ? overlaps(box, otherBox) : false; })) return 'Sobrepõe outro enfeite.';
  if (state.resourceNodes.some((node) => (node.remaining > 0 || node.isRegrowing) && overlaps(box, { x: node.position.x, z: node.position.z, w: 1, d: 1 }))) return 'Sobrepõe um recurso.';
  if (!canPayAt(state, owner, decorationPayer(owner, request.position, terrain), def.cost)) return 'Recursos insuficientes na ilha.';
  return null;
}

/** Põe o enfeite (validado pela mesma regra), debitando o estoque da ilha; recusa devolve o mesmo estado. */
export function placeDecoration<T extends GameState>(state: T, owner: string, request: DecorationRequest, id: string, terrain?: DecorTerrain): T {
  if (decorationPlacementReason(state, owner, request, terrain)) return state;
  const def = decorationById(request.type)!;
  const paid = debitAt(state, owner, decorationPayer(owner, request.position, terrain), def.cost);
  if (!paid) return state;
  if (def.kind === 'arvore') {
    // Muda (#207): entra como árvore em crescimento (o mesmo ciclo do reflorestamento) e é de quem plantou.
    const tree = { id, type: 'tree' as const, position: { x: request.position.x, z: request.position.z }, remaining: 0, maxCapacity: 150, isRegrowing: true, regrowthProgress: 0, plantedBy: owner };
    return { ...paid, resourceNodes: [...paid.resourceNodes, tree] };
  }
  const decoration: Decoration = { id, type: def.id, owner, position: { x: request.position.x, z: request.position.z }, rotation: request.rotation as DecorationRotation };
  return { ...paid, decorations: [...(paid.decorations ?? []), decoration] };
}
