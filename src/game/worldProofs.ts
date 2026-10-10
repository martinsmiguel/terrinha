import type { ArchipelagoLayout, IslandSpec } from './archipelago';

/** Dimensão de referência do produto: as metas absolutas do card valem para 768 e escalam com a área. */
export const REFERENCE_WORLD_SIZE = 768;

export interface WorldQueries {
  mapSize: number;
  isWaterAt(x: number, z: number): boolean;
  isCliffAt(x: number, z: number): boolean;
  isImpassableAt(x: number, z: number): boolean;
  isOceanAt(x: number, z: number): boolean;
  getHeightAt(x: number, z: number): number;
}

export interface ProofThresholds {
  /** Área útil mínima da ilha natal (células). Meta absoluta 12000 em 768. */
  minUsefulArea: number;
  /** Lado da janela de capital ("distrito"): 64 em 768. */
  districtSize: number;
  /** Fração útil mínima da janela de capital. */
  districtUsefulShare: number;
  /** Regiões (quadrantes) conectadas por terra ao ponto de chegada. */
  minRegions: number;
  minRegionArea: number;
  /** Setores de costa útil (de 8) e células de costa por setor. */
  minCoasts: number;
  minCoastCellsPerSector: number;
}

const MAX_SLOPE = 0.85;
const COAST_SECTORS = 8;

export function proofThresholds(mapSize: number): ProofThresholds {
  const areaScale = (mapSize / REFERENCE_WORLD_SIZE) ** 2;
  const districtSize = Math.max(4, Math.round((64 * mapSize) / REFERENCE_WORLD_SIZE));
  return {
    minUsefulArea: Math.max(40, 12000 * areaScale),
    districtSize,
    districtUsefulShare: 0.5,
    minRegions: 4,
    minRegionArea: Math.max(6, 1500 * areaScale),
    minCoasts: 2,
    minCoastCellsPerSector: Math.max(2, Math.round(8 * Math.sqrt(areaScale) * 3)),
  };
}

export interface NativeIslandProof {
  island: number;
  usefulArea: number;
  /** Maior janela de capital: células úteis conectadas ao ponto de chegada. */
  capitalWindowUseful: number;
  regions: number;
  coasts: number;
  checks: { area: boolean; capitalWindow: boolean; regions: boolean; coasts: boolean };
  passes: boolean;
}

/**
 * Prova, por varredura da própria geografia, que a ilha natal comporta a partida: área útil,
 * janela de capital, quatro regiões ligadas por terra ao ponto de chegada e duas costas utilizáveis.
 * Ampliar só o oceano não passa: tudo é medido em terra alcançável a pé a partir do nascedouro.
 */
