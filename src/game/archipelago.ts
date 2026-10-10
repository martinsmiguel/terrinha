/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Nucleo puro (sem three.js) da geracao de arquipelago: layout das ilhas,
 * perfis geographicos/economicos, elevacao unificada e alcance terrestre.
 *
 * Compartilhado pelo gerador do mapa (proceduralMap.ts) e pelo minimapa,
 * garantindo que as duas representacoes nunca divergam (ADR-0003).
 *
 * Regras do oceano (criterio #40):
 * - O oceano e a unica superficie navegavel por barcos (isOcean).
 * - Rios e lagos nunca tocam o oceano (endorreicos) e bloqueiam barcos.
 * - Terra so cruza agua nos vadosts de rio (isRiver && isShallow).
 */

export type IslandProfile = 'floresta' | 'arida' | 'glacial' | 'montanhosa' | 'ruintas';

export const ISLAND_PROFILE_LABELS: Record<IslandProfile, string> = {
  floresta: 'Ilha Verde',
  arida: 'Ilha Árida',
  glacial: 'Ilha Glacial',
  montanhosa: 'Ilha Vulcânica',
  ruintas: 'Ilha das Ruínas',
};

export interface RidgeSpec {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  peakHeight: number;
}

export interface LakeSpec {
  x: number;
  z: number;
  radius: number;
}

export interface RiverSpec {
  /** Pontos amostrados ja com o meandro aplicado (polyline fiel no motor e no minimapa). */
  points: { x: number; z: number }[];
  width: number;
  /** Indice do ponto central do vado (passagem terrestre) e meia largura em indices. */
  fordIndex: number;
  fordHalfSpan: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type IslandKind = 'native' | 'neutral';

export interface IslandSpec {
  /** 0..3 -> ilha natal do jogador (player1..player4); 4 e 5 -> ilhas neutras. */
  index: number;
  /** Natal: nascedouro de um jogador. Neutra: exploração e disputa, sem nascedouro. */
  kind: IslandKind;
  profile: IslandProfile;
  name: string;
  center: { x: number; z: number };
  /** Mesmo ponto do centro: todo nascedouro comeca no plateu plano da ilha. */
  spawn: { x: number; z: number };
  baseRadius: number;
  harmonicPhases: { p1: number; p2: number; p3: number };
  ridges: RidgeSpec[];
  lakes: LakeSpec[];
  river?: RiverSpec;
}

export interface ArchipelagoLayout {
  mapSize: number;
  seed: number;
  /** Raio do plateu plano do nascedouro (pedestres e construcoes iniciais). */
  flatRadius: number;
  flatBlend: number;
  islands: IslandSpec[];
}

export interface ElevData {
  height: number;
  isWater: boolean;
  isRiver: boolean;
  isLake: boolean;
  isOcean: boolean;
  isShallow: boolean;
  isCliff: boolean;
  isBeach: boolean;
  island: IslandSpec | null;
}

export interface TerrainNoise {
  elev: (x: number, z: number) => number;
  detail: (x: number, z: number) => number;
  mountain: (x: number, z: number) => number;
}

/** Gerador pseudo-aleatorio reproduzivel (Lehmer LCG). */
export class SeededRandom {
  private seed: number;
  constructor(seed: number = 42) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }
  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
}

/** Ruido de gradiente tipo Perlin com multi-oitavas implicitas. */
export function createNoise2D(random: SeededRandom) {
  const perm: number[] = [];
  for (let i = 0; i < 256; i++) perm.push(i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random.next() * (i + 1));
    const temp = perm[i];
    perm[i] = perm[j];
    perm[j] = temp;
  }
  const p = new Array(512);
  for (let i = 0; i < 512; i++) {
    p[i] = perm[i & 255];
  }

  function fade(t: number) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  function lerp(t: number, a: number, b: number) {
    return a + t * (b - a);
  }
  function grad(hash: number, x: number, y: number) {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return (h & 1 ? -u : u) + (h & 2 ? -2.0 * v : 2.0 * v);
  }

  return function noise(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);

    const aa = p[p[X] + Y];
    const ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y];
    const bb = p[p[X + 1] + Y + 1];

    return lerp(
      v,
      lerp(u, grad(aa, xf, yf), grad(ba, xf - 1, yf)),
      lerp(u, grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1))
    );
  };
}

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Canto de nascedouros: mesma jaula quadrada do mapa original (16..44 em 60). */
const ISLAND_SLOTS = [
  { fx: 16 / 60, fz: 16 / 60, kind: 'native' as const, radiusFactor: 0.1333 }, // player1 (noroeste)
  { fx: 44 / 60, fz: 44 / 60, kind: 'native' as const, radiusFactor: 0.1333 }, // player2 (sudeste)
  { fx: 16 / 60, fz: 44 / 60, kind: 'native' as const, radiusFactor: 0.1333 }, // player3 (sudoeste)
  { fx: 44 / 60, fz: 16 / 60, kind: 'native' as const, radiusFactor: 0.1333 }, // player4 (nordeste)
  { fx: 0.5, fz: 0.1, kind: 'neutral' as const, radiusFactor: 0.075 }, // neutra do norte
  { fx: 0.5, fz: 0.9, kind: 'neutral' as const, radiusFactor: 0.075 }, // neutra do sul
];

