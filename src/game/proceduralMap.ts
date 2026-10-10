/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { ResourceNode } from './engine';
import { evaluateCapitalSite } from './capitalSite';
import { checkBuildingPlacementValid } from './buildingGhost';
import { CAPITAL_MIN_SITES, findCapitalSites } from './foundation';
import { proveWorld, type WorldProof } from './worldProofs';
import {
  ArchipelagoLayout,
  ElevData,
  IslandProfile,
  SeededRandom,
  TerrainNoise,
  coastRadiusAt,
  computeArchipelago,
  computeElevation,
  computeReachableSet,
  createNoise2D,
  isLandBlocked,
  resourcePlanFor,
} from './archipelago';

export interface MapCell {
  x: number;
  z: number;
  height: number;
  isWater: boolean;
  isRiver: boolean;
  isLake: boolean;
  isOcean: boolean;
  isShallow: boolean; // walkable river ford or beach shallows
  isCliff: boolean; // impassable Skyrim-like mountain crags
  isImpassable: boolean; // cannot be walked or built upon
  biome: 'valley' | 'hill' | 'plains' | 'mountain_peak' | 'beach' | 'ocean' | 'river' | 'lake';
}

export interface ProceduralMapResult {
  seed: number;
  gridResolution: number;
  mapSize: number;
  islandRadius: number;
  islandCenter: { x: number; z: number };
  /** Layout puro do arquipelago (perfis, lagos, rios) — usado tambem pelo minimapa. */
  islands: ArchipelagoLayout['islands'];
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
  /** Provas por ilha natal (área, janela de capital, regiões, costas) feitas na geração. */
  proof: WorldProof;
  /** Sítios de capital distintos encontrados em cada nascedouro (player1 a player4). */
  capitalSites: number[];
  /** O mundo passou nas provas e todo nascedouro tem sítios suficientes. */
  viable: boolean;
  /** Sementes tentadas até achar um mundo viável (a semente usada está em `seed`). */
  seedAttempts: number;
}

/** Paleta por perfil geografico: deixa as ilhas legivelmente distintas no terreno. */
const PROFILE_PALETTES: Record<
  IslandProfile,
  { plain: number; dry: number; valley: number; rock: number; peak: number; snow: number }
> = {
  floresta: { plain: 0x4a7c2c, dry: 0x608e3a, valley: 0x386623, rock: 0x475569, peak: 0x94a3b8, snow: 0xe2e8f0 },
  arida: { plain: 0xb0a06a, dry: 0xc4b078, valley: 0x8f9a52, rock: 0x8a7a5f, peak: 0xa89a80, snow: 0xd8d0c0 },
  glacial: { plain: 0x9fb8c8, dry: 0x8fa8b8, valley: 0x7a95a8, rock: 0x6a8498, peak: 0xb8ccd8, snow: 0xf0f6fa },
  montanhosa: { plain: 0x6a7a4a, dry: 0x7a8a55, valley: 0x55663a, rock: 0x4a5560, peak: 0x8a95a5, snow: 0xdde4ec },
  ruintas: { plain: 0x7a6a8a, dry: 0x8a7a98, valley: 0x655a75, rock: 0x5a5068, peak: 0x9085a5, snow: 0xd8d2e4 },
};

/**
 * Gerador de arquipelago: multiplas ilhas com perfis distintos, oceano
 * continuo navegavel, rios/lagos endorreicos (bloqueiam barcos) e recursos
 * validados por alcance terrestre (criterios de aceite do card #40).
 */
export function generateProceduralTerrain(mapSize: number = 60, seed?: number): ProceduralMapResult {
  const start = seed ?? Math.floor(Math.random() * 100000);
  let last: ProceduralMapResult | null = null;
  for (let attempt = 0; attempt < MAX_SEED_ATTEMPTS; attempt += 1) {
    const candidate = buildProceduralTerrain(mapSize, start + attempt * SEED_STEP);
    assessViability(candidate);
    candidate.seedAttempts = attempt + 1;
    if (candidate.viable) return candidate;
    last = candidate;
  }
  return last!;
}

/** Quantas sementes seguidas o gerador tenta antes de aceitar o último mapa, mesmo inviável. */
export const MAX_SEED_ATTEMPTS = 12;
/** Passo entre sementes candidatas: primo, para não repetir layouts parecidos. */
const SEED_STEP = 7919;

