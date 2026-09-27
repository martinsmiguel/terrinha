/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { ParticleSystem } from './particles';

export type UnitType = 'villager' | 'soldier' | 'cavalry' | 'fishing_boat' | 'trade_boat';
export type BuildingType =
  | 'town_center'
  | 'house'
  | 'barracks'
  | 'tower'
  | 'sawmill'
  | 'mine'
  | 'market'
  | 'farm'
  | 'dock';

export interface Unit {
  id: string;
  type: UnitType;
  owner: string; // 'player1', 'player2', etc.
  position: { x: number; z: number };
  targetPosition: { x: number; z: number } | null;
  targetEntityId: string | null;
  health: number;
  maxHealth: number;
  attackDamage: number;
  state: 'idle' | 'moving' | 'gathering' | 'attacking' | 'building' | 'fishing' | 'trading';
  gatheringResource?: 'wood' | 'food' | 'gold' | 'fish' | 'stone' | 'planks';
  attackCooldown?: number;
  gatherOrigin?: { x: number; z: number }; // Anchor position where gathering started
  gatherRadiusLimit?: number; // Maximum search radius for consecutive resources
  gatherTimeLimitSeconds?: number; // Configured work shift timer in seconds (0 = infinite)
  gatherShiftSecondsRemaining?: number; // Real-time remaining seconds for current gathering shift
}

export interface Building {
  id: string;
  type: BuildingType;
  owner: string;
  position: { x: number; z: number };
  health: number;
  maxHealth: number;
  isComplete: boolean;
  buildProgress?: number; // 0 to 100
  attackCooldown?: number;
  trainingQueue: { unitType: UnitType; progress: number }[];
  lastProduceTick?: number;
}

export interface ResourceNode {
  id: string;
  type: 'tree' | 'gold_mine' | 'food_bush' | 'fish_school';
  name?: string;
  position: { x: number; z: number };
  remaining: number;
  maxCapacity?: number;
  harvestMode?: 'clear_cut' | 'sustainable';
  isRegrowing?: boolean;
  regrowthProgress?: number; // 0 to 100
  clusterId?: string; // Id of the forest grove or mineral vein
  clusterName?: string; // Human readable name (e.g., 'Bosque da Base Sul')
}

export interface PlayerResources {
  wood: number;
  food: number;
  gold: number;
  stone: number;
  planks: number;
  pop: number;
  maxPop: number;
}

export interface GameState {
  units: Unit[];
  buildings: Building[];
  resourceNodes: ResourceNode[];
  playerResources: Record<string, PlayerResources>;
}

export const MAP_SIZE = 60;

export class GameEngine {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  container: HTMLElement;
  animationFrameId: number | null = null;

  // Camera control state
  keysPressed: Record<string, boolean> = {};
  cameraTarget: THREE.Vector3 = new THREE.Vector3(MAP_SIZE / 2, 0, MAP_SIZE / 2);
  zoomLevel: number = 32;

  // Middle click drag and edge pan state
  isMiddleMouseDown: boolean = false;
  lastMiddleMousePos: { x: number; y: number } = { x: 0, y: 0 };
  edgeScrollEnabled: boolean = true;
  isPointerOverUI: boolean = false;
  mouseScreenPos: { x: number; y: number } | null = null;

  // Touch controls for mobile / tablet exploration
  touchStartPos: { x: number; y: number } | null = null;
  touchStartDist: number | null = null;

