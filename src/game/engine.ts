/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { ParticleSystem } from './particles';
import { VISION_EXPLORED, VISION_UNEXPLORED, VISION_VISIBLE } from './visibility';

export * from './model';
import { MAP_SIZE } from './model';
import { isNativeKeyboardEvent } from './hotkeys';

export class GameEngine {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  container: HTMLElement;
  animationFrameId: number | null = null;

  // Camera control state
  keysPressed: Record<string, boolean> = {};
  private keyboardBlocked = false;
  private sunLight: THREE.DirectionalLight;
  /** Lado do mundo em células; muda com `setWorldSize` quando a sessão usa outra dimensão. */
  worldSize: number = MAP_SIZE;
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

  // Nevoa de guerra: textura 60x60 (RGBA) aplicada ao material do terreno
  fogTexture: THREE.DataTexture;
  private fogPixels: Uint8Array;
  private static readonly FOG_LEVELS: Record<number, number> = {
    [VISION_UNEXPLORED]: 0,
    [VISION_EXPLORED]: 110,
    [VISION_VISIBLE]: 255,
  };

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
    this.sunLight = sunLight;
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
    this.scene.add(sunLight.target);

    // Base Terrain
    this.fogPixels = new Uint8Array(0);
    this.fogTexture = new THREE.DataTexture(this.fogPixels, 1, 1);
    this.groundMesh = new THREE.Mesh();
    this.gridHelper = new THREE.GridHelper(1, 1);
    this.buildBaseWorld();

