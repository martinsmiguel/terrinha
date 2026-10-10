/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { Building, ResourceNode } from './engine';
import { BuildingType, BUILDING_CATALOG } from './buildingCatalog';
import { hasOceanNearDock, hasLandNearDock } from './dockPlacement';
import { farmPlacementReason } from './islandEconomy';

export interface GhostPlacementCheck {
  isValid: boolean;
  reason?: string;
  footprintWidth: number;
  footprintDepth: number;
}

/**
 * Creates a translucent holographic 3D ghost preview with an in-world ground footprint overlay.
 */
export function createBuildingGhost(type: BuildingType): THREE.Group {
  const ghost = new THREE.Group();
  ghost.name = 'building_ghost';

  const def = BUILDING_CATALOG[type] || BUILDING_CATALOG.house;
  const width = def.footprintWidth;
  const depth = def.footprintDepth;

  // 1. In-world ground footprint tile decal
  const footGeo = new THREE.PlaneGeometry(width, depth);
  const footMat = new THREE.MeshBasicMaterial({
    color: 0x10b981,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const footprint = new THREE.Mesh(footGeo, footMat);
  footprint.name = 'ghost_footprint';
  footprint.rotation.x = -Math.PI / 2;
  footprint.position.y = 0.05;
  ghost.add(footprint);

  // 2. Footprint border outline
  const edgesGeo = new THREE.EdgesGeometry(footGeo);
  const edgesMat = new THREE.LineBasicMaterial({
    color: 0x34d399,
    linewidth: 2,
    transparent: true,
    opacity: 0.85,
  });
  const borderLines = new THREE.LineSegments(edgesGeo, edgesMat);
  borderLines.name = 'ghost_border';
  borderLines.rotation.x = -Math.PI / 2;
  borderLines.position.y = 0.06;
  ghost.add(borderLines);

  // 3. Grid subdivision helper for tactical alignment
  const gridHelper = new THREE.GridHelper(Math.max(width, depth), 2, 0x6ee7b7, 0x10b981);
  gridHelper.name = 'ghost_grid';
  gridHelper.position.y = 0.07;
  ghost.add(gridHelper);

  const ghostMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x059669,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.55,
    roughness: 0.3,
  });

  // 4. Holographic 3D Building Structure based on type
  if (type === 'house') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.8), ghostMat);
    base.name = 'ghost_part_base';
    base.position.y = 0.6;
    ghost.add(base);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.9, 4), ghostMat);
    roof.name = 'ghost_part_roof';
    roof.position.y = 1.65;
    roof.rotation.y = Math.PI / 4;
    ghost.add(roof);
  } else if (type === 'tower') {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 3.2, 8), ghostMat);
    tower.name = 'ghost_part_base';
    tower.position.y = 1.6;
    ghost.add(tower);

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 1.8), ghostMat);
    top.name = 'ghost_part_top';
    top.position.y = 3.4;
    ghost.add(top);
  } else if (type === 'barracks') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.5, 2.4), ghostMat);
    base.name = 'ghost_part_base';
    base.position.y = 0.75;
    ghost.add(base);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.4, 2.6), ghostMat);
    roof.name = 'ghost_part_roof';
    roof.position.y = 1.65;
    ghost.add(roof);
  } else if (type === 'sawmill') {
    // Sawmill / Madeireira
    const workshop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 2.0), ghostMat);
    workshop.name = 'ghost_part_base';
    workshop.position.y = 0.6;
    ghost.add(workshop);

    const waterWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.3, 8), ghostMat);
    waterWheel.name = 'ghost_part_wheel';
    waterWheel.position.set(-1.3, 0.8, 0);
    waterWheel.rotation.z = Math.PI / 2;
    ghost.add(waterWheel);
  } else if (type === 'mine') {
    // Mineradora / Pedreira
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2.2), ghostMat);
    shaft.name = 'ghost_part_base';
    shaft.position.y = 0.8;
    ghost.add(shaft);

    const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 4), ghostMat);
    pulley.name = 'ghost_part_top';
    pulley.position.set(0.6, 1.8, 0);
    ghost.add(pulley);
  } else if (type === 'market') {
    // Mercadão do Império
    const hall = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.4, 2.6), ghostMat);
    hall.name = 'ghost_part_base';
    hall.position.y = 0.7;
    ghost.add(hall);

    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.0, 8, 8), ghostMat);
    dome.name = 'ghost_part_roof';
    dome.position.y = 1.8;
    ghost.add(dome);
  } else if (type === 'farm') {
    // Fazenda / Granja
    const plot = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, 2.6), ghostMat);
    plot.name = 'ghost_part_base';
    plot.position.y = 0.1;
    ghost.add(plot);

    const scarecrow = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 4), ghostMat);
    scarecrow.name = 'ghost_part_top';
    scarecrow.position.set(0, 0.6, 0);
    ghost.add(scarecrow);
  } else if (type === 'dock') {
    // Cais & Doca
    const pier = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.3, 2.8), ghostMat);
    pier.name = 'ghost_part_base';
    pier.position.y = 0.15;
    ghost.add(pier);

    const hut = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.2), ghostMat);
    hut.name = 'ghost_part_roof';
    hut.position.set(0.6, 0.65, 0.6);
    ghost.add(hut);
  }

  return ghost;
}