export function proveNativeIsland(queries: WorldQueries, island: IslandSpec, thresholds = proofThresholds(queries.mapSize)): NativeIslandProof {
  const size = queries.mapSize;
  const reach = Math.ceil(island.baseRadius * 1.35);
  const x0 = Math.max(1, Math.floor(island.center.x - reach));
  const z0 = Math.max(1, Math.floor(island.center.z - reach));
  const x1 = Math.min(size - 2, Math.ceil(island.center.x + reach));
  const z1 = Math.min(size - 2, Math.ceil(island.center.z + reach));
  const width = x1 - x0 + 1;
  const height = z1 - z0 + 1;
  const index = (x: number, z: number) => (z - z0) * width + (x - x0);

  const useful = new Uint8Array(width * height);
  for (let z = z0; z <= z1; z += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const px = x + 0.5;
      const pz = z + 0.5;
      if (queries.isImpassableAt(px, pz) || queries.isWaterAt(px, pz) || queries.isCliffAt(px, pz)) continue;
      const h = queries.getHeightAt(px, pz);
      if (Math.abs(queries.getHeightAt(px + 1, pz) - h) > MAX_SLOPE || Math.abs(queries.getHeightAt(px, pz + 1) - h) > MAX_SLOPE) continue;
      useful[index(x, z)] = 1;
    }
  }

  // Terra útil alcançável a pé a partir do nascedouro.
  const reachable = new Uint8Array(width * height);
  const startX = Math.min(x1, Math.max(x0, Math.floor(island.spawn.x)));
  const startZ = Math.min(z1, Math.max(z0, Math.floor(island.spawn.z)));
  const stack: number[] = [];
  if (useful[index(startX, startZ)]) {
    reachable[index(startX, startZ)] = 1;
    stack.push(startX, startZ);
  }
  while (stack.length > 0) {
    const z = stack.pop()!;
    const x = stack.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < x0 || nx > x1 || nz < z0 || nz > z1) continue;
      const i = index(nx, nz);
      if (!useful[i] || reachable[i]) continue;
      reachable[i] = 1;
      stack.push(nx, nz);
    }
  }

  let usefulArea = 0;
  const quadrantArea = [0, 0, 0, 0];
  const sectorCoast = new Array<number>(COAST_SECTORS).fill(0);
  for (let z = z0; z <= z1; z += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (!reachable[index(x, z)]) continue;
      usefulArea += 1;
      const angle = Math.atan2(z + 0.5 - island.spawn.z, x + 0.5 - island.spawn.x);
      const turn = (angle + Math.PI * 2) % (Math.PI * 2);
      quadrantArea[Math.min(3, Math.floor(turn / (Math.PI / 2)))] += 1;
      const onCoast = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => queries.isOceanAt(x + dx + 0.5, z + dz + 0.5));
      if (onCoast) sectorCoast[Math.min(COAST_SECTORS - 1, Math.floor(turn / ((Math.PI * 2) / COAST_SECTORS)))] += 1;
    }
  }

  // Maior janela de capital alcançável: soma por janela deslizante (tabela de somas).
  const district = thresholds.districtSize;
  const sums = new Int32Array((width + 1) * (height + 1));
  for (let z = 0; z < height; z += 1) {
    for (let x = 0; x < width; x += 1) {
      sums[(z + 1) * (width + 1) + (x + 1)] = reachable[z * width + x] + sums[z * (width + 1) + (x + 1)] + sums[(z + 1) * (width + 1) + x] - sums[z * (width + 1) + x];
    }
  }
  let capitalWindowUseful = 0;
  const step = Math.max(1, Math.floor(district / 4));
  for (let z = 0; z + district <= height; z += step) {
    for (let x = 0; x + district <= width; x += step) {
      const total = sums[(z + district) * (width + 1) + (x + district)] - sums[z * (width + 1) + (x + district)] - sums[(z + district) * (width + 1) + x] + sums[z * (width + 1) + x];
      if (total > capitalWindowUseful) capitalWindowUseful = total;
    }
  }

  const regions = quadrantArea.filter((area) => area >= thresholds.minRegionArea).length;
  const coasts = sectorCoast.filter((cells) => cells >= thresholds.minCoastCellsPerSector).length;
  const checks = {
    area: usefulArea >= thresholds.minUsefulArea,
    capitalWindow: capitalWindowUseful >= district * district * thresholds.districtUsefulShare,
    regions: regions >= thresholds.minRegions,
    coasts: coasts >= thresholds.minCoasts,
  };
  return { island: island.index, usefulArea, capitalWindowUseful, regions, coasts, checks, passes: Object.values(checks).every(Boolean) };
}

export interface WorldProof {
  islands: NativeIslandProof[];
  viable: boolean;
}

/** Prova as quatro ilhas natais; o mundo só é viável se todas passam. */
export function proveWorld(queries: WorldQueries, layout: Pick<ArchipelagoLayout, 'islands'>): WorldProof {
  const thresholds = proofThresholds(queries.mapSize);
  const islands = layout.islands.filter((island) => island.kind === 'native').map((island) => proveNativeIsland(queries, island, thresholds));
  return { islands, viable: islands.every((proof) => proof.passes) };
}
