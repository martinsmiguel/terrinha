/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Projeção única compartilhada por minimapa, mapa-múndi e cena principal.
 *
 * Cada superfície de mapa é um canvas quadrado que cobre exatamente `mapSize`
 * células do mundo, então a conversão mundo <-> pixel é linear e invertível.
 * Usar a mesma função nas duas telas (em vez de uma fórmula propria em cada
 * componente) é o que garante que um clique no mapa-múndi, um clique no
 * minimapa e a camera 3D apontem sempre para a mesma celula.
 */

export interface WorldPoint {
  x: number;
  z: number;
}

/** Lado em pixels do minimapa tatico do HUD. */
export const MINIMAP_PIXEL_SIZE = 210;

/** Lado em pixels do canvas do mapa-mundi. */
export const WORLD_MAP_PIXEL_SIZE = 720;

export const clampToMap = (value: number, mapSize: number): number =>
  Math.max(0, Math.min(mapSize, value));

/** Mundo -> pixel do canvas quadrado. */
export function worldToMapPixel(
  x: number,
  z: number,
  mapSize: number,
  pixelSize: number
): { x: number; y: number } {
  return { x: (x / mapSize) * pixelSize, y: (z / mapSize) * pixelSize };
}

/** Pixel do canvas -> mundo (inverso de `worldToMapPixel`, com clamp nas bordas). */
export function mapPixelToWorld(
  pixelX: number,
  pixelY: number,
  mapSize: number,
  pixelSize: number
): WorldPoint {
  return {
    x: clampToMap((pixelX / pixelSize) * mapSize, mapSize),
    z: clampToMap((pixelY / pixelSize) * mapSize, mapSize),
  };
}

/** Celula do grid de nevoa que contem uma coordenada de mundo. */
export function worldToCell(x: number, z: number, mapSize: number): { x: number; z: number } {
  return {
    x: Math.max(0, Math.min(mapSize - 1, Math.floor(x))),
    z: Math.max(0, Math.min(mapSize - 1, Math.floor(z))),
  };
}