/**
 * Checks if the placement location is clear of collisions and within map bounds.
 */
export function checkBuildingPlacementValid(
  type: BuildingType,
  x: number,
  z: number,
  buildings: Building[],
  nodes: ResourceNode[],
  mapSize: number,
  isWaterAt?: (x: number, z: number) => boolean,
  isCliffAt?: (x: number, z: number) => boolean,
  getHeightAt?: (x: number, z: number) => number,
  isOceanAt?: (x: number, z: number) => boolean,
  fertilityAt?: (x: number, z: number) => number
): GhostPlacementCheck {
  const def = BUILDING_CATALOG[type] || BUILDING_CATALOG.house;
  const footprintWidth = def.footprintWidth;
  const footprintDepth = def.footprintDepth;

  // Papel econômico: fazendas só em solo fértil (a mesma regra no preview e no host).
  if (type === 'farm' && fertilityAt) {
    const reason = farmPlacementReason(fertilityAt(x, z));
    if (reason) return { isValid: false, reason, footprintWidth, footprintDepth };
  }

  // Check map borders
  const margin = Math.max(footprintWidth, footprintDepth) / 2 + 1.5;
  if (x < margin || x > mapSize - margin || z < margin || z > mapSize - margin) {
    return {
      isValid: false,
      reason: 'Fora do limite da ilha',
      footprintWidth,
      footprintDepth,
    };
  }

  // Skyrim Mountain Crag / Cliff check (Rochedos intransitáveis)
  if (isCliffAt && isCliffAt(x, z)) {
    return {
      isValid: false,
      reason: 'Rochedo montanhoso íngreme intransitável (Estilo Skyrim)',
      footprintWidth,
      footprintDepth,
    };
  }

  // Slope check: terrain under the building must not be violently steep
  if (getHeightAt) {
    const hw = footprintWidth * 0.45;
    const hd = footprintDepth * 0.45;
    const hCenter = getHeightAt(x, z);
    const h1 = getHeightAt(x - hw, z - hd);
    const h2 = getHeightAt(x + hw, z + hd);
    const h3 = getHeightAt(x - hw, z + hd);
    const h4 = getHeightAt(x + hw, z - hd);
    const maxSlope = Math.max(
      Math.abs(h1 - hCenter),
      Math.abs(h2 - hCenter),
      Math.abs(h3 - hCenter),
      Math.abs(h4 - hCenter)
    );
    if (maxSlope > 0.85 && type !== 'dock') {
      return {
        isValid: false,
        reason: 'Terreno muito íngreme para fundação estável',
        footprintWidth,
        footprintDepth,
      };
    }
  }

  // Sem geografia autoritativa não provar navegabilidade por qualquer água.
  if (type === 'dock' && (!isWaterAt || !isOceanAt)) {
    return { isValid: false, reason: 'O Cais deve ser construído na margem do oceano navegável!',
      footprintWidth, footprintDepth };
  }

  // Water check
  if (isWaterAt) {
    const isWater = isWaterAt(x, z);
    if (type === 'dock') {
      // Docks must face navigable ocean water: the same rule drives the
      // placement preview and the host's authorized application. Rio/lago
      // interior never counts, even when it is water (isOceanAt is the only
      // surface boats can use).
      const nearbyNavigableWater = isOceanAt
        && hasOceanNearDock(isOceanAt, x, z)
        && hasLandNearDock(isWaterAt, x, z);
      if (!nearbyNavigableWater) {
        return {
          isValid: false,
          reason: 'O Cais deve ser construído na margem do oceano navegável!',
          footprintWidth,
          footprintDepth,
        };
      }
    } else {
      // Land buildings cannot be built on ocean or deep river water
      if (isWater) {
        return {
          isValid: false,
          reason: 'Edificação terrestre não pode ser construída no oceano ou água profunda',
          footprintWidth,
          footprintDepth,
        };
      }
    }
  }

  // Check collision with other buildings
  for (const b of buildings) {
    const dist = Math.hypot(b.position.x - x, b.position.z - z);
    const bDef = BUILDING_CATALOG[b.type as BuildingType];
    const bRadius = bDef ? Math.max(bDef.footprintWidth, bDef.footprintDepth) * 0.55 : 2.0;
    const myRadius = Math.max(footprintWidth, footprintDepth) * 0.55;
    const requiredDistance = bRadius + myRadius;

    if (dist < requiredDistance) {
      return {
        isValid: false,
        reason: 'Espaço ocupado por outro edifício',
        footprintWidth,
        footprintDepth,
      };
    }
  }

  // Check collision with resource nodes (except fish schools which don't block land buildings)
  for (const r of nodes) {
    if (r.type === 'fish_school' && type !== 'dock') continue;
    const dist = Math.hypot(r.position.x - x, r.position.z - z);
    const rRadius = r.type === 'gold_mine' ? 2.0 : r.type === 'stone' ? 2.0 : r.type === 'tree' ? 1.6 : 1.4;
    const myRadius = Math.max(footprintWidth, footprintDepth) * 0.5;
    const requiredDistance = rRadius + myRadius;

    if (dist < requiredDistance) {
      return {
        isValid: false,
        reason: 'Espaço bloqueado por recursos naturais',
        footprintWidth,
        footprintDepth,
      };
    }
  }

  return {
    isValid: true,
    footprintWidth,
    footprintDepth,
  };
}