    // Setup input listeners for camera pan
    this.setupEventListeners();
    this.startLoop();
  }

  /** Cria (ou recria) fog, chão base e grade para a dimensão atual do mundo. */
  private buildBaseWorld() {
    const size = this.worldSize;
    this.scene.remove(this.groundMesh);
    this.scene.remove(this.gridHelper);
    this.fogTexture.dispose();

    this.fogPixels = new Uint8Array(size * size * 4);
    this.fogTexture = new THREE.DataTexture(this.fogPixels, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.fogTexture.magFilter = THREE.LinearFilter;
    this.fogTexture.minFilter = THREE.LinearFilter;
    this.fogTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.fogTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.fogTexture.name = 'fog_of_war_grid';

    const groundGeo = new THREE.PlaneGeometry(size, size, 48, 48);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x4f8f3b,
      roughness: 0.85,
      metalness: 0.05,
    });
    this.applyFogToTerrain(groundMat);
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.set(size / 2, 0, size / 2);
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    // Subtle grid overlay for AoE placement feel (linhas a cada célula até 120; acima disso a cada 10)
    const divisions = size <= 120 ? size : Math.round(size / 10);
    this.gridHelper = new THREE.GridHelper(size, divisions, 0x3d702e, 0x437c33);
    this.gridHelper.position.set(size / 2, 0.02, size / 2);
    this.scene.add(this.gridHelper);
  }

  /**
   * Ajusta o motor à dimensão do mundo da sessão: recria névoa, chão base e grade, recentra a câmera
   * e amplia o zoom máximo. Deve ser chamado antes de `setProceduralTerrainMesh`.
   */
  setWorldSize(size: number) {
    if (!Number.isInteger(size) || size < 16) throw new RangeError('Dimensão do mundo inválida');
    if (size === this.worldSize) return;
    this.worldSize = size;
    this.cameraTarget.set(size / 2, 0, size / 2);
    this.buildBaseWorld();
    this.updateCameraPosition();
  }

  /** Zoom máximo: 50 no mundo padrão, crescendo com a dimensão até 200. */
  private get maxZoom(): number {
    return Math.min(200, 50 + Math.max(0, this.worldSize - MAP_SIZE) * 0.2);
  }

  setProceduralTerrainMesh(newTerrainMesh: THREE.Mesh, newWaterMesh?: THREE.Mesh, decorationsGroup?: THREE.Group) {
    if (this.groundMesh) {
      this.scene.remove(this.groundMesh);
    }
    this.groundMesh = newTerrainMesh;
    this.applyFogToTerrain(newTerrainMesh.material as THREE.Material);
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

  /**
   * Nevoa de guerra no terreno: multiplica a cor final pela textura da névoa.
   * Mundo (x, z) -> UV; nível 0 = nunca visto (preto), 110 = explorado
   * (semi-fog), 255 = sob visão atual.
   */
  private applyFogToTerrain(material: THREE.Material) {
    const mat = material as THREE.MeshStandardMaterial;
    const fogTexture = this.fogTexture;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFogMap = { value: fogTexture };
      shader.uniforms.uFogScale = { value: 1 / this.worldSize };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vFogWorld;\nuniform float uFogScale;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvFogWorld = (modelMatrix * vec4(transformed, 1.0)).xz * uFogScale;'
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vFogWorld;\nuniform sampler2D uFogMap;')
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\ndiffuseColor.rgb *= texture2D(uFogMap, vFogWorld).r;'
        );
    };
    mat.needsUpdate = true;
  }

  /**
   * Atualiza a névoa a partir do grid do jogador local (ordem `x * size + z`,
   * a mesma do Minimap). Upload de 60×60×4 bytes por chamada.
   */
  setFogGrid(grid: Uint8Array) {
    const levels = GameEngine.FOG_LEVELS;
    const cells = this.worldSize * this.worldSize;
    if (grid.length !== cells) return; // grade de outra dimensão (troca de sessão em andamento)
    for (let i = 0; i < cells; i++) {
      const level = levels[grid[i]] ?? 255;
      const offset = i * 4;
      this.fogPixels[offset] = level;
      this.fogPixels[offset + 1] = level;
      this.fogPixels[offset + 2] = level;
      this.fogPixels[offset + 3] = 255;
    }
    this.fogTexture.needsUpdate = true;
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

      this.cameraTarget.x = Math.max(5, Math.min(this.worldSize - 5, this.cameraTarget.x - dx));
      this.cameraTarget.z = Math.max(5, Math.min(this.worldSize - 5, this.cameraTarget.z - dy));
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

      this.cameraTarget.x = Math.max(5, Math.min(this.worldSize - 5, this.cameraTarget.x - dx));
      this.cameraTarget.z = Math.max(5, Math.min(this.worldSize - 5, this.cameraTarget.z - dy));
      this.updateCameraPosition();
    } else if (e.touches.length === 2 && this.touchStartDist) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const diff = this.touchStartDist - dist;
      this.zoomLevel = Math.max(16, Math.min(this.maxZoom, this.zoomLevel + diff * 0.06));
      this.touchStartDist = dist;
      this.updateCameraPosition();
    }
  };

  handleTouchEnd = () => {
    this.touchStartPos = null;
    this.touchStartDist = null;
  };

  /** Com um overlay aberto a câmera não responde ao teclado. */
  setKeyboardBlocked(blocked: boolean) {
    this.keyboardBlocked = blocked;
    if (blocked) this.keysPressed = {};
  }

  handleKeyDown = (e: KeyboardEvent) => {
    if (this.keyboardBlocked || isNativeKeyboardEvent(e)) return;
    this.keysPressed[e.key.toLowerCase()] = true;
  };

  handleKeyUp = (e: KeyboardEvent) => {
    this.keysPressed[e.key.toLowerCase()] = false;
  };

  handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomLevel = Math.max(16, Math.min(this.maxZoom, this.zoomLevel + e.deltaY * 0.03));
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
    // O sol (e a caixa de sombra) acompanha o alvo da câmera: o mundo pode ser bem maior que a caixa.
    this.sunLight?.target.position.set(this.cameraTarget.x, 0, this.cameraTarget.z);
    this.sunLight?.position.set(this.cameraTarget.x + 40, 60, this.cameraTarget.z + 30);
  }

  setCameraTarget(x: number, z: number) {
    this.cameraTarget.x = Math.max(5, Math.min(this.worldSize - 5, x));
    this.cameraTarget.z = Math.max(5, Math.min(this.worldSize - 5, z));
    this.updateCameraPosition();
  }

  getCameraFrustumBounds() {
    const width = this.zoomLevel * 1.35;
    const height = this.zoomLevel * 0.95;
    return {
      minX: Math.max(0, this.cameraTarget.x - width / 2),
      maxX: Math.min(this.worldSize, this.cameraTarget.x + width / 2),
      minZ: Math.max(0, this.cameraTarget.z - height / 2),
      maxZ: Math.min(this.worldSize, this.cameraTarget.z + height / 2),
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
      this.cameraTarget.x = Math.max(5, Math.min(this.worldSize - 5, this.cameraTarget.x + dx));
      this.cameraTarget.z = Math.max(5, Math.min(this.worldSize - 5, this.cameraTarget.z + dz));
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

  /** Efeito de barco afundando: respingo, gotas e casco submerso. */
  spawnBoatSinking(x: number, z: number) {
    this.particles.spawnBoatSinking(x, z);
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
    this.fogTexture.dispose();

    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
