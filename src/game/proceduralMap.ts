/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { ResourceNode } from './engine';

export interface MapCell {
  x: number;
  z: number;
  height: number;
  isWater: boolean;
  isRiver: boolean;
  isOcean: boolean;
  isShallow: boolean; // walkable river ford or beach shallows
  isCliff: boolean; // impassable Skyrim-like mountain crags
  isImpassable: boolean; // cannot be walked or built upon
  biome: 'valley' | 'hill' | 'plains' | 'mountain_peak' | 'beach' | 'ocean' | 'river';
}

export interface ProceduralMapResult {
  seed: number;
  gridResolution: number;
  mapSize: number;
  islandRadius: number;
  islandCenter: { x: number; z: number };
  terrainMesh: THREE.Mesh;
  waterMesh: THREE.Mesh;
  riverBankDecorations: THREE.Group;
  resourceNodes: ResourceNode[];
  player1Spawn: { x: number; z: number };
  player2Spawn: { x: number; z: number };
  player3Spawn: { x: number; z: number };
  player4Spawn: { x: number; z: number };
  getCellAt: (x: number, z: number) => MapCell;
  getHeightAt: (x: number, z: number) => number;
  isWaterAt: (x: number, z: number) => boolean;
  isOceanAt: (x: number, z: number) => boolean;
  isCliffAt: (x: number, z: number) => boolean;
  isImpassableAt: (x: number, z: number) => boolean;
}