/** Prova as ilhas natais e conta os sítios de capital de cada nascedouro; registra o veredito no mapa. */
function assessViability(map: ProceduralMapResult): void {
  const proof = proveWorld(map, { islands: map.islands });
  const terrain = {
    mapSize: map.mapSize, buildings: [], nodes: map.resourceNodes, isWaterAt: map.isWaterAt, isCliffAt: map.isCliffAt,
    getHeightAt: map.getHeightAt, isImpassableAt: map.isImpassableAt,
  };
  const capitalSites = [map.player1Spawn, map.player2Spawn, map.player3Spawn, map.player4Spawn].map((spawn) =>
    findCapitalSites(spawn, (x, z) => evaluateCapitalSite({ x, z }, terrain, { from: spawn }).valid, { maxRadius: 30, minSpacing: 4 }).length
  );
  // Regra herdada do #40: expansão imediata com pelo menos 25 células construíveis num raio de 6.
  const immediateExpansion = [map.player1Spawn, map.player2Spawn, map.player3Spawn, map.player4Spawn].map((spawn) => {
    let buildable = 0;
    for (let x = Math.floor(spawn.x - 6); x <= Math.ceil(spawn.x + 6); x += 1) {
      for (let z = Math.floor(spawn.z - 6); z <= Math.ceil(spawn.z + 6); z += 1) {
        const cx = x + 0.5;
        const cz = z + 0.5;
        if (Math.hypot(cx - spawn.x, cz - spawn.z) > 6) continue;
        const check = checkBuildingPlacementValid('house', cx, cz, [], map.resourceNodes, map.mapSize, map.isWaterAt, map.isCliffAt, map.getHeightAt);
        if (check.isValid) buildable += 1;
      }
    }
    return buildable;
  });
  map.proof = proof;
  map.capitalSites = capitalSites;
  map.viable = proof.viable && capitalSites.every((count) => count >= CAPITAL_MIN_SITES) && immediateExpansion.every((cells) => cells >= 25);
}