/** Pool: floresta e sempre incluida (garante lago + rio na partida). */
const PROFILE_POOL: IslandProfile[] = ['arida', 'glacial', 'montanhosa', 'ruintas'];

function shuffle<T>(items: T[], rng: SeededRandom): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/** Raio da costa litoranea da ilha (entradas e baies organicas). */
export function coastRadiusAt(island: IslandSpec, angle: number): number {
  const a1 = Math.sin(angle * 3 + island.harmonicPhases.p1) * (island.baseRadius * 0.2);
  const a2 = Math.cos(angle * 5 + island.harmonicPhases.p2) * (island.baseRadius * 0.1);
  const a3 = Math.sin(angle * 7 + island.harmonicPhases.p3) * (island.baseRadius * 0.05);
  return island.baseRadius + a1 + a2 + a3;
}

function sampleCoast(island: IslandSpec, steps = 36): { angle: number; radius: number }[] {
  const out: { angle: number; radius: number }[] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    out.push({ angle, radius: coastRadiusAt(island, angle) });
  }
  return out;
}

function buildRiver(
  island: IslandSpec,
  mapSize: number,
  angleLake?: number
): { river: RiverSpec; pool: LakeSpec } | undefined {
  const flatR = mapSize * 0.0433;
  const widths = [mapSize * 0.0267, mapSize * 0.02]; // 1.6 e 1.2 em 60
  const margin = mapSize * 0.0167; // 1.0 em 60
  const poolRadius = mapSize * 0.0133; // 0.8 em 60
  const sampleCount = 25;

  const angDiff = (a: number, b: number): number => {
    const twoPi = Math.PI * 2;
    const d = Math.abs(a - b) % twoPi;
    return d > Math.PI ? twoPi - d : d;
  };

  const byRadius = sampleCoast(island, 36).sort((a, b) => b.radius - a.radius);

  // Rio radial: nasce perto da costa e desemboca numa poca terminal (lagoa)
  // endorreica — nunca toca o oceano e nunca cruza o plateu do nascedouro.
  for (const pass of [0, 1]) {
    for (const width of widths) {
      for (const cand of byRadius) {
        if (pass === 0 && angleLake !== undefined && angDiff(cand.angle, angleLake) < 0.6) continue;
        const rOut = cand.radius - width - margin;
        const rIn = flatR + width + mapSize * 0.01;
        if (rOut - rIn < 0.8) continue;

        const points: { x: number; z: number }[] = [];
        const phase = cand.angle * 2;
        let ok = true;
        for (let i = 0; i < sampleCount; i++) {
          const t = i / (sampleCount - 1);
          const r = rOut + (rIn - rOut) * t;
          const theta = cand.angle + Math.sin(t * Math.PI * 1.7 + phase) * 0.09;
          const px = island.center.x + Math.cos(theta) * r;
          const pz = island.center.z + Math.sin(theta) * r;
          const need = coastRadiusAt(island, Math.atan2(pz - island.center.z, px - island.center.x));
          if (r > need - width * 0.7) {
            ok = false;
            break;
          }
          points.push({ x: px, z: pz });
        }
        if (!ok) continue;

        const xs = points.map((pt) => pt.x);
        const zs = points.map((pt) => pt.z);
        const river: RiverSpec = {
          points,
          width,
          fordIndex: 12,
          fordHalfSpan: 1,
          minX: Math.min(...xs) - width,
          maxX: Math.max(...xs) + width,
          minZ: Math.min(...zs) - width,
          maxZ: Math.max(...zs) + width,
        };
        const pool: LakeSpec = {
          x: island.center.x + Math.cos(cand.angle) * rIn,
          z: island.center.z + Math.sin(cand.angle) * rIn,
          radius: poolRadius,
        };
        return { river, pool };
      }
    }
  }
  return undefined;
}