// Pseudo-random noise generator based on seed
class SeededRandom {
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

// Multi-octave 2D Perlin-like gradient noise
function createNoise2D(random: SeededRandom) {
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

/**
 * Procedural Island Map Generator (Ikariam-style Island + Skyrim-style Mountain Crags + Level Village Plains)
 */
export function generateProceduralTerrain(mapSize: number = 60, seed?: number): ProceduralMapResult {
  const actualSeed = seed ?? Math.floor(Math.random() * 100000);
  const rng = new SeededRandom(actualSeed);
  const elevNoise = createNoise2D(rng);
  const detailNoise = createNoise2D(new SeededRandom(actualSeed + 9999));
  const mountainNoise = createNoise2D(new SeededRandom(actualSeed + 55555));

  const cx = mapSize / 2;
  const cz = mapSize / 2;
  const islandBaseRadius = mapSize * 0.40; // ~24m radius inside 60m map

  // Starting village spawn plateaus (Level plains where buildings never sink)
  const p1Spawn = { x: 18, z: 20 };
  const p2Spawn = { x: 42, z: 40 };
  const p3Spawn = { x: 18, z: 40 };
  const p4Spawn = { x: 42, z: 20 };
  const villageFlatRadius = 12.0; // expansive, perfectly flat building plains for colonies
  const allSpawns = [p1Spawn, p2Spawn, p3Spawn, p4Spawn];
  const distToAnySpawn = (x: number, z: number): number =>
    Math.min(...allSpawns.map((spawn) => Math.hypot(x - spawn.x, z - spawn.z)));

  // Meandering River: flows across island from upper center to lower right
  const riverCurve = (z: number): number => {
    const t = z / mapSize;
    return (
      mapSize * 0.50 +
      Math.sin(t * Math.PI * 2.1 + 0.3) * 6.5 +
      Math.cos(t * Math.PI * 4.0) * 2.2
    );
  };
  const riverWidth = 3.6;
  const shallowFordZ1 = mapSize * 0.35;
  const shallowFordZ2 = mapSize * 0.65;
  const fordWidth = 3.4;

  // Mountain Crag Centers (Skyrim-style impassable rocky peaks)
  const mountainRidges = [
    { x: 30, z: 9, radiusX: 10.0, radiusZ: 5.2, peakHeight: 4.8 }, // Northern High Peaks (Bleak Falls Massif)
    { x: 30, z: 51, radiusX: 9.5, radiusZ: 4.8, peakHeight: 4.4 }, // Southern Dragon Spine Ridge
    { x: 50, z: 23, radiusX: 5.8, radiusZ: 5.8, peakHeight: 3.8 }, // Eastern Jagged Crag
    { x: 10, z: 41, radiusX: 5.2, radiusZ: 5.2, peakHeight: 3.6 }, // Western Sea Bluffs
  ];

  // Island Boundary evaluation with organic coastal inlets & bays
  const getIslandCoastRadius = (angle: number): number => {
    const a1 = Math.sin(angle * 3 + 0.4) * 2.5;
    const a2 = Math.cos(angle * 5 + 1.2) * 1.5;
    const a3 = Math.sin(angle * 7) * 0.8;
    return islandBaseRadius + a1 + a2 + a3;
  };

  /**
   * Unified, mathematically rigorous elevation calculator.
   * Guaranteed to match between vertex generation and runtime query.
   */
  const calculateElevationData = (
    wx: number,
    wz: number
  ): {
    height: number;
    isWater: boolean;
    isRiver: boolean;
    isOcean: boolean;
    isShallow: boolean;
    isCliff: boolean;
    isBeach: boolean;
  } => {
    const dx = wx - cx;
    const dz = wz - cz;
    const distToCenter = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);
    const coastRadius = getIslandCoastRadius(angle);

    // 1. OPEN OCEAN CHECK (Surrounding Ikariam-style Island)
    if (distToCenter > coastRadius) {
      const oceanDepthDist = distToCenter - coastRadius;
      const oceanHeight = -0.15 - Math.min(3.0, oceanDepthDist * 0.55);
      return {
        height: oceanHeight,
        isWater: true,
        isRiver: false,
        isOcean: true,
        isShallow: oceanDepthDist < 1.0,
        isCliff: false,
        isBeach: oceanDepthDist < 0.8,
      };
    }

    // 2. BEACH COASTLINE (Between island edge and inland)
    const distFromCoast = coastRadius - distToCenter;
    const isBeach = distFromCoast < 2.2;

    // 3. STARTING VILLAGE PLATFORM (Flat fertile plateau, zero sinking!)
    const spawnDist = distToAnySpawn(wx, wz);

    if (spawnDist < villageFlatRadius) {
      // 100% perfectly flat ground for starting base
      return {
        height: 0.32,
        isWater: false,
        isRiver: false,
        isOcean: false,
        isShallow: false,
        isCliff: false,
        isBeach: false,
      };
    }

    // 4. SKYRIM-STYLE ROCKY PEAKS & MOUNTAIN RIDGES
    let mountainBoost = 0;
    let isMountainPeak = false;

    mountainRidges.forEach((ridge) => {
      const nx = (wx - ridge.x) / ridge.radiusX;
      const nz = (wz - ridge.z) / ridge.radiusZ;
      const rDist = Math.hypot(nx, nz);
      if (rDist < 1.0) {
        const falloff = 1 - rDist;
        const smoothFalloff = falloff * falloff * (3 - 2 * falloff);
        const mRough = mountainNoise(wx * 0.15, wz * 0.15) * 0.8;
        const h = ridge.peakHeight * smoothFalloff + mRough * smoothFalloff;
        if (h > mountainBoost) {
          mountainBoost = h;
          if (h > 1.8) isMountainPeak = true;
        }
      }
    });

    // 5. RIVER CARVING
    const rx = riverCurve(wz);
    const distToRiver = Math.abs(wx - rx);
    const isNearFord =
      distToRiver < riverWidth &&
      (Math.abs(wz - shallowFordZ1) < fordWidth || Math.abs(wz - shallowFordZ2) < fordWidth);

    let baseH = 0.32;

    if (distFromCoast < 3.5) {
      // Smooth beach slope up from sea level (0.02) to inland (0.32)
      const beachT = distFromCoast / 3.5;
      baseH = THREE.MathUtils.lerp(0.04, 0.32, beachT);
    } else {
      // Rolling plains & gentle hills
      const n1 = elevNoise(wx * 0.04, wz * 0.04) * 0.6;
      const n2 = detailNoise(wx * 0.1, wz * 0.1) * 0.25;
      baseH = 0.32 + Math.max(-0.1, n1 + n2);
    }

    // Blend starting village buffer smoothly
    if (spawnDist < villageFlatRadius + 3.0) {
      const t = (spawnDist - villageFlatRadius) / 3.0;
      baseH = THREE.MathUtils.lerp(0.32, baseH, t * t * (3 - 2 * t));
    }

    // Add mountain elevation if present
    baseH += mountainBoost;

    // Carve river channel
    let isWater = false;
    let isRiver = false;
    let isShallow = false;

    if (distToRiver < riverWidth) {
      const riverT = distToRiver / riverWidth;
      const riverDepth = isNearFord ? -0.06 : -0.65;
      baseH = THREE.MathUtils.lerp(riverDepth, Math.max(0.12, baseH), Math.pow(riverT, 0.75));
      if (baseH < 0.02) {
        isWater = true;
        isRiver = true;
        isShallow = isNearFord;
      }
    } else if (distToRiver < riverWidth + 2.0) {
      // River banks
      const bankT = (distToRiver - riverWidth) / 2.0;
      baseH = THREE.MathUtils.lerp(0.12, Math.max(0.2, baseH), bankT);
    }

    // Mark impassable cliffs (Skyrim-style steep rocky ridges where units cannot go)
    const isCliff = (isMountainPeak && baseH > 1.6) || baseH > 2.2;

    return {
      height: baseH,
      isWater,
      isRiver,
      isOcean: false,
      isShallow,
      isCliff,
      isBeach: isBeach && baseH < 0.35,
    };
  };

  // High-resolution mesh for smooth, beautiful island topography
  const resolution = 96;
  const geo = new THREE.PlaneGeometry(mapSize, mapSize, resolution, resolution);
  geo.rotateX(-Math.PI / 2);
  // Shift plane so (0, 0) is the bottom-left corner and (mapSize, mapSize) is the top-right
  geo.translate(mapSize / 2, 0, mapSize / 2);

  const posAttr = geo.attributes.position;
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);

