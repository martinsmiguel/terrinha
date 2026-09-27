/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Body {
  id: string;
  x: number;
  z: number;
}

export interface SeparationOptions {
  /** Raio de cada unidade; a separação mínima é `2 × radius`. Padrão 0.5. */
  radius?: number;
  /** Rodadas de relaxamento por chamada. Padrão 2. */
  iterations?: number;
  /** Lado do mapa usado para conter as posições. Padrão 60. */
  mapSize?: number;
  /** Quando presente, a posição não é gravada se cair num ponto bloqueado. */
  isBlocked?: (x: number, z: number) => boolean;
}

const DEFAULT_RADIUS = 0.5;
const DEFAULT_ITERATIONS = 2;
const DEFAULT_MAP_SIZE = 60;

/** Direção determinística para corpos exatamente sobrepostos. */
const fallbackDirection = (a: string, b: string): { dx: number; dz: number } => {
  let hash = 0;
  for (let i = 0; i < a.length; i++) hash = (hash * 31 + a.charCodeAt(i)) | 0;
  for (let i = 0; i < b.length; i++) hash = (hash * 17 + b.charCodeAt(i)) | 0;
  const angle = ((hash % 360) * Math.PI) / 180;
  return { dx: Math.cos(angle), dz: Math.sin(angle) };
};

/**
 * Empurra corpos sobrepostos até que a distância entre vizinhos seja de ao
 * menos `2 × radius`. Operação pura: devolve novas posições, nunca muta a
 * entrada. O broad-phase usa um grid espacial, então o custo por tick fica
 * perto de O(n) com unidades distribuídas no mapa.
 */
export const resolveSeparation = (
  bodies: Body[],
  options: SeparationOptions = {}
): Body[] => {
  const radius = options.radius ?? DEFAULT_RADIUS;
  const iterations = Math.max(1, options.iterations ?? DEFAULT_ITERATIONS);
  const mapSize = options.mapSize ?? DEFAULT_MAP_SIZE;
  const minDistance = radius * 2;
  const cellSize = minDistance;
  const isBlocked = options.isBlocked;

  const positions = bodies.map((body) => ({ id: body.id, x: body.x, z: body.z }));

  const buildGrid = (): Map<string, number[]> => {
    const grid = new Map<string, number[]>();
    positions.forEach((body, index) => {
      const key = `${Math.floor(body.x / cellSize)},${Math.floor(body.z / cellSize)}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(index);
      else grid.set(key, [index]);
    });
    return grid;
  };

  const clamp = (value: number): number => Math.min(mapSize, Math.max(0, value));

  for (let pass = 0; pass < iterations; pass++) {
    const grid = buildGrid();
    const deltas = positions.map(() => ({ dx: 0, dz: 0, touches: 0 }));

    positions.forEach((body, index) => {
      const cellX = Math.floor(body.x / cellSize);
      const cellZ = Math.floor(body.z / cellSize);

      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          const bucket = grid.get(`${cellX + ox},${cellZ + oz}`);
          if (!bucket) continue;

          for (const otherIndex of bucket) {
            if (otherIndex === index) continue;
            const other = positions[otherIndex];
            let dx = body.x - other.x;
            let dz = body.z - other.z;
            let distance = Math.hypot(dx, dz);

            if (distance >= minDistance) continue;

            const overlap = (minDistance - distance) / 2;

            if (distance === 0) {
              // Mesma direção para os dois lados, com sinal oposto.
              const ordered = body.id < other.id;
              const push = fallbackDirection(
                ordered ? body.id : other.id,
                ordered ? other.id : body.id
              );
              dx = ordered ? push.dx : -push.dx;
              dz = ordered ? push.dz : -push.dz;
              distance = 1;
            }

            // Cada metade do par anda metade da sobreposição.
            deltas[index].dx += (dx / distance) * overlap;
            deltas[index].dz += (dz / distance) * overlap;
            deltas[index].touches++;
          }
        }
      }
    });

    positions.forEach((body, index) => {
      const delta = deltas[index];
      if (delta.touches === 0) return;
      const nextX = clamp(body.x + delta.dx);
      const nextZ = clamp(body.z + delta.dz);
      if (isBlocked && isBlocked(nextX, nextZ)) return;
      body.x = nextX;
      body.z = nextZ;
    });
  }

  return positions;
};