function placeLakeAndRidge(
  island: IslandSpec,
  rng: SeededRandom,
  mapSize: number
): void {
  const flatR = mapSize * 0.0433;
  const profile = island.profile;
  const wantsLake = profile === 'floresta' || profile === 'glacial';
  const wantsVolcano = profile === 'montanhosa';

  // Direcao com mais costa (espaco interno para lago/vulcao).
  const coastSamples = sampleCoast(island);
  let best = coastSamples[0];
  for (const s of coastSamples) {
    if (s.radius > best.radius) best = s;
  }

  let lakeR = 0;
  let lakeCenterDist = 0;
  let angleLake = 0;
  if (wantsLake) {
    // A margem de transicao (blend) molha ~0.8 alem do disco: compensamos para
    // a zona umida nunca alcançar o plateu do nascedouro.
    lakeR = island.baseRadius * 0.19;
    lakeCenterDist = flatR + 1.8 + lakeR;
    angleLake = best.angle;
    let need = lakeCenterDist + lakeR + mapSize * 0.02;
    // Encolhe o lago se a costa da direcao escolhida for curta.
    while (lakeR > island.baseRadius * 0.1 && best.radius < need) {
      lakeR *= 0.85;
      lakeCenterDist = flatR + 1.8 + lakeR;
      need = lakeCenterDist + lakeR + mapSize * 0.02;
    }
    if (best.radius >= need) {
      island.lakes.push({
        x: island.center.x + Math.cos(angleLake) * lakeCenterDist,
        z: island.center.z + Math.sin(angleLake) * lakeCenterDist,
        radius: lakeR,
      });
    } else {
      lakeR = 0;
    }
  }

  if (wantsVolcano) {
    const ringRadius = island.baseRadius * 0.225;
    const bumpRadius = island.baseRadius * 0.14;
    const ringCenterDist = flatR + 0.8 + ringRadius + bumpRadius;
    const outer = ringCenterDist + ringRadius + bumpRadius;
    if (best.radius >= outer + mapSize * 0.017) {
      const vcx = island.center.x + Math.cos(best.angle) * ringCenterDist;
      const vcz = island.center.z + Math.sin(best.angle) * ringCenterDist;
      const bumpCount = 8;
      for (let i = 0; i < bumpCount; i++) {
        const a = (i / bumpCount) * Math.PI * 2;
        island.ridges.push({
          x: vcx + Math.cos(a) * ringRadius,
          z: vcz + Math.sin(a) * ringRadius,
          radiusX: bumpRadius,
          radiusZ: bumpRadius,
          peakHeight: 3.2,
        });
      }
      island.lakes.push({ x: vcx, z: vcz, radius: ringRadius * 0.55 });
    } else {
      // Sem espaco para o vulcao: cristas lineares (ainda com clifs).
      const ridgeCount = 2;
      for (let i = 0; i < ridgeCount; i++) {
        const a = best.angle + Math.PI * (0.35 + i * 0.45) + (rng.next() - 0.5) * 0.4;
        const coast = coastRadiusAt(island, a);
        const d = coast * 0.62;
        island.ridges.push({
          x: island.center.x + Math.cos(a) * d,
          z: island.center.z + Math.sin(a) * d,
          radiusX: island.baseRadius * 0.34,
          radiusZ: island.baseRadius * 0.2,
          peakHeight: 3.2 - i * 0.3,
        });
      }
    }
  }

  // Crestas simples por perfil (fora do vulcao).
  const simpleRidges: Partial<Record<IslandProfile, { count: number; peak: number }>> = {
    floresta: { count: 1, peak: 1.4 },
    arida: { count: 1, peak: 2.8 },
    glacial: { count: 2, peak: 3.2 },
    ruintas: { count: 1, peak: 2.6 },
  };
  const cfg = simpleRidges[profile];
  if (cfg) {
    const baseAngle = rng.next() * Math.PI * 2;
    for (let i = 0; i < cfg.count; i++) {
      const a = baseAngle + (i * Math.PI * 2) / (cfg.count + 1) + (rng.next() - 0.5) * 0.5;
      const coast = coastRadiusAt(island, a);
      const d = coast * 0.62;
      if (d - island.baseRadius * 0.2 < flatR + 0.4) continue;
      island.ridges.push({
        x: island.center.x + Math.cos(a) * d,
        z: island.center.z + Math.sin(a) * d,
        radiusX: island.baseRadius * 0.34,
        radiusZ: island.baseRadius * 0.2,
        peakHeight: cfg.peak + (rng.next() - 0.5) * 0.3,
      });
    }
  }

  // Rio endorreico com poça terminal; nunca toca a costa nem o oceano.
  if ((profile === 'floresta' || profile === 'glacial') && island.lakes.length > 0) {
    const lake = island.lakes[0];
    const angleOfLake = Math.atan2(lake.z - island.center.z, lake.x - island.center.x);
    const built = buildRiver(island, mapSize, angleOfLake);
    if (built) {
      island.river = built.river;
      island.lakes.push(built.pool);
    }
  }
}

