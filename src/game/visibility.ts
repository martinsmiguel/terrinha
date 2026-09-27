/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Building, Unit } from './engine';

/** Nunca vista pelo jogador (véu preto). */
export const VISION_UNEXPLORED = 0;
/** Já explorada, mas sem visão agora (névoa semi-transparente). */
export const VISION_EXPLORED = 1;
/** Sob visão de alguma unidade ou edifício agora. */
export const VISION_VISIBLE = 2;

export type VisionCell = 0 | 1 | 2;

export interface VisionSource {
  x: number;
  z: number;
  radius: number;
}

export interface VisionOptions {
  /** Lado do grid em células (padrão 60 = 1 célula por unidade de mundo). */
  size?: number;
}

/**
 * Grid de névoa em vetor plano. O índice é `x * size + z`, a mesma ordem do
 * `exploredGrid[x][z]` do `Minimap`, para que cena 3D e minimapa leiam os
 * mesmos estados.
 */
export const createVisionGrid = (options: VisionOptions = {}): Uint8Array =>
  new Uint8Array((options.size ?? 60) * (options.size ?? 60));

/** Raio de visão por entidade — espelha o cálculo usado no minimapa. */
export const visionRadiusFor = (entity: Unit | Building): number => {
  if ('attackDamage' in entity) {
    return entity.type === 'soldier' ? 11 : 8;
  }
  if (entity.type === 'town_center') return 16;
  if (entity.type === 'barracks') return 12;
  return 9;
};

/** Estado de uma célula; células fora do grid são tratadas como nunca vistas. */
export const visionAt = (grid: Uint8Array, x: number, z: number, options: VisionOptions = {}): VisionCell => {
  const size = options.size ?? 60;
  if (x < 0 || z < 0 || x >= size || z >= size) return VISION_UNEXPLORED;
  const value = grid[x * size + z];
  return value === VISION_VISIBLE ? VISION_VISIBLE : value === VISION_EXPLORED ? VISION_EXPLORED : VISION_UNEXPLORED;
};

export const isExploredAt = (grid: Uint8Array, x: number, z: number, options: VisionOptions = {}): boolean =>
  visionAt(grid, x, z, options) !== VISION_UNEXPLORED;

export const isVisibleAt = (grid: Uint8Array, x: number, z: number, options: VisionOptions = {}): boolean =>
  visionAt(grid, x, z, options) === VISION_VISIBLE;

/**
 * Aplica a visão das fontes: tudo que está no alcance passa a `VISIBLE`.
 * Operação pura — devolve um grid novo e preserva o já explorado.
 */
export const revealVision = (
  grid: Uint8Array,
  sources: VisionSource[],
  options: VisionOptions = {}
): Uint8Array => {
  const size = options.size ?? 60;
  const next = grid.slice();

  for (const source of sources) {
    const radius = source.radius;
    const minX = Math.max(0, Math.floor(source.x - radius));
    const maxX = Math.min(size - 1, Math.ceil(source.x + radius));
    const minZ = Math.max(0, Math.floor(source.z - radius));
    const maxZ = Math.min(size - 1, Math.ceil(source.z + radius));
    const radiusSquared = radius * radius;

    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const dx = source.x - x;
        const dz = source.z - z;
        if (dx * dx + dz * dz <= radiusSquared) {
          next[x * size + z] = VISION_VISIBLE;
        }
      }
    }
  }

  return next;
};

/**
 * Envelhece o grid: o que estava `VISIBLE` vira `EXPLORED` (semi-fog).
 * Chame **antes** do `revealVision` do tick seguinte, para a visão atual
 * sobreviver até a próxima rodada.
 */
export const expireVision = (grid: Uint8Array): Uint8Array => {
  const next = grid.slice();
  for (let i = 0; i < next.length; i++) {
    if (next[i] === VISION_VISIBLE) {
      next[i] = VISION_EXPLORED;
    }
  }
  return next;
};

/** Quantas células o jogador já viu alguma vez. */
export const exploredCount = (grid: Uint8Array): number => {
  let count = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== VISION_UNEXPLORED) count++;
  }
  return count;
};