  // Meshes cache
  groundMesh: THREE.Mesh;
  waterMesh: THREE.Mesh | null = null;
  gridHelper: THREE.GridHelper;
  particles: ParticleSystem;
  onRenderFrame?: (time: number, delta: number) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7bc676);
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.012);

    this.particles = new ParticleSystem(this.scene);

    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      1,
      500
    );
    this.updateCameraPosition();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Illumination
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x446633, 0.65);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.25);
    sunLight.position.set(40, 60, 30);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 150;
    sunLight.shadow.camera.left = -40;
    sunLight.shadow.camera.right = 40;
    sunLight.shadow.camera.top = 40;
    sunLight.shadow.camera.bottom = -40;
    this.scene.add(sunLight);

    // Base Terrain
    const groundGeo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 48, 48);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x4f8f3b,
      roughness: 0.85,
      metalness: 0.05,
    });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.set(MAP_SIZE / 2, 0, MAP_SIZE / 2);
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    // Subtle grid overlay for AoE placement feel
    this.gridHelper = new THREE.GridHelper(MAP_SIZE, MAP_SIZE, 0x3d702e, 0x437c33);
    this.gridHelper.position.set(MAP_SIZE / 2, 0.02, MAP_SIZE / 2);
    this.scene.add(this.gridHelper);

    // Setup input listeners for camera pan
    this.setupEventListeners();
    this.startLoop();
  }

  setProceduralTerrainMesh(newTerrainMesh: THREE.Mesh, newWaterMesh?: THREE.Mesh, decorationsGroup?: THREE.Group) {
    if (this.groundMesh) {
      this.scene.remove(this.groundMesh);
    }
    this.groundMesh = newTerrainMesh;
    this.scene.add(this.groundMesh);

    if (this.waterMesh) {
      this.scene.remove(this.waterMesh);
    }
    if (newWaterMesh) {
      this.waterMesh = newWaterMesh;
      this.scene.add(this.waterMesh);
    }
    if (decorationsGroup) {
      this.scene.add(decorationsGroup);
    }
  }

  setupEventListeners() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    this.container.addEventListener('wheel', this.handleWheel, { passive: false });
    this.container.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);

    this.container.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.container.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.container.addEventListener('touchend', this.handleTouchEnd);
    this.container.addEventListener('touchcancel', this.handleTouchEnd);
  }

  setIsPointerOverUI(over: boolean) {
    this.isPointerOverUI = over;
  }

  setEdgeScrollEnabled(enabled: boolean) {
    this.edgeScrollEnabled = enabled;
  }

  handleMouseDown = (e: MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      this.isMiddleMouseDown = true;
      this.lastMiddleMousePos = { x: e.clientX, y: e.clientY };
    }
  };

  handleMouseMove = (e: MouseEvent) => {
    this.mouseScreenPos = { x: e.clientX, y: e.clientY };
    if (this.isMiddleMouseDown) {
      const dx = (e.clientX - this.lastMiddleMousePos.x) * 0.06 * (this.zoomLevel / 30);
      const dy = (e.clientY - this.lastMiddleMousePos.y) * 0.06 * (this.zoomLevel / 30);
      this.lastMiddleMousePos = { x: e.clientX, y: e.clientY };

      this.cameraTarget.x = Math.max(5, Math.min(MAP_SIZE - 5, this.cameraTarget.x - dx));
      this.cameraTarget.z = Math.max(5, Math.min(MAP_SIZE - 5, this.cameraTarget.z - dy));
      this.updateCameraPosition();
    }
  };

  handleMouseUp = (e: MouseEvent) => {
    if (e.button === 1) {
      this.isMiddleMouseDown = false;
    }
  };

  handleTouchStart = (e: TouchEvent) => {
    if (this.isPointerOverUI) return;
    if (e.touches.length === 1) {
      this.touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.touchStartDist = Math.hypot(dx, dy);
    }
  };

  handleTouchMove = (e: TouchEvent) => {
    if (this.isPointerOverUI) return;
    if (e.touches.length === 1 && this.touchStartPos) {
      e.preventDefault();
      const dx = (e.touches[0].clientX - this.touchStartPos.x) * 0.05 * (this.zoomLevel / 30);
      const dy = (e.touches[0].clientY - this.touchStartPos.y) * 0.05 * (this.zoomLevel / 30);
      this.touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };

      this.cameraTarget.x = Math.max(5, Math.min(MAP_SIZE - 5, this.cameraTarget.x - dx));
      this.cameraTarget.z = Math.max(5, Math.min(MAP_SIZE - 5, this.cameraTarget.z - dy));
      this.updateCameraPosition();
    } else if (e.touches.length === 2 && this.touchStartDist) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const diff = this.touchStartDist - dist;
      this.zoomLevel = Math.max(16, Math.min(50, this.zoomLevel + diff * 0.06));
      this.touchStartDist = dist;
      this.updateCameraPosition();
    }
  };

  handleTouchEnd = () => {
    this.touchStartPos = null;
    this.touchStartDist = null;
  };

  handleKeyDown = (e: KeyboardEvent) => {
    this.keysPressed[e.key.toLowerCase()] = true;
  };

  handleKeyUp = (e: KeyboardEvent) => {
    this.keysPressed[e.key.toLowerCase()] = false;
  };

  handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomLevel = Math.max(16, Math.min(50, this.zoomLevel + e.deltaY * 0.03));
    this.updateCameraPosition();
  };

  updateCameraPosition() {
    const angle = Math.PI / 4;
    const distanceZ = this.zoomLevel * Math.cos(angle);
    const distanceY = this.zoomLevel * Math.sin(angle);

    this.camera.position.set(
      this.cameraTarget.x,
      this.cameraTarget.y + distanceY,
      this.cameraTarget.z + distanceZ
    );
    this.camera.lookAt(this.cameraTarget);
  }

  setCameraTarget(x: number, z: number) {
    this.cameraTarget.x = Math.max(5, Math.min(MAP_SIZE - 5, x));
    this.cameraTarget.z = Math.max(5, Math.min(MAP_SIZE - 5, z));
    this.updateCameraPosition();
  }

  getCameraFrustumBounds() {
    const width = this.zoomLevel * 1.35;
    const height = this.zoomLevel * 0.95;
    return {
      minX: Math.max(0, this.cameraTarget.x - width / 2),
      maxX: Math.min(MAP_SIZE, this.cameraTarget.x + width / 2),
      minZ: Math.max(0, this.cameraTarget.z - height / 2),
      maxZ: Math.min(MAP_SIZE, this.cameraTarget.z + height / 2),
      centerX: this.cameraTarget.x,
      centerZ: this.cameraTarget.z,
      width,
      height,
    };
  }

  updateCameraMovement(delta: number) {
    const moveSpeed = 26 * delta;
    let dx = 0;
    let dz = 0;

    if (this.keysPressed['w'] || this.keysPressed['arrowup']) dz -= moveSpeed;
    if (this.keysPressed['s'] || this.keysPressed['arrowdown']) dz += moveSpeed;
    if (this.keysPressed['a'] || this.keysPressed['arrowleft']) dx -= moveSpeed;
    if (this.keysPressed['d'] || this.keysPressed['arrowright']) dx += moveSpeed;

    if (this.edgeScrollEnabled && !this.isPointerOverUI && this.mouseScreenPos && !this.isMiddleMouseDown) {
      const edgeThreshold = 18;
      const { x, y } = this.mouseScreenPos;
      const w = window.innerWidth;
      const h = window.innerHeight;

      if (x <= edgeThreshold) dx -= moveSpeed * 0.9;
      else if (x >= w - edgeThreshold) dx += moveSpeed * 0.9;

      if (y <= edgeThreshold) dz -= moveSpeed * 0.9;
      else if (y >= h - edgeThreshold) dz += moveSpeed * 0.9;
    }

    if (dx !== 0 || dz !== 0) {
      this.cameraTarget.x = Math.max(5, Math.min(MAP_SIZE - 5, this.cameraTarget.x + dx));
      this.cameraTarget.z = Math.max(5, Math.min(MAP_SIZE - 5, this.cameraTarget.z + dz));
      this.updateCameraPosition();
    }
  }

  spawnHitEffect(x: number, y: number, z: number, isMusket: boolean = false) {
    this.particles.spawnHit(x, y, z, { isMusket });
  }

  spawnClickMarker(x: number, z: number, type: 'move' | 'attack' | 'gather' | 'build' = 'move', y: number = 0) {
    this.particles.spawnClickMarker(x, z, type, y);
  }

  spawnConstructionParticles(x: number, y: number, z: number) {
    this.particles.spawnConstructionParticles(x, y, z);
  }

  lastTime: number = performance.now();
  startLoop() {
    const loop = (currentTime: number) => {
      const delta = Math.min(0.1, (currentTime - this.lastTime) / 1000);
      this.lastTime = currentTime;

      this.updateCameraMovement(delta);
      this.particles.update(delta);

      // Subtle water shimmer animation
      if (this.waterMesh && this.waterMesh.material instanceof THREE.MeshStandardMaterial) {
        this.waterMesh.material.opacity = 0.65 + Math.sin(currentTime * 0.002) * 0.05;
      }

      this.onRenderFrame?.(currentTime / 1000, delta);
      this.renderer.render(this.scene, this.camera);
      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  handleResize() {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.container.removeEventListener('wheel', this.handleWheel);
    this.container.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
    this.container.removeEventListener('touchstart', this.handleTouchStart);
    this.container.removeEventListener('touchmove', this.handleTouchMove);
    this.container.removeEventListener('touchend', this.handleTouchEnd);
    this.container.removeEventListener('touchcancel', this.handleTouchEnd);

    this.particles.dispose();

    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