/** Constroi o layout deterministico das ilhas para uma semente. */
export function computeArchipelago(mapSize: number, seed: number): ArchipelagoLayout {
  const rng = new SeededRandom(seed + 7);
  const flatRadius = mapSize * 0.0433;
  const flatBlend = 1.5;

  // floresta sempre presente + 3 sorteadas do pool (4 perfis distintos por partida).
  const chosen = shuffle(PROFILE_POOL, rng).slice(0, 3);
  chosen.splice(Math.floor(rng.next() * 4), 0, 'floresta');
  // As ilhas neutras sorteiam seu perfil do pool completo (podem repetir um perfil natal).
  const neutralProfiles = [0, 1].map(() => PROFILE_POOL[Math.floor(rng.next() * PROFILE_POOL.length)]);

  const islands: IslandSpec[] = ISLAND_SLOTS.map((slot, index) => {
    const profile = slot.kind === 'native' ? chosen[index] : neutralProfiles[index - 4];
    const baseRadius = mapSize * slot.radiusFactor * (0.95 + rng.next() * 0.12);
    const center = { x: mapSize * slot.fx, z: mapSize * slot.fz };
    const island: IslandSpec = {
      index,
      kind: slot.kind,
      profile,
      name: ISLAND_PROFILE_LABELS[profile],
      center,
      spawn: { ...center },
      baseRadius,
      harmonicPhases: {
        p1: rng.next() * Math.PI * 2,
        p2: rng.next() * Math.PI * 2,
        p3: rng.next() * Math.PI * 2,
      },
      ridges: [],
      lakes: [],
    };
    placeLakeAndRidge(island, rng, mapSize);
    return island;
  });

  return { mapSize, seed, flatRadius, flatBlend, islands };
}

function ridgeBoost(
  island: IslandSpec,
  noise: TerrainNoise,
  wx: number,
  wz: number
): { boost: number; isPeak: boolean } {
  let boost = 0;
  let isPeak = false;
  for (const ridge of island.ridges) {
    const nx = (wx - ridge.x) / ridge.radiusX;
    const nz = (wz - ridge.z) / ridge.radiusZ;
    const rDist = Math.hypot(nx, nz);
    if (rDist < 1.0) {
      const falloff = 1 - rDist;
      const smooth = falloff * falloff * (3 - 2 * falloff);
      const rough = noise.mountain(wx * 0.15, wz * 0.15) * 0.8;
      const h = ridge.peakHeight * smooth + rough * smooth;
      if (h > boost) {
        boost = h;
        if (h > 1.8) isPeak = true;
      }
    }
  }
  return { boost, isPeak };
}

