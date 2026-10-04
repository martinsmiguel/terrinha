/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regras puras (sem DOM e sem three.js) das telas de mapa: o que o jogador ja
 * descobriu, para onde um clique leva a camera e quando uma ilha pode ser
 * nomeada. O `WorldMapModal` e o `Minimap` apenas desenham o que estas funcoes
 * decidem, o que torna os criterios de exploracao testaveis sem canvas.
 */

import type { IslandSpec } from './archipelago';
import { isExploredAt, isVisibleAt } from './visibility';
import { mapPixelToWorld, worldToCell, WORLD_MAP_PIXEL_SIZE } from './mapProjection';

export interface MapDiscoveryQuery {
  /** Lado do mapa em celulas (60 em `MAP_SIZE`). */
  mapSize: number;
  /** Grid de exploracao do jogador local, na ordem `x * mapSize + z`. */
  visibility: Uint8Array;
  /** Modo desenvolvedor: ignora a nevoa e revela o mundo inteiro. */
  revealAll?: boolean;
}

export interface MapClick extends MapDiscoveryQuery {
  pixelX: number;
  pixelY: number;
  pixelSize?: number;
}

/** A celula de mundo esta explorada (ou o modo desenvolvedor esta ativo). */
export function isMapCellKnown(
  cellX: number,
  cellZ: number,
  query: MapDiscoveryQuery
): boolean {
  return Boolean(query.revealAll) || isExploredAt(query.visibility, cellX, cellZ, { size: query.mapSize });
}

/** Uma unidade ou edificio inimigo so aparece sob visao atual da celula. */
export function isMapCellVisible(
  cellX: number,
  cellZ: number,
  query: MapDiscoveryQuery
): boolean {
  return Boolean(query.revealAll) || isVisibleAt(query.visibility, cellX, cellZ, { size: query.mapSize });
}

/**
 * Celula de mundo apontada por um clique no mapa-mundi. Devolve `null` quando a
 * regiao ainda nao foi descoberta: o mapa nao pode ser usado como atalho para
 * navegar (ou revelar) territorio desconhecido.
 */
export function worldMapClickTarget(click: MapClick): { x: number; z: number } | null {
  const pixelSize = click.pixelSize ?? WORLD_MAP_PIXEL_SIZE;
  const world = mapPixelToWorld(click.pixelX, click.pixelY, click.mapSize, pixelSize);
  const cell = worldToCell(world.x, world.z, click.mapSize);
  if (!isMapCellKnown(cell.x, cell.z, click)) return null;
  return { x: cell.x + 0.5, z: cell.z + 0.5 };
}

/** Coordenada de mundo apontada por um clique no minimapa (posicao continua). */
export function minimapClickTarget(
  pixelX: number,
  pixelY: number,
  mapSize: number,
  pixelSize: number
): { x: number; z: number } {
  return mapPixelToWorld(pixelX, pixelY, mapSize, pixelSize);
}

/**
 * Uma ilha so e revelada (nome no mapa-mundi) quando alguma celula dentro do
 * seu raio base ja foi vista. Ilhas totalmente desconhecidas ficam anonimas.
 */
export function isIslandDiscovered(island: IslandSpec, query: MapDiscoveryQuery): boolean {
  if (query.revealAll) return true;
  const minX = Math.max(0, Math.floor(island.center.x - island.baseRadius));
  const maxX = Math.min(query.mapSize - 1, Math.ceil(island.center.x + island.baseRadius));
  const minZ = Math.max(0, Math.floor(island.center.z - island.baseRadius));
  const maxZ = Math.min(query.mapSize - 1, Math.ceil(island.center.z + island.baseRadius));

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      if (!isMapCellKnown(x, z, query)) continue;
      const dx = x - island.center.x;
      const dz = z - island.center.z;
      if (dx * dx + dz * dz <= island.baseRadius * island.baseRadius) return true;
    }
  }
  return false;
}