  // Ikariam & Skyrim Palette
  const colOceanFloor = new THREE.Color(0x0e2f44);
  const colBeachSand = new THREE.Color(0xd4b483);
  const colPlainsLush = new THREE.Color(0x4a7c2c);
  const colPlainsDry = new THREE.Color(0x608e3a);
  const colValley = new THREE.Color(0x386623);
  const colRiverBed = new THREE.Color(0x2a3820);
  const colMountainRock = new THREE.Color(0x475569);
  const colMountainPeak = new THREE.Color(0x94a3b8);
  const colSnowRidge = new THREE.Color(0xe2e8f0);

  for (let i = 0; i < count; i++) {
    const wx = posAttr.getX(i);
    const wz = posAttr.getZ(i);

    const data = calculateElevationData(wx, wz);
    posAttr.setY(i, data.height);

    // Vertex color assignment
    let col = colPlainsLush;
    if (data.isOcean) {
      col = colOceanFloor;
    } else if (data.isRiver) {
      col = colRiverBed;
    } else if (data.isBeach) {
      col = colBeachSand;
    } else if (data.height > 3.4) {
      col = colSnowRidge;
    } else if (data.height > 2.2) {
      col = colMountainPeak;
    } else if (data.height > 1.4) {
      col = colMountainRock;
    } else if (data.height < 0.28) {
      col = colValley;
    } else if (data.height > 0.6) {
      col = colPlainsDry;
    }

    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.05,
    flatShading: false,
  });

  const terrainMesh = new THREE.Mesh(geo, terrainMat);
  terrainMesh.name = 'procedural_island_terrain';
  terrainMesh.position.set(0, 0, 0); // Directly in world space
  terrainMesh.receiveShadow = true;

  // 2. EXPANSIVE WATER SURFACE (Sea & River)
  // Covers the whole map and sea with Ikariam-style azure water
  const waterGeo = new THREE.PlaneGeometry(mapSize * 1.5, mapSize * 1.5, 48, 48);
  waterGeo.rotateX(-Math.PI / 2);
  waterGeo.translate(mapSize / 2, 0, mapSize / 2);

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7, // Vibrant Mediterranean sea blue
    transparent: true,
    opacity: 0.72,
    roughness: 0.15,
    metalness: 0.35,
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.name = 'ocean_water';
  waterMesh.position.set(0, 0.0, 0);

  // 3. NATURAL DECORATIONS (Rocks on beaches, mountain boulders, river reeds)
  const riverBankDecorations = new THREE.Group();
  riverBankDecorations.name = 'island_nature_decorations';

  const reedGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.8, 4);
  const reedMat = new THREE.MeshStandardMaterial({ color: 0x65a30d, roughness: 0.8 });
  const boulderGeo = new THREE.DodecahedronGeometry(0.55, 1);
  const boulderMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.95 });

  // Reeds along freshwater river
  for (let z = 16; z < mapSize - 16; z += 3.2) {
    const rx = riverCurve(z);
    const lx = rx - riverWidth * 0.95;
    const rH = calculateElevationData(lx, z).height;
    if (rH > -0.05 && rH < 0.25) {
      const rmesh = new THREE.Mesh(reedGeo, reedMat);
      rmesh.position.set(lx + (rng.next() * 0.6 - 0.3), rH + 0.4, z + (rng.next() * 0.6 - 0.3));
      riverBankDecorations.add(rmesh);
    }
  }

  // Mountain boulders near Skyrim ridges
  mountainRidges.forEach((ridge) => {
    for (let i = 0; i < 6; i++) {
      const bx = ridge.x + (rng.next() * ridge.radiusX * 1.6 - ridge.radiusX * 0.8);
      const bz = ridge.z + (rng.next() * ridge.radiusZ * 1.6 - ridge.radiusZ * 0.8);
      const bH = calculateElevationData(bx, bz).height;
      if (bH > 1.2) {
        const boulder = new THREE.Mesh(boulderGeo, boulderMat);
        boulder.position.set(bx, bH + 0.15, bz);
        boulder.scale.set(0.7 + rng.next() * 0.6, 0.7 + rng.next() * 0.6, 0.7 + rng.next() * 0.6);
        boulder.rotation.set(rng.next() * Math.PI, rng.next() * Math.PI, 0);
        boulder.castShadow = true;
        riverBankDecorations.add(boulder);
      }
    }
  });

  // 4. RESOURCE NODES PLACEMENT (Only on valid plains and valleys, never in deep ocean or cliff peaks!)
  const resourceNodes: ResourceNode[] = [];

  // A. Clustered Forests on fertile plains
  const forestSpots = [
    { x: 14, z: 14, name: 'Bosque da Colônia Ocidental' },
    { x: 26, z: 28, name: 'Bosque do Vale Central' },
    { x: 44, z: 48, name: 'Bosque da Baía Oriental' },
    { x: 18, z: 36, name: 'Bosque das Terras Férteis Sul' },
    { x: 38, z: 26, name: 'Bosque do Meandro Verde' },
  ];

  forestSpots.forEach((spot, idx) => {
    for (let i = 0; i < 8; i++) {
      const px = spot.x + (rng.next() * 7 - 3.5);
      const pz = spot.z + (rng.next() * 7 - 3.5);
      const ed = calculateElevationData(px, pz);
      // Valid if land, not in water, not a cliff, not right on town center
      const spawnDist = distToAnySpawn(px, pz);
      if (!ed.isWater && !ed.isCliff && spawnDist > 4.5 && ed.height >= 0.15) {
        resourceNodes.push({
          id: `tree-${idx}-${i}`,
          type: 'tree',
          name: spot.name,
          position: { x: px, z: pz },
          remaining: 160,
          maxCapacity: 160,
          harvestMode: 'clear_cut',
          isRegrowing: false,
          regrowthProgress: 0,
          clusterId: `forest-cluster-${idx}`,
          clusterName: spot.name,
        });
      }
    }
  });

  // B. Gold & Mineral Mines (Naturally situated at the foot of mountain ridges)
  const mineSpots = [
    { x: 25, z: 16, name: 'Mina do Pico Nórdico (Pedreira & Ouro)' },
    { x: 35, z: 44, name: 'Veio de Ouro da Cordilheira Sul' },
    { x: 44, z: 28, name: 'Mina de Ouro da Encosta Leste' },
  ];

  mineSpots.forEach((spot, idx) => {
    resourceNodes.push({
      id: `gold-mine-${idx}`,
      type: 'gold_mine',
      name: spot.name,
      position: { x: spot.x, z: spot.z },
      remaining: 900,
      maxCapacity: 900,
      clusterId: `mine-cluster-${idx}`,
      clusterName: spot.name,
    });
  });

  // B2. Stone Quarries (Rugged outcrops at the foot of the mountain ridges)
  const quarrySpots = [
    { x: 36, z: 14, name: 'Pedreira da Cornija Norte' },
    { x: 47, z: 33, name: 'Pedreira da Crag Oriental' },
    { x: 24, z: 46, name: 'Pedreira da Espinha Sul' },
    { x: 16, z: 37, name: 'Pedreira dos Penhascos Ocidentais' },
  ];

  quarrySpots.forEach((spot, idx) => {
    const ed = calculateElevationData(spot.x, spot.z);
    if (ed.isWater || ed.isCliff || ed.height < 0.15) return;
    if (distToAnySpawn(spot.x, spot.z) <= 4.5) return;
    resourceNodes.push({
      id: `stone-${idx}`,
      type: 'stone',
      name: spot.name,
      position: { x: spot.x, z: spot.z },
      remaining: 700,
      maxCapacity: 700,
      clusterId: `quarry-cluster-${idx}`,
      clusterName: spot.name,
    });
  });

  // C. Berry Bushes in fertile village plains
  const berrySpots = [
    { x: 22, z: 23, name: 'Pomar de Frutas Silvestres da Vila 1' },
    { x: 38, z: 37, name: 'Pomar de Frutas Silvestres da Vila 2' },
  ];

  berrySpots.forEach((spot, idx) => {
    resourceNodes.push({
      id: `food-bush-${idx}`,
      type: 'food_bush',
      name: spot.name,
      position: { x: spot.x, z: spot.z },
      remaining: 450,
      maxCapacity: 450,
      clusterId: `food-cluster-${idx}`,
      clusterName: spot.name,
    });
  });

  // D. Fish Schools in the River and Coastal Ocean Shallows!
  const fishSpots = [
    { z: 22, coast: false },
    { z: 32, coast: false },
    { z: 42, coast: false },
    { x: 8, z: 30, coast: true }, // Western ocean shallows
    { x: 52, z: 30, coast: true }, // Eastern ocean shallows
  ];

  fishSpots.forEach((spot, idx) => {
    let fx = spot.coast ? (spot.x ?? 0) : riverCurve(spot.z) + (rng.next() * 1.0 - 0.5);
    let fz = spot.z;
    resourceNodes.push({
      id: `fish-${idx}`,
      type: 'fish_school',
      name: spot.coast ? `Cardume Costeiro da Ilha #${idx + 1}` : `Cardume do Rio Meandro #${idx + 1}`,
      position: { x: fx, z: fz },
      remaining: 600,
      maxCapacity: 600,
      clusterId: `fish-cluster-${idx}`,
      clusterName: spot.coast ? `Cardume Costeiro #${idx + 1}` : `Cardume do Rio #${idx + 1}`,
    });
  });

  // Real-time Height and Collision Query methods
  const getHeightAt = (wx: number, wz: number): number => {
    return calculateElevationData(wx, wz).height;
  };

  const isWaterAt = (wx: number, wz: number): boolean => {
    return calculateElevationData(wx, wz).isWater;
  };

  const isOceanAt = (wx: number, wz: number): boolean => {
    return calculateElevationData(wx, wz).isOcean;
  };

  const isCliffAt = (wx: number, wz: number): boolean => {
    return calculateElevationData(wx, wz).isCliff;
  };

  const isImpassableAt = (wx: number, wz: number): boolean => {
    const data = calculateElevationData(wx, wz);
    // Impassable for land troops if cliff or deep ocean (shallows and fords are passable)
    return data.isCliff || (data.isWater && !data.isShallow);
  };

  const getCellAt = (wx: number, wz: number): MapCell => {
    const data = calculateElevationData(wx, wz);
    let biome: MapCell['biome'] = 'plains';
    if (data.isOcean) biome = 'ocean';
    else if (data.isRiver) biome = 'river';
    else if (data.isBeach) biome = 'beach';
    else if (data.isCliff) biome = 'mountain_peak';
    else if (data.height < 0.28) biome = 'valley';
    else if (data.height > 1.2) biome = 'hill';

    return {
      x: wx,
      z: wz,
      height: data.height,
      isWater: data.isWater,
      isRiver: data.isRiver,
      isOcean: data.isOcean,
      isShallow: data.isShallow,
      isCliff: data.isCliff,
      isImpassable: data.isCliff || (data.isWater && !data.isShallow),
      biome,
    };
  };

  return {
    seed: actualSeed,
    gridResolution: resolution,
    mapSize,
    islandRadius: islandBaseRadius,
    islandCenter: { x: cx, z: cz },
    terrainMesh,
    waterMesh,
    riverBankDecorations,
    resourceNodes,
    player1Spawn: p1Spawn,
    player2Spawn: p2Spawn,
    player3Spawn: p3Spawn,
    player4Spawn: p4Spawn,
    getCellAt,
    getHeightAt,
    isWaterAt,
    isOceanAt,
    isCliffAt,
    isImpassableAt,
  };
}