function riverDistance(island: IslandSpec, wx: number, wz: number): { dist: number; ford: boolean } {
  const river = island.river;
  if (!river) return { dist: Infinity, ford: false };
  if (wx < river.minX || wx > river.maxX || wz < river.minZ || wz > river.maxZ) {
    return { dist: Infinity, ford: false };
  }
  let bestDist = Infinity;
  let bestIndex = -1;
  for (let i = 0; i < river.points.length; i++) {
    const p = river.points[i];
    const d = Math.hypot(wx - p.x, wz - p.z);
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }
  const ford =
    Math.abs(bestIndex - river.fordIndex) <= river.fordHalfSpan;
  return { dist: bestDist, ford };
}

/**
 * Elevacao unificada: mesma funcao usada para vertices do mesh, queries em
 * tempo real (colisao/caminhagem) e validacoes de geracao.
 */
export function computeElevation(layout: ArchipelagoLayout, noise: TerrainNoise, wx: number, wz: number): ElevData {
  // 1. Ilha dona do ponto (ou oceano aberto entre elas).
  let owner: IslandSpec | null = null;
  let bestGap = Infinity;
  for (const island of layout.islands) {
    const dx = wx - island.center.x;
    const dz = wz - island.center.z;
    const dist = Math.hypot(dx, dz);
    const gap = dist - coastRadiusAt(island, Math.atan2(dz, dx));
    if (gap < bestGap) {
      bestGap = gap;
      if (gap <= 0) owner = island;
    }
  }

  // 2. Oceano continuo entre as ilhas (navegavel, nunca entra em lago/rio).
  if (!owner) {
    const depth = bestGap;
    return {
      height: -0.15 - Math.min(3.0, depth * 0.55),
      isWater: true,
      isRiver: false,
      isLake: false,
      isOcean: true,
      isShallow: depth < 1.0,
      isCliff: false,
      isBeach: false,
      island: null,
    };
  }

  const island = owner;
  const distFromCoast = -bestGap;
  const spawnDist = Math.hypot(wx - island.spawn.x, wz - island.spawn.z);
  const onPlateau = spawnDist < layout.flatRadius;

  let height: number;
  let isRiverWater = false;
  let isLakeWater = false;
  let isPeak = false;

  if (onPlateau) {
    // Plateu perfeitamente plano do nascedouro (nunca afunda construcao).
    height = 0.32;
  } else {
    // Prainha costeira + colinas rolando.
    if (distFromCoast < 3.5) {
      height = lerp(0.04, 0.32, distFromCoast / 3.5);
    } else {
      const n1 = noise.elev(wx * 0.04, wz * 0.04) * 0.6;
      const n2 = noise.detail(wx * 0.1, wz * 0.1) * 0.25;
      height = 0.32 + Math.max(-0.1, n1 + n2);
    }

    // Transicao suave a partir da borda do plateu.
    if (spawnDist < layout.flatRadius + layout.flatBlend) {
      const t = smoothstep((spawnDist - layout.flatRadius) / layout.flatBlend);
      height = lerp(0.32, height, t);
    }

    // Cristas e cratera.
    const ridge = ridgeBoost(island, noise, wx, wz);
    height += ridge.boost;
    if (ridge.isPeak) isPeak = true;

    // Rio endorreico com vado terrestre.
    const rd = riverDistance(island, wx, wz);
    if (rd.dist < Infinity) {
      const width = island.river!.width;
      if (rd.dist < width) {
        const riverT = rd.dist / width;
        const riverDepth = rd.ford ? -0.06 : -0.65;
        height = lerp(riverDepth, Math.max(0.12, height), Math.pow(riverT, 0.75));
        if (height < 0.02) {
          isRiverWater = true;
        }
      } else if (rd.dist < width + mapSafe(layout, 1.2)) {
        const bankT = (rd.dist - width) / mapSafe(layout, 1.2);
        height = lerp(0.12, Math.max(0.2, height), bankT);
      }
    }
  }

  // 3. Lagos (e lagoa de cratera): bloqueiam barcos e nao tocam o oceano.
  for (const lake of island.lakes) {
    const dl = Math.hypot(wx - lake.x, wz - lake.z) - lake.radius;
    if (dl < 1.5) {
      if (dl <= 0) {
        height = -0.35;
        isLakeWater = true;
      } else {
        height = lerp(-0.35, Math.min(height, 0.12), smoothstep(dl / 1.5));
      }
    }
  }

  // 4. Suaviza a borda da costa mesmo quando o plateu foi truncado por uma baia.
  if (!isRiverWater && !isLakeWater && distFromCoast < 1.5) {
    height = lerp(0.06, height, smoothstep(distFromCoast / 1.5));
  }

  const isWater = isRiverWater || isLakeWater;
  const ford = isRiverWater && rd_ford(island, wx, wz);
  const isCliff =
    !isWater && ((isPeak && height > 1.6) || height > 2.2);

  return {
    height,
    isWater,
    isRiver: isRiverWater,
    isLake: isLakeWater,
    isOcean: false,
    isShallow: ford,
    isCliff,
    isBeach: !isWater && distFromCoast < 2.2 && height < 0.35,
    island,
  };
}