function buildProceduralTerrain(mapSize: number, actualSeed: number): ProceduralMapResult {
  const layout = computeArchipelago(mapSize, actualSeed);
  const noise: TerrainNoise = {
    elev: createNoise2D(new SeededRandom(actualSeed)),
    detail: createNoise2D(new SeededRandom(actualSeed + 9999)),
    mountain: createNoise2D(new SeededRandom(actualSeed + 55555)),
  };
  const rng = new SeededRandom(actualSeed + 4242);

  const calculateElevationData = (wx: number, wz: number): ElevData =>
    computeElevation(layout, noise, wx, wz);

  const p1Spawn = layout.islands[0].spawn;
  const p2Spawn = layout.islands[1].spawn;
  const p3Spawn = layout.islands[2].spawn;
  const p4Spawn = layout.islands[3].spawn;

  // High-resolution mesh for smooth, beautiful archipelago topography
  // A malha acompanha o tamanho do mundo (96 segmentos em 60; no máximo 320 por custo de geração).
  const resolution = Math.min(320, Math.max(96, Math.round(mapSize * 1.6)));
  const geo = new THREE.PlaneGeometry(mapSize, mapSize, resolution, resolution);
  geo.rotateX(-Math.PI / 2);
  geo.translate(mapSize / 2, 0, mapSize / 2);

  const posAttr = geo.attributes.position;
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);

  const colOceanFloor = new THREE.Color(0x0e2f44);
  const colBeachSand = new THREE.Color(0xd4b483);
  const colRiverBed = new THREE.Color(0x2a3820);
  const colLakeWater = new THREE.Color(0x1c3d5a);
  const profileColorCache = new Map<string, THREE.Color>();

  const profileColor = (key: string, hex: number): THREE.Color => {
    let color = profileColorCache.get(key);
    if (!color) {
      color = new THREE.Color(hex);
      profileColorCache.set(key, color);
    }
    return color;
  };

  for (let i = 0; i < count; i++) {
    const wx = posAttr.getX(i);
    const wz = posAttr.getZ(i);

    const data = calculateElevationData(wx, wz);
    posAttr.setY(i, data.height);

    let col: THREE.Color;
    if (data.isOcean) {
      col = colOceanFloor;
    } else if (data.isLake) {
      col = colLakeWater;
    } else if (data.isRiver) {
      col = colRiverBed;
    } else if (data.isBeach) {
      col = colBeachSand;
    } else {
      const profile = data.island ? data.island.profile : 'floresta';
      const pal = PROFILE_PALETTES[profile];
      if (data.height > 3.4) col = profileColor(profile + '.snow', pal.snow);
      else if (data.height > 2.2) col = profileColor(profile + '.peak', pal.peak);
      else if (data.height > 1.4) col = profileColor(profile + '.rock', pal.rock);
      else if (data.height < 0.28) col = profileColor(profile + '.valley', pal.valley);
      else if (data.height > 0.6) col = profileColor(profile + '.dry', pal.dry);
      else col = profileColor(profile + '.plain', pal.plain);
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
  terrainMesh.name = 'procedural_archipelago_terrain';
  terrainMesh.position.set(0, 0, 0);
  terrainMesh.receiveShadow = true;

  // Superficie de agua: oceano continuo entre as ilhas. Rios e lagos aparecem
  // atraves dos vales alagados do proprio terreno (nunca tocam o oceano).
  const waterGeo = new THREE.PlaneGeometry(mapSize * 1.5, mapSize * 1.5, 48, 48);
  waterGeo.rotateX(-Math.PI / 2);
  waterGeo.translate(mapSize / 2, 0, mapSize / 2);

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    transparent: true,
    opacity: 0.72,
    roughness: 0.15,
    metalness: 0.35,
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.name = 'ocean_water';
  waterMesh.position.set(0, 0.0, 0);

  // Decoracoes: juncos nos rios, rochedos nas cristas e ruinas nas ilhas de ruinas
  const riverBankDecorations = new THREE.Group();
  riverBankDecorations.name = 'archipelago_decorations';

  const reedGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.8, 4);
  const reedMat = new THREE.MeshStandardMaterial({ color: 0x65a30d, roughness: 0.8 });
  const boulderGeo = new THREE.DodecahedronGeometry(0.55, 1);
  const boulderMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.95 });
  const columnGeo = new THREE.CylinderGeometry(0.28, 0.34, 1.1, 6);
  const columnMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.9 });

  layout.islands.forEach((island) => {
    // Juncos nas margens dos rios endorreicos
    if (island.river) {
      const river = island.river;
      for (let i = 1; i < river.points.length - 1; i += 2) {
        const p = river.points[i];
        const prev = river.points[i - 1];
        const next = river.points[i + 1];
        const dirX = next.x - prev.x;
        const dirZ = next.z - prev.z;
        const len = Math.hypot(dirX, dirZ) || 1;
        const perpX = (-dirZ / len) * river.width * 1.1;
        const perpZ = (dirX / len) * river.width * 1.1;
        for (const sideSign of [1, -1]) {
          const rx = p.x + perpX * sideSign;
          const rz = p.z + perpZ * sideSign;
          const h = calculateElevationData(rx, rz).height;
          if (h > -0.05 && h < 0.25) {
            const reed = new THREE.Mesh(reedGeo, reedMat);
            reed.position.set(rx + (rng.next() * 0.6 - 0.3), h + 0.4, rz + (rng.next() * 0.6 - 0.3));
            riverBankDecorations.add(reed);
          }
        }
      }
    }

    // Rochedos nas cristas montanhosas
    island.ridges.forEach((ridge) => {
      for (let i = 0; i < 5; i++) {
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

    // Colunas quebradas nas ilhas de ruinas (tornam o perfil legivel no terreno)
    if (island.profile === 'ruintas') {
      for (let i = 0; i < 6; i++) {
        const angle = rng.next() * Math.PI * 2;
        const maxR = coastRadiusAt(island, angle) - 1.5;
        const r = 4.5 + rng.next() * Math.max(0.5, maxR - 4.5);
        const cx = island.center.x + Math.cos(angle) * r;
        const cz = island.center.z + Math.sin(angle) * r;
        const data = calculateElevationData(cx, cz);
        if (data.isWater || data.isCliff || data.height < 0.15) continue;
        const column = new THREE.Mesh(columnGeo, columnMat);
        column.position.set(cx, data.height + 0.5, cz);
        column.rotation.z = (rng.next() - 0.5) * 0.25;
        column.rotation.x = (rng.next() - 0.5) * 0.25;
        column.castShadow = true;
        riverBankDecorations.add(column);
      }
    }
  });

  // RECURSOS: cada ilha segue o plano do seu perfil e so e validado se o
  // nascedouro alcancar o no por terra (criterio de recursos acessiveis).
  const resourceNodes: ResourceNode[] = [];
  const reachable = layout.islands.map((island) =>
    computeReachableSet(layout, noise, island.spawn.x, island.spawn.z)
  );

  const isUsableLand = (island: ArchipelagoLayout['islands'][number], x: number, z: number, clearance: number): boolean => {
    if (Math.hypot(x - island.spawn.x, z - island.spawn.z) < clearance) return false;
    const data = calculateElevationData(x, z);
    if (data.island !== island || data.isWater || data.isCliff || data.height < 0.15) return false;
    const gx = Math.floor(x);
    const gz = Math.floor(z);
    if (gx < 0 || gz < 0 || gx >= mapSize || gz >= mapSize) return false;
    return reachable[island.index][gz * mapSize + gx] === 1;
  };

  const findLandSpot = (island: ArchipelagoLayout['islands'][number], clearance: number, tries = 60): { x: number; z: number } | null => {
    for (let i = 0; i < tries; i++) {
      const angle = rng.next() * Math.PI * 2;
      const coast = coastRadiusAt(island, angle);
      const maxR = coast - 1.1;
      if (maxR <= clearance) continue;
      const r = clearance + rng.next() * (maxR - clearance);
      const x = island.center.x + Math.cos(angle) * r;
      const z = island.center.z + Math.sin(angle) * r;
      if (isUsableLand(island, x, z, clearance)) return { x, z };
    }
    return null;
  };

  layout.islands.forEach((island) => {
    const plan = resourcePlanFor(island.profile);
    const label = island.name;

    // A. Bosques agrupados
    for (let c = 0; c < plan.treeClusters; c++) {
      const centerSpot = findLandSpot(island, 4.6);
      if (!centerSpot) continue;
      const clusterId = `forest-cluster-${island.index}-${c}`;
      const clusterName = `Bosque ${c + 1} da ${label}`;
      for (let i = 0; i < plan.treesPerCluster; i++) {
        let placed = false;
        for (let attempt = 0; attempt < 8 && !placed; attempt++) {
          const px = centerSpot.x + (rng.next() * 4.4 - 2.2);
          const pz = centerSpot.z + (rng.next() * 4.4 - 2.2);
          if (!isUsableLand(island, px, pz, 4.6)) continue;
          placed = true;
          resourceNodes.push({
            id: `tree-${island.index}-${c}-${i}`,
            type: 'tree',
            name: clusterName,
            position: { x: px, z: pz },
            remaining: 160,
            maxCapacity: 160,
            harvestMode: 'clear_cut',
            isRegrowing: false,
            regrowthProgress: 0,
            clusterId,
            clusterName,
          });
        }
      }
    }

    // B. Minas de ouro
    for (let i = 0; i < plan.gold; i++) {
      const spot = findLandSpot(island, 4.6);
      if (!spot) continue;
      resourceNodes.push({
        id: `gold-mine-${island.index}-${i}`,
        type: 'gold_mine',
        name: `Mina de Ouro ${i + 1} da ${label}`,
        position: spot,
        remaining: 900,
        maxCapacity: 900,
        clusterId: `mine-cluster-${island.index}`,
        clusterName: `Minas da ${label}`,
      });
    }

    // C. Pedreiras
    for (let i = 0; i < plan.stone; i++) {
      const spot = findLandSpot(island, 4.6);
      if (!spot) continue;
      resourceNodes.push({
        id: `stone-${island.index}-${i}`,
        type: 'stone',
        name: `Pedreira ${i + 1} da ${label}`,
        position: spot,
        remaining: 700,
        maxCapacity: 700,
        clusterId: `quarry-cluster-${island.index}`,
        clusterName: `Pedreiras da ${label}`,
      });
    }

    // D. Arbustos de comida
    for (let i = 0; i < plan.bush; i++) {
      const spot = findLandSpot(island, 4.6);
      if (!spot) continue;
      resourceNodes.push({
        id: `food-bush-${island.index}-${i}`,
        type: 'food_bush',
        name: `Pomar ${i + 1} da ${label}`,
        position: spot,
        remaining: 450,
        maxCapacity: 450,
        clusterId: `food-cluster-${island.index}`,
        clusterName: `Pomares da ${label}`,
      });
    }

    // E. Cardumes costeiros: sempre no oceano, navegaveis por barco
    for (let i = 0; i < plan.fish; i++) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const angle = rng.next() * Math.PI * 2;
        const coast = coastRadiusAt(island, angle);
        const fx = island.center.x + Math.cos(angle) * (coast + 1.4);
        const fz = island.center.z + Math.sin(angle) * (coast + 1.4);
        if (fx < 1 || fz < 1 || fx > mapSize - 1 || fz > mapSize - 1) continue;
        if (Math.hypot(fx - island.spawn.x, fz - island.spawn.z) < 4.6) continue;
        const data = calculateElevationData(fx, fz);
        if (!data.isOcean) continue;
        resourceNodes.push({
          id: `fish-${island.index}-${i}`,
          type: 'fish_school',
          name: `Cardume Costeiro ${i + 1} da ${label}`,
          position: { x: fx, z: fz },
          remaining: 600,
          maxCapacity: 600,
          clusterId: `fish-cluster-${island.index}`,
          clusterName: `Cardumes da ${label}`,
        });
        break;
      }
    }
  });

  // Real-time Height and Collision Query methods
  const getHeightAt = (wx: number, wz: number): number =>
    calculateElevationData(wx, wz).height;

  const isWaterAt = (wx: number, wz: number): boolean =>
    calculateElevationData(wx, wz).isWater;

  // Regra de barcos: apenas o oceano. Rio e lago bloqueiam embarcacoes.
  const isOceanAt = (wx: number, wz: number): boolean =>
    calculateElevationData(wx, wz).isOcean;

  const isCliffAt = (wx: number, wz: number): boolean =>
    calculateElevationData(wx, wz).isCliff;

  // Regra de tropas terrestres: nunca cruzam agua (oceano ou lago); o unico
  // travessia legal e o vado de rio (isRiver && isShallow).
  const isImpassableAt = (wx: number, wz: number): boolean =>
    isLandBlocked(calculateElevationData(wx, wz));

  const getCellAt = (wx: number, wz: number): MapCell => {
    const data = calculateElevationData(wx, wz);
    let biome: MapCell['biome'] = 'plains';
    if (data.isOcean) biome = 'ocean';
    else if (data.isLake) biome = 'lake';
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
      isLake: data.isLake,
      isOcean: data.isOcean,
      isShallow: data.isShallow,
      isCliff: data.isCliff,
      isImpassable: isLandBlocked(data),
      biome,
    };
  };

  return {
    seed: actualSeed,
    gridResolution: resolution,
    mapSize,
    islandRadius: layout.islands[0].baseRadius,
    islandCenter: { ...layout.islands[0].center },
    islands: layout.islands,
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
    proof: { islands: [], viable: false },
    capitalSites: [],
    viable: false,
    seedAttempts: 1,
  };
}

/**
 * Procura a celula de oceano mais proxima (usada para nascer barcos em agua
 * navegavel perto do cais, nunca em terra ou em rio/lago).
 */
export function findNearestOceanCell(
  map: Pick<ProceduralMapResult, 'isOceanAt' | 'mapSize'>,
  x: number,
  z: number,
  maxRadius = 8
): { x: number; z: number } {
  if (map.isOceanAt(x, z)) return { x, z };
  for (let r = 1; r <= maxRadius; r++) {
    const steps = Math.max(8, Math.floor(r * 6));
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const cx = x + Math.cos(angle) * r;
      const cz = z + Math.sin(angle) * r;
      if (cx < 0 || cz < 0 || cx > map.mapSize || cz > map.mapSize) continue;
      if (map.isOceanAt(cx, cz)) return { x: cx, z: cz };
    }
  }
  return { x, z };
}