/**
 * Updates the 3D ghost position and switches colors (Green for valid, Red for obstructed).
 */
export function updateBuildingGhost(
  ghost: THREE.Group,
  position: { x: number; y?: number; z: number },
  isValid: boolean
): void {
  ghost.position.set(position.x, position.y ?? 0, position.z);

  const mainColor = isValid ? 0x10b981 : 0xef4444;
  const emissiveColor = isValid ? 0x059669 : 0xb91c1c;
  const borderColor = isValid ? 0x34d399 : 0xf87171;

  // Update footprint plane
  const footprint = ghost.getObjectByName('ghost_footprint') as THREE.Mesh;
  if (footprint && footprint.material instanceof THREE.MeshBasicMaterial) {
    footprint.material.color.setHex(mainColor);
  }

  // Update border outline
  const border = ghost.getObjectByName('ghost_border') as THREE.LineSegments;
  if (border && border.material instanceof THREE.LineBasicMaterial) {
    border.material.color.setHex(borderColor);
  }

  // Update 3D building parts
  ghost.traverse((child) => {
    if (child instanceof THREE.Mesh && child.name.startsWith('ghost_part_')) {
      if (child.material instanceof THREE.MeshStandardMaterial) {
        child.material.color.setHex(mainColor);
        child.material.emissive.setHex(emissiveColor);
      }
    }
  });
}