function mapSafe(layout: ArchipelagoLayout, valueAt60: number): number {
  return (valueAt60 * layout.mapSize) / 60;
}

function rd_ford(island: IslandSpec, wx: number, wz: number): boolean {
  if (!island.river) return false;
  return riverDistance(island, wx, wz).ford;
}

/**
 * Regra unica de bloqueio terrestre: agua so e cruzavel nos vadosts de rio.
 * Terra nunca atravessa oceano ou lago (criterio #40).
 */
export function isLandBlocked(data: ElevData): boolean {
  return data.isCliff || (data.isWater && !(data.isRiver && data.isShallow));
}

/** BFS de celular 1x1 sobre terreno transitavel a partir de um ponto inicial. */
export function computeReachableSet(
  layout: ArchipelagoLayout,
  noise: TerrainNoise,
  startX: number,
  startZ: number
): Uint8Array {
  const size = layout.mapSize;
  const visited = new Uint8Array(size * size);
  const sx = Math.floor(startX);
  const sz = Math.floor(startZ);
  if (sx < 0 || sz < 0 || sx >= size || sz >= size) return visited;

  const queue: number[] = [sz * size + sx];
  visited[sz * size + sx] = 1;
  while (queue.length > 0) {
    const idx = queue.pop()!;
    const x = idx % size;
    const z = (idx / size) | 0;
    const neighbors = [
      [x + 1, z],
      [x - 1, z],
      [x, z + 1],
      [x, z - 1],
    ];
    for (const [nx, nz] of neighbors) {
      if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
      const nIdx = nz * size + nx;
      if (visited[nIdx]) continue;
      const data = computeElevation(layout, noise, nx + 0.5, nz + 0.5);
      if (isLandBlocked(data)) continue;
      visited[nIdx] = 1;
      queue.push(nIdx);
    }
  }
  return visited;
}

/** Plano economico por perfil: cada ilha oferece uma mistura distinta de recursos. */
export interface IslandResourcePlan {
  treeClusters: number;
  treesPerCluster: number;
  gold: number;
  stone: number;
  bush: number;
  fish: number;
}

export function resourcePlanFor(profile: IslandProfile): IslandResourcePlan {
  switch (profile) {
    case 'floresta':
      return { treeClusters: 3, treesPerCluster: 8, gold: 1, stone: 1, bush: 2, fish: 1 };
    case 'arida':
      return { treeClusters: 1, treesPerCluster: 4, gold: 2, stone: 1, bush: 1, fish: 1 };
    case 'glacial':
      return { treeClusters: 1, treesPerCluster: 4, gold: 1, stone: 2, bush: 1, fish: 1 };
    case 'montanhosa':
      return { treeClusters: 1, treesPerCluster: 4, gold: 2, stone: 2, bush: 1, fish: 1 };
    case 'ruintas':
      return { treeClusters: 2, treesPerCluster: 4, gold: 2, stone: 1, bush: 1, fish: 1 };
  }
}

