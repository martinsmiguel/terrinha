/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

export type BuildingType =
  | 'house'
  | 'barracks'
  | 'tower'
  | 'sawmill'
  | 'mine'
  | 'market'
  | 'farm'
  | 'dock';

export interface BuildingDef {
  type: BuildingType;
  name: string;
  category: 'civil' | 'militar' | 'defesa' | 'economia' | 'naval';
  description: string;
  benefit: string;
  cost: { wood: number; food?: number; gold?: number; stone?: number; planks?: number };
  buildTimeSeconds: number;
  maxHealth: number;
  hotkey: string;
  footprintWidth: number;
  footprintDepth: number;
  requiresWater?: boolean; // Docks must be built near river/water
}

export const BUILDING_CATALOG: Record<BuildingType, BuildingDef> = {
  house: {
    type: 'house',
    name: 'Casa Colonial',
    category: 'civil',
    description: 'Habitação para colonos. Essencial para expandir a população da sua vila.',
    benefit: '+5 Capacidade de População',
    cost: { wood: 60 },
    buildTimeSeconds: 8,
    maxHealth: 450,
    hotkey: 'Q',
    footprintWidth: 2.4,
    footprintDepth: 2.4,
  },
  barracks: {
    type: 'barracks',
    name: 'Quartel Militar',
    category: 'militar',
    description: 'Guarnição militar para treinamento de infantaria e mosqueteiros imperiais.',
    benefit: 'Recruta Soldados Mosqueteiros',
    cost: { wood: 120, gold: 30 },
    buildTimeSeconds: 14,
    maxHealth: 800,
    hotkey: 'W',
    footprintWidth: 3.6,
    footprintDepth: 3.2,
  },
  tower: {
    type: 'tower',
    name: 'Torre de Vigia',
    category: 'defesa',
    description: 'Posto avançado fortificado que atira automaticamente contra invasores.',
    benefit: 'Ataque Automático (16 Dano, Alcance 12)',
    cost: { wood: 80, stone: 40, planks: 20 },
    buildTimeSeconds: 12,
    maxHealth: 650,
    hotkey: 'E',
    footprintWidth: 2.2,
    footprintDepth: 2.2,
  },
  sawmill: {
    type: 'sawmill',
    name: 'Serralheria & Madeireira',
    category: 'economia',
    description: 'Oficina de corte e tábuas. Aumenta a velocidade de coleta florestal e fornece tábuas nobres.',
    benefit: '+35% Coleta de Madeira & Refino de Tábuas',
    cost: { wood: 110 },
    buildTimeSeconds: 11,
    maxHealth: 550,
    hotkey: 'R',
    footprintWidth: 3.0,
    footprintDepth: 2.8,
  },
  mine: {
    type: 'mine',
    name: 'Mineradora & Pedreira',
    category: 'economia',
    description: 'Instalação de extração de veios de pedra, ferro e ouro com forja para lingotes.',
    benefit: '+40% Eficiência de Extração Mineral',
    cost: { wood: 130, gold: 25 },
    buildTimeSeconds: 14,
    maxHealth: 650,
    hotkey: 'T',
    footprintWidth: 3.2,
    footprintDepth: 3.0,
  },
  market: {
    type: 'market',
    name: 'Mercadão do Império',
    category: 'economia',
    description: 'Grande centro comercial. Permite comprar e vender mercadorias e gerenciar preços da colônia.',
    benefit: 'Câmbio de Recursos (Madeira/Comida/Ouro)',
    cost: { wood: 150, gold: 50 },
    buildTimeSeconds: 16,
    maxHealth: 750,
    hotkey: 'Y',
    footprintWidth: 3.8,
    footprintDepth: 3.4,
  },
  farm: {
    type: 'farm',
    name: 'Fazenda & Granja',
    category: 'economia',
    description: 'Talhão agrícola de trigo e cereais cultivado por aldeões para suprimento contínuo de alimento.',
    benefit: 'Fonte Renovável de Alimento sem vagar',
    cost: { wood: 75 },
    buildTimeSeconds: 9,
    maxHealth: 400,
    hotkey: 'F',
    footprintWidth: 2.8,
    footprintDepth: 2.8,
  },
  dock: {
    type: 'dock',
    name: 'Cais & Doca Naval',
    category: 'naval',
    description: 'Estaleiro construído na margem do rio para atracar e construir Barcos de Pesca e Comércio.',
    benefit: 'Constrói Barcos de Pesca e Mercantes',
    cost: { wood: 140 },
    buildTimeSeconds: 15,
    maxHealth: 700,
    hotkey: 'B',
    footprintWidth: 3.4,
    footprintDepth: 3.4,
    requiresWater: true,
  },
};

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
