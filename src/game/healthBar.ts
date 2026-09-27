/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

export interface HealthBarOptions {
  width: number;
  height: number;
  ownerColor: number;
  yOffset: number;
}

/**
 * Creates an in-world 3D health bar attached to a unit or building.
 */
export function create3DHealthBar(options: HealthBarOptions): THREE.Group {
  const { width, height, ownerColor, yOffset } = options;
  const barGroup = new THREE.Group();
  barGroup.name = 'health_bar_container';
  barGroup.position.set(0, yOffset, 0);

  // 1. Dark outer border/frame plate
  const frameGeo = new THREE.PlaneGeometry(width + 0.08, height + 0.06);
  const frameMat = new THREE.MeshBasicMaterial({
    color: 0x070b14,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });
  const frameMesh = new THREE.Mesh(frameGeo, frameMat);
  frameMesh.position.z = 0;
  frameMesh.renderOrder = 998;
  barGroup.add(frameMesh);

  // 2. Inner track / empty background plate
  const trackGeo = new THREE.PlaneGeometry(width, height);
  const trackMat = new THREE.MeshBasicMaterial({
    color: 0x1e293b,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
  });
  const trackMesh = new THREE.Mesh(trackGeo, trackMat);
  trackMesh.position.z = 0.002;
  trackMesh.renderOrder = 999;
  barGroup.add(trackMesh);

  // 3. Faction identification marker (left pip)
  const pipWidth = Math.max(0.08, height * 0.85);
  const pipGeo = new THREE.PlaneGeometry(pipWidth, height);
  const pipMat = new THREE.MeshBasicMaterial({
    color: ownerColor,
    side: THREE.DoubleSide,
  });
  const pipMesh = new THREE.Mesh(pipGeo, pipMat);
  pipMesh.position.set(-width / 2 + pipWidth / 2, 0, 0.004);
  pipMesh.renderOrder = 1000;
  barGroup.add(pipMesh);

  // 4. Dynamic Fill Bar (anchored on the left)
  const fillWidth = width - pipWidth;
  const fillGeo = new THREE.PlaneGeometry(fillWidth, height);
  fillGeo.translate(fillWidth / 2, 0, 0); // Shift origin to left edge of fill plane

  const fillMat = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    side: THREE.DoubleSide,
  });
  const fillMesh = new THREE.Mesh(fillGeo, fillMat);
  fillMesh.name = 'health_fill_bar';
  fillMesh.position.set(-width / 2 + pipWidth, 0, 0.004);
  fillMesh.renderOrder = 1000;
  barGroup.add(fillMesh);

  // Hidden by default: only becomes visible when selected or damaged
  barGroup.visible = false;
  return barGroup;
}

/**
 * Updates the health bar's visibility, fill ratio, and color.
 * For normal entities: visible when selected OR damaged.
 * For buildings under construction: ALWAYS visible, displaying amber/gold construction progress!
 */
export function update3DHealthBar(
  barGroup: THREE.Group,
  health: number,
  maxHealth: number,
  isSelected: boolean,
  isConstructing: boolean = false,
  buildProgress: number = 0
): void {
  const isDamaged = health < maxHealth;
  const shouldBeVisible = isConstructing ? true : (isSelected || isDamaged) && health > 0;
  barGroup.visible = shouldBeVisible;

  if (!shouldBeVisible) return;

  const fillMesh = barGroup.getObjectByName('health_fill_bar') as THREE.Mesh;
  if (fillMesh) {
    if (isConstructing) {
      // Construction progress bar (0% to 100%) in bright amber/gold
      const ratio = Math.max(0, Math.min(1, buildProgress / 100));
      fillMesh.scale.x = ratio;
      if (fillMesh.material instanceof THREE.MeshBasicMaterial) {
        fillMesh.material.color.setHex(0xf59e0b); // Amber gold construction bar
      }
    } else {
      const ratio = Math.max(0, Math.min(1, health / maxHealth));
      fillMesh.scale.x = ratio;

      // Dynamic color coding: Green (>55%) -> Amber (25%-55%) -> Red (<25%)
      if (fillMesh.material instanceof THREE.MeshBasicMaterial) {
        if (ratio > 0.55) {
          fillMesh.material.color.setHex(0x22c55e);
        } else if (ratio > 0.25) {
          fillMesh.material.color.setHex(0xeab308);
        } else {
          fillMesh.material.color.setHex(0xef4444);
        }
      }
    }
  }
}

/**
 * Aligns the floating health bar to directly face the camera in world space (billboard).
 */
export function align3DHealthBarToCamera(
  barGroup: THREE.Group,
  parentGroup: THREE.Group,
  cameraQuaternion: THREE.Quaternion
): void {
  if (!barGroup.visible) return;
  const parentInv = parentGroup.quaternion.clone().invert();
  barGroup.quaternion.copy(parentInv).multiply(cameraQuaternion);
}
