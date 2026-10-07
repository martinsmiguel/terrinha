/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

export * from './buildingCatalog';
import { BUILDING_CATALOG, type BuildingType } from './buildingCatalog';

/**
 * Creates an in-progress construction scaffold / foundation 3D group.
 */
export function createConstructionScaffold(
  type: BuildingType,
  ownerColor: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'construction_scaffold';

  const def = BUILDING_CATALOG[type] || BUILDING_CATALOG.house;
  const w = def.footprintWidth;
  const d = def.footprintDepth;

  // 1. Excavated earth and stone plinth foundation (anchors into terrain, eliminates sinking)
  const slabHeight = 0.35;
  const groundGeo = new THREE.BoxGeometry(w, slabHeight, d);
  const groundMat = new THREE.MeshStandardMaterial({
    color: type === 'dock' ? 0x475569 : type === 'farm' ? 0x582f0e : 0x78716c,
    roughness: 0.9,
  });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.position.y = slabHeight / 2 - 0.15;
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  // 2. Wooden boundary stakes
  const stakeGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.9, 5);
  const stakeMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 });

  const halfW = w / 2;
  const halfD = d / 2;
  const corners = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
  ];

  corners.forEach(([cx, cz]) => {
    const stake = new THREE.Mesh(stakeGeo, stakeMat);
    stake.position.set(cx, 0.45, cz);
    stake.castShadow = true;
    group.add(stake);
  });

  // 3. Wooden Scaffolding Beams
  const beamMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.7 });
  const beamGeoX = new THREE.BoxGeometry(w, 0.1, 0.1);
  const beamGeoZ = new THREE.BoxGeometry(0.1, 0.1, d);

  const beam1 = new THREE.Mesh(beamGeoX, beamMat);
  beam1.position.set(0, 0.8, -halfD);
  group.add(beam1);

  const beam2 = new THREE.Mesh(beamGeoX, beamMat);
  beam2.position.set(0, 0.8, halfD);
  group.add(beam2);

  const beam3 = new THREE.Mesh(beamGeoZ, beamMat);
  beam3.position.set(-halfW, 0.8, 0);
  group.add(beam3);

  const beam4 = new THREE.Mesh(beamGeoZ, beamMat);
  beam4.position.set(halfW, 0.8, 0);
  group.add(beam4);

  // 4. Owner color construction flag
  const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.0, 5);
  const pole = new THREE.Mesh(poleGeo, stakeMat);
  pole.position.set(halfW - 0.2, 1.0, halfD - 0.2);
  group.add(pole);

  const flagGeo = new THREE.BoxGeometry(0.5, 0.35, 0.03);
  const flagMat = new THREE.MeshStandardMaterial({ color: ownerColor });
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(halfW - 0.2 + 0.25, 1.8, halfD - 0.2);
  group.add(flag);

  // 5. Translucent partial ghost showing what is being constructed
  const previewGeo =
    type === 'house'
      ? new THREE.BoxGeometry(1.6, 0.7, 1.6)
      : type === 'barracks'
      ? new THREE.BoxGeometry(2.5, 0.8, 2.2)
      : type === 'tower'
      ? new THREE.BoxGeometry(1.4, 1.2, 1.4)
      : type === 'sawmill'
      ? new THREE.BoxGeometry(2.2, 0.9, 2.0)
      : type === 'mine'
      ? new THREE.BoxGeometry(2.4, 1.1, 2.2)
      : type === 'market'
      ? new THREE.BoxGeometry(2.8, 1.0, 2.6)
      : type === 'farm'
      ? new THREE.BoxGeometry(2.2, 0.3, 2.2)
      : new THREE.BoxGeometry(2.6, 0.6, 2.6); // dock

  const previewMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.35,
    roughness: 0.5,
  });
  const preview = new THREE.Mesh(previewGeo, previewMat);
  preview.position.y = (type === 'tower' ? 1.2 : type === 'farm' ? 0.3 : 0.8) / 2;
  preview.name = 'scaffold_preview';
  group.add(preview);

  return group;
}
