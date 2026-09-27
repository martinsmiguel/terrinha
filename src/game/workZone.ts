import * as THREE from 'three';

export interface WorkZoneData {
  id: string;
  x: number;
  z: number;
  radius: number;
  unitCount: number;
  unitIds: string[];
  resourceType?: 'tree' | 'gold_mine' | 'food_bush' | 'fish_school' | 'stone';
  treesRemaining?: number;
  isHighlighted?: boolean;
  isPreview?: boolean;
}

/**
 * Creates a holographic 3D Work Zone perimeter and center beacon for the scene.
 * Uses a unit radius = 1 for the scalable ground ring and disc, so it can be smoothly
 * scaled in real-time on every slider or animation tick without geometry recreation.
 */
export function createWorkZoneMesh(colorHex: number = 0x10b981): THREE.Group {
  const group = new THREE.Group();
  group.name = 'work_zone_root';

  // 1. Scalable Radius Subgroup (scaled by zone radius along X and Z)
  const radiusGroup = new THREE.Group();
  radiusGroup.name = 'radius_group';

  // Outer Perimeter Ring (Unit radius = 1.0)
  const ringGeo = new THREE.RingGeometry(0.97, 1.03, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.name = 'perimeter_ring';
  radiusGroup.add(ring);

  // Inner Soft Fill Disc (Unit radius = 0.96)
  const discGeo = new THREE.CircleGeometry(0.96, 48);
  const discMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.03;
  disc.name = 'fill_disc';
  radiusGroup.add(disc);

  // 4 Cardinal Tactical Ticks at North, South, East, West along perimeter
  const tickGeo = new THREE.BoxGeometry(0.04, 0.02, 0.12);
  const tickMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  
  const tickN = new THREE.Mesh(tickGeo, tickMat);
  tickN.position.set(0, 0.045, 1.0);
  radiusGroup.add(tickN);

  const tickS = new THREE.Mesh(tickGeo, tickMat);
  tickS.position.set(0, 0.045, -1.0);
  radiusGroup.add(tickS);

  const tickE = new THREE.Mesh(tickGeo, tickMat);
  tickE.position.set(1.0, 0.045, 0);
  tickE.rotation.y = Math.PI / 2;
  radiusGroup.add(tickE);

  const tickW = new THREE.Mesh(tickGeo, tickMat);
  tickW.position.set(-1.0, 0.045, 0);
  tickW.rotation.y = Math.PI / 2;
  radiusGroup.add(tickW);

  group.add(radiusGroup);

  // 2. Unscaled Center Anchor Subgroup (fixed size irrespective of radius)
  const centerGroup = new THREE.Group();
  centerGroup.name = 'center_group';

  // Center Ground Ring
  const centerRingGeo = new THREE.RingGeometry(0.35, 0.6, 24);
  const centerRingMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  });
  const centerRing = new THREE.Mesh(centerRingGeo, centerRingMat);
  centerRing.rotation.x = -Math.PI / 2;
  centerRing.position.y = 0.045;
  centerRing.name = 'center_ring';
  centerGroup.add(centerRing);

  // Vertical Light Beacon Pillar
  const pinGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.4, 8);
  const pinMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.45,
  });
  const pin = new THREE.Mesh(pinGeo, pinMat);
  pin.position.y = 1.2;
  pin.name = 'center_pin';
  centerGroup.add(pin);

  group.add(centerGroup);

  return group;
}

/**
 * Updates a Work Zone mesh position, radius, color, and highlight state.
 */
export function updateWorkZoneMesh(
  group: THREE.Group,
  x: number,
  z: number,
  radius: number,
  colorHex: number = 0x10b981,
  isHighlighted: boolean = false,
  isPreview: boolean = false
) {
  group.position.set(x, 0, z);

  const radiusGroup = group.getObjectByName('radius_group');
  if (radiusGroup) {
    const clampedRadius = Math.max(1, Math.min(60, radius));
    radiusGroup.scale.set(clampedRadius, 1, clampedRadius);
  }

  const ring = group.getObjectByName('perimeter_ring') as THREE.Mesh;
  if (ring && ring.material instanceof THREE.MeshBasicMaterial) {
    ring.material.color.setHex(colorHex);
    ring.material.opacity = isHighlighted ? 0.95 : isPreview ? 0.6 : 0.8;
  }

  const disc = group.getObjectByName('fill_disc') as THREE.Mesh;
  if (disc && disc.material instanceof THREE.MeshBasicMaterial) {
    disc.material.color.setHex(colorHex);
    disc.material.opacity = isHighlighted ? 0.22 : isPreview ? 0.08 : 0.14;
  }

  const centerRing = group.getObjectByName('center_ring') as THREE.Mesh;
  if (centerRing && centerRing.material instanceof THREE.MeshBasicMaterial) {
    centerRing.material.color.setHex(colorHex);
  }

  const centerPin = group.getObjectByName('center_pin') as THREE.Mesh;
  if (centerPin && centerPin.material instanceof THREE.MeshBasicMaterial) {
    centerPin.material.color.setHex(colorHex);
    centerPin.material.opacity = isHighlighted ? 0.6 : isPreview ? 0.3 : 0.45;
  }
}
