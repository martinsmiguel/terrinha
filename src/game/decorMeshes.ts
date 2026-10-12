import * as THREE from 'three';
import type { DecorationDef } from './decorations';
import { rotatedFootprint, type DecorationRotation } from './decor';

/**
 * Malhas provisórias dos enfeites (#180), sem arte final: formas simples por `shape`, giradas em quartos de volta.
 * A prévia usa o mesmo desenho em verde (pode) ou vermelho (não pode), com a área ocupada no chão.
 */

const mat = (color: number, ghost: boolean) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.8, transparent: ghost, opacity: ghost ? 0.6 : 1 });

function shapeParts(def: DecorationDef, ghost: boolean, accent: number): THREE.Object3D[] {
  const parts: THREE.Object3D[] = [];
  const add = (geometry: THREE.BufferGeometry, color: number, y: number, x = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, mat(color, ghost));
    mesh.position.set(x, y, z);
    mesh.castShadow = !ghost;
    mesh.name = 'decor_part';
    parts.push(mesh);
  };
  const { width, depth } = def.footprint;
  switch (def.shape) {
    case 'canteiro':
      add(new THREE.BoxGeometry(width * 0.9, 0.25, depth * 0.9), 0x7c4a1e, 0.12);
      for (let i = 0; i < 4; i += 1) add(new THREE.SphereGeometry(0.18, 8, 6), [0xf472b6, 0xfacc15, 0xa78bfa, 0xf87171][i], 0.35, -0.6 + i * 0.4, 0);
      break;
    case 'menir':
      add(new THREE.BoxGeometry(0.5, 1.8, 0.4), 0x9ca3af, 0.9);
      break;
    case 'braseiro':
      add(new THREE.CylinderGeometry(0.12, 0.18, 0.7, 8), 0xb45309, 0.35);
      add(new THREE.CylinderGeometry(0.45, 0.25, 0.25, 10), 0xd97706, 0.8);
      add(new THREE.ConeGeometry(0.25, 0.5, 8), 0xf97316, 1.15);
      break;
    case 'fonte':
      add(new THREE.CylinderGeometry(0.95, 1, 0.4, 16), 0xa8a29e, 0.2);
      add(new THREE.CylinderGeometry(0.8, 0.8, 0.05, 16), 0x38bdf8, 0.42);
      add(new THREE.CylinderGeometry(0.15, 0.2, 1.1, 8), 0xa8a29e, 0.75);
      break;
    case 'estandarte':
      add(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 6), 0x78350f, 1.2, 0, -0.6);
      add(new THREE.BoxGeometry(0.04, 0.8, 1.0), accent, 1.9, 0, -0.05);
      break;
  }
  return parts;
}

/** Enfeite no mundo, na cor do dono quando a peça tem bandeira. */
export function createDecorationMesh(def: DecorationDef, rotation: DecorationRotation, ownerColor = 0x2563eb): THREE.Group {
  const group = new THREE.Group();
  shapeParts(def, false, ownerColor).forEach((part) => group.add(part));
  group.rotation.y = (rotation * Math.PI) / 2;
  return group;
}

/** Prévia: o enfeite translúcido e a área ocupada no chão, coloridos por `setDecorationGhost`. */
export function createDecorationGhost(def: DecorationDef, rotation: DecorationRotation): THREE.Group {
  const group = new THREE.Group();
  const holder = new THREE.Group();
  holder.name = 'decor_holder';
  shapeParts(def, true, 0x10b981).forEach((part) => holder.add(part));
  holder.rotation.y = (rotation * Math.PI) / 2;
  group.add(holder);
  const size = rotatedFootprint(def, rotation);
  const area = new THREE.Mesh(new THREE.PlaneGeometry(size.width, size.depth), new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  area.rotation.x = -Math.PI / 2;
  area.position.y = 0.05;
  area.name = 'decor_area';
  group.add(area);
  return group;
}

export function setDecorationGhost(ghost: THREE.Group, position: { x: number; y: number; z: number }, valid: boolean): void {
  ghost.position.set(position.x, position.y, position.z);
  const color = valid ? 0x10b981 : 0xef4444;
  ghost.traverse((child) => {
    if (child instanceof THREE.Mesh && (child.material instanceof THREE.MeshStandardMaterial || child.material instanceof THREE.MeshBasicMaterial)) {
      if (child.name === 'decor_area' || child.name === 'decor_part') child.material.color.setHex(color);
    }
  });
}
