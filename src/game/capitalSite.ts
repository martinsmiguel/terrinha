import type { Building, ResourceNode } from './model';
import { BUILDING_CATALOG } from './buildingCatalog';
import { findPath } from './movement/pathfinding';
import { FOUNDATION_KIT, type Point } from './foundation';

/** Lado do terreno plano que a capital ocupa. */
export const CAPITAL_FOOTPRINT = 5;
const MAX_SLOPE = 0.85;

export interface CapitalSiteTerrain {
  mapSize: number;
  buildings: readonly Building[];
  nodes: readonly ResourceNode[];
  isWaterAt?: (x: number, z: number) => boolean;
  isCliffAt?: (x: number, z: number) => boolean;
  getHeightAt?: (x: number, z: number) => number;
  isImpassableAt?: (x: number, z: number) => boolean;
}

export interface CapitalSiteReport {
  valid: boolean;
  /** Dentro do mapa e sem edifícios ou recursos no caminho da fundação. */
  space: boolean;
  /** Sem água, rochedo íngreme ou declive forte sob a capital. */
  terrain: boolean;
  /** A carroça consegue chegar ao sítio por terra. */
  access: boolean;
  /** O jogador ainda tem o kit reservado completo. */
  kit: boolean;
  reasons: string[];
}

const NODE_RADIUS: Record<ResourceNode['type'], number> = { gold_mine: 2, stone: 2, tree: 1.6, food_bush: 1.4, fish_school: 0 };

/** Avalia um sítio de sede por espaço, terreno, acesso e kit; é a mesma regra do preview e do host. */
export function evaluateCapitalSite(
  site: Point,
  terrain: CapitalSiteTerrain,
  options: { from?: Point; kit?: { wood: number; stone: number } } = {}
): CapitalSiteReport {
  const reasons: string[] = [];
  const half = CAPITAL_FOOTPRINT / 2;
  const { x, z } = site;

  let space = Number.isFinite(x) && Number.isFinite(z);
  const margin = half + 1.5;
  if (!space || x < margin || x > terrain.mapSize - margin || z < margin || z > terrain.mapSize - margin) {
    space = false;
    reasons.push('Fora do limite da ilha');
  } else {
    const blockedByBuilding = terrain.buildings.some((building) => {
      const def = BUILDING_CATALOG[building.type as keyof typeof BUILDING_CATALOG];
      const radius = def ? Math.max(def.footprintWidth, def.footprintDepth) * 0.55 : half;
      return Math.hypot(building.position.x - x, building.position.z - z) < radius + half * 1.1;
    });
    const blockedByNode = terrain.nodes.some(
      (node) => node.type !== 'fish_school' && Math.hypot(node.position.x - x, node.position.z - z) < NODE_RADIUS[node.type] + half
    );
    if (blockedByBuilding) reasons.push('Espaço ocupado por outro edifício');
    if (blockedByNode) reasons.push('Espaço bloqueado por recursos naturais');
    space = !blockedByBuilding && !blockedByNode;
  }

  let terrainOk = true;
  if (space) {
    const corners: Point[] = [site, { x: x - half, z: z - half }, { x: x + half, z: z - half }, { x: x - half, z: z + half }, { x: x + half, z: z + half }];
    if (terrain.isWaterAt && corners.some((corner) => terrain.isWaterAt!(corner.x, corner.z))) {
      terrainOk = false;
      reasons.push('Água sob a fundação');
    }
    if (terrain.isCliffAt && corners.some((corner) => terrain.isCliffAt!(corner.x, corner.z))) {
      terrainOk = false;
      reasons.push('Rochedo íngreme intransitável');
    }
    if (terrain.getHeightAt) {
      const center = terrain.getHeightAt(x, z);
      const slope = Math.max(...corners.slice(1).map((corner) => Math.abs(terrain.getHeightAt!(corner.x, corner.z) - center)));
      if (slope > MAX_SLOPE) {
        terrainOk = false;
        reasons.push('Terreno muito íngreme para fundação estável');
      }
    }
  } else {
    terrainOk = false;
  }

  let access = true;
  if (options.from && terrain.isImpassableAt) {
    const blocked = terrain.isImpassableAt;
    access = findPath(options.from, site, (px, pz) => blocked(px, pz), { mapSize: terrain.mapSize, maxExpanded: 2400 }).length > 0;
    if (!access) reasons.push('A carroça não alcança este sítio por terra');
  }

  const kit = options.kit === undefined || (options.kit.wood >= FOUNDATION_KIT.wood && options.kit.stone >= FOUNDATION_KIT.stone);
  if (!kit) reasons.push('Kit de fundação incompleto');

  return { valid: space && terrainOk && access && kit, space, terrain: terrainOk, access, kit, reasons };
}
