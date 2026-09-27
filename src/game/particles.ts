/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  initialScale: number;
  gravity: number;
  drag: number;
}

interface ExpandingRing {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  maxScale: number;
}

interface SinkingDebris {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  sinkSpeed: number;
  rotationSpeed: number;
}

export class ParticleSystem {
  private scene: THREE.Scene;
  private particleGroup: THREE.Group;
  private activeParticles: Particle[] = [];
  private activeRings: ExpandingRing[] = [];
  private activeDebris: SinkingDebris[] = [];

  // Shared reusable geometries and materials for performance
  private sparkGeometry: THREE.BufferGeometry;
  private smokeGeometry: THREE.BufferGeometry;
  private ringGeometry: THREE.RingGeometry;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.particleGroup = new THREE.Group();
    this.particleGroup.name = 'particle_system';
    this.scene.add(this.particleGroup);

    // Reusable low-poly geometries
    this.sparkGeometry = new THREE.DodecahedronGeometry(0.08, 0);
    this.smokeGeometry = new THREE.SphereGeometry(0.12, 5, 5);
    this.ringGeometry = new THREE.RingGeometry(0.15, 0.28, 16);
  }

  /**
   * Spawns hit effect particles at target coordinates when damage is dealt.
   */
  public spawnHit(
    x: number,
    y: number,
    z: number,
    options: {
      count?: number;
      isMusket?: boolean;
      color?: number;
    } = {}
  ) {
    const count = options.count ?? (options.isMusket ? 16 : 10);
    const isMusket = options.isMusket ?? false;

    // 1. Expanding shockwave ring at hit location
    const ringMat = new THREE.MeshBasicMaterial({
      color: options.color ?? (isMusket ? 0xffea75 : 0xff4444),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const ringMesh = new THREE.Mesh(this.ringGeometry, ringMat);
    ringMesh.position.set(x, y + 0.1, z);
    ringMesh.rotation.x = -Math.PI / 2;
    this.particleGroup.add(ringMesh);

    this.activeRings.push({
      mesh: ringMesh,
      life: 0.35,
      maxLife: 0.35,
      maxScale: isMusket ? 3.5 : 2.2,
    });

    // 2. High-speed Spark & Splatter particles
    const colors = isMusket
      ? [0xffffff, 0xffd166, 0xff9f1c, 0xf72585]
      : [0xff3333, 0xff8833, 0xffe066, 0xd00000];

    for (let i = 0; i < count; i++) {
      const pColor = colors[Math.floor(Math.random() * colors.length)];
      const sparkMat = new THREE.MeshBasicMaterial({
        color: pColor,
        transparent: true,
        opacity: 1,
      });

      const sparkMesh = new THREE.Mesh(this.sparkGeometry, sparkMat);
      sparkMesh.position.set(
        x + (Math.random() * 0.2 - 0.1),
        y + (Math.random() * 0.3 - 0.15),
        z + (Math.random() * 0.2 - 0.1)
      );

      // Spherical explosion velocity with upward bias
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.5; // upward hemisphere
      const speed = isMusket ? 2.5 + Math.random() * 3.5 : 1.8 + Math.random() * 2.5;

      const velocity = new THREE.Vector3(
        Math.cos(theta) * Math.sin(phi) * speed,
        Math.cos(phi) * speed + 0.8,
        Math.sin(theta) * Math.sin(phi) * speed
      );

      const life = 0.35 + Math.random() * 0.25;
      const scale = 0.7 + Math.random() * 0.8;
      sparkMesh.scale.setScalar(scale);

      this.particleGroup.add(sparkMesh);

      this.activeParticles.push({
        mesh: sparkMesh,
        velocity,
        life,
        maxLife: life,
        initialScale: scale,
        gravity: 8.5,
        drag: 0.94,
      });
    }

    // 3. Smoke puff for musket gunpowder shots
    if (isMusket) {
      for (let i = 0; i < 4; i++) {
        const smokeMat = new THREE.MeshBasicMaterial({
          color: 0xcccccc,
          transparent: true,
          opacity: 0.65,
        });
        const smokeMesh = new THREE.Mesh(this.smokeGeometry, smokeMat);
        smokeMesh.position.set(
          x + (Math.random() * 0.3 - 0.15),
          y + (Math.random() * 0.2),
          z + (Math.random() * 0.3 - 0.15)
        );

        const sVel = new THREE.Vector3(
          (Math.random() - 0.5) * 0.8,
          0.8 + Math.random() * 0.6,
          (Math.random() - 0.5) * 0.8
        );

        const sLife = 0.5 + Math.random() * 0.3;
        smokeMesh.scale.setScalar(0.8 + Math.random() * 0.6);

        this.particleGroup.add(smokeMesh);
        this.activeParticles.push({
          mesh: smokeMesh,
          velocity: sVel,
          life: sLife,
          maxLife: sLife,
          initialScale: 1.0,
          gravity: -0.4, // float upwards like real smoke
          drag: 0.96,
        });
      }
    }
  }

  /**
   * Updates all particles in the Three.js scene per frame.
   */
  /**
   * Spawns an animated tactical ground click indicator (RTS command marker).
   */
  public spawnClickMarker(
    x: number,
    z: number,
    type: 'move' | 'attack' | 'gather' | 'build' = 'move',
    y: number = 0
  ) {
    const color =
      type === 'attack'
        ? 0xef4444
        : type === 'gather'
        ? 0xf59e0b
        : type === 'build'
        ? 0x06b6d4
        : 0x22c55e;

    // Outer expanding pulse ring
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(this.ringGeometry, ringMat);
    ringMesh.position.set(x, y + 0.04, z);
    ringMesh.rotation.x = -Math.PI / 2;
    this.particleGroup.add(ringMesh);

    this.activeRings.push({
      mesh: ringMesh,
      life: 0.42,
      maxLife: 0.42,
      maxScale: type === 'attack' ? 2.8 : 2.2,
    });

    // Inner bright center dot
    const dotGeo = new THREE.CircleGeometry(0.18, 12);
    const dotMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const dotMesh = new THREE.Mesh(dotGeo, dotMat);
    dotMesh.position.set(x, y + 0.05, z);
    dotMesh.rotation.x = -Math.PI / 2;
    this.particleGroup.add(dotMesh);

    this.activeRings.push({
      mesh: dotMesh,
      life: 0.35,
      maxLife: 0.35,
      maxScale: 1.2,
    });
  }

  /**
   * Spawns wood chips and dust when a villager is hammering a building under construction.
   */
  public spawnConstructionParticles(x: number, y: number, z: number) {
    const count = 5;
    const woodColors = [0xd97706, 0xb45309, 0xfde68a, 0x92400e];

    for (let i = 0; i < count; i++) {
      const pColor = woodColors[Math.floor(Math.random() * woodColors.length)];
      const sparkMat = new THREE.MeshBasicMaterial({
        color: pColor,
        transparent: true,
        opacity: 0.9,
      });

      const sparkMesh = new THREE.Mesh(this.sparkGeometry, sparkMat);
      sparkMesh.position.set(
        x + (Math.random() * 0.4 - 0.2),
        y + Math.random() * 0.3,
        z + (Math.random() * 0.4 - 0.2)
      );
      sparkMesh.scale.setScalar(0.7);
      this.particleGroup.add(sparkMesh);

      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 1.5;
      this.activeParticles.push({
        mesh: sparkMesh,
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          1.8 + Math.random() * 1.5,
          Math.sin(angle) * speed
        ),
        life: 0.35 + Math.random() * 0.2,
        maxLife: 0.5,
        initialScale: 0.08,
        gravity: 9.8,
        drag: 0.94,
      });
    }
  }

  /**
   * Efeito de barco afundando: onda de choque na agua, jato de gotas e o casco
   * descendo balancando ate sumir abaixo da superficie.
   */
  public spawnBoatSinking(x: number, z: number) {
    // 1. Onda de choque (ring) na superficie
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x9adfff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const ringMesh = new THREE.Mesh(this.ringGeometry, ringMat);
    ringMesh.position.set(x, 0.06, z);
    ringMesh.rotation.x = -Math.PI / 2;
    this.particleGroup.add(ringMesh);
    this.activeRings.push({ mesh: ringMesh, life: 1.1, maxLife: 1.1, maxScale: 7 });

    // 2. Gotas de agua para cima
    for (let i = 0; i < 24; i++) {
      const dropMat = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xffffff : 0x7dd3fc,
        transparent: true,
        opacity: 1,
      });
      const drop = new THREE.Mesh(this.smokeGeometry, dropMat);
      drop.position.set(x + (Math.random() * 0.5 - 0.25), 0.1, z + (Math.random() * 0.5 - 0.25));
      const theta = Math.random() * Math.PI * 2;
      const speed = 1.6 + Math.random() * 2.4;
      const velocity = new THREE.Vector3(
        Math.cos(theta) * speed,
        2.2 + Math.random() * 2.2,
        Math.sin(theta) * speed
      );
      const life = 0.6 + Math.random() * 0.5;
      const scale = 0.6 + Math.random() * 0.7;
      drop.scale.setScalar(scale);
      this.particleGroup.add(drop);
      this.activeParticles.push({
        mesh: drop,
        velocity,
        life,
        maxLife: life,
        initialScale: scale,
        gravity: 9.5,
        drag: 0.92,
      });
    }

    // 3. Casco que afunda
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x2f2119,
      roughness: 0.8,
      metalness: 0.05,
      transparent: true,
      opacity: 0.95,
    });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 1.9), hullMat);
    hull.position.set(x, 0.15, z);
    hull.rotation.y = Math.random() * Math.PI;
    hull.castShadow = true;
    this.particleGroup.add(hull);
    this.activeDebris.push({
      mesh: hull,
      life: 2.4,
      maxLife: 2.4,
      sinkSpeed: 0.28,
      rotationSpeed: (Math.random() - 0.5) * 1.2,
    });
  }

  public update(delta: number) {
    if (delta <= 0) return;

    // Update Particles
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];
      p.life -= delta;

      if (p.life <= 0) {
        this.particleGroup.remove(p.mesh);
        if (p.mesh.material instanceof THREE.Material) {
          p.mesh.material.dispose();
        }
        this.activeParticles.splice(i, 1);
        continue;
      }

      // Physics
      p.velocity.y -= p.gravity * delta;
      p.velocity.x *= p.drag;
      p.velocity.z *= p.drag;

      p.mesh.position.x += p.velocity.x * delta;
      p.mesh.position.y += p.velocity.y * delta;
      p.mesh.position.z += p.velocity.z * delta;

      // Bounce slightly if hitting the ground
      if (p.mesh.position.y < 0.05) {
        p.mesh.position.y = 0.05;
        p.velocity.y = -p.velocity.y * 0.35;
      }

      // Fade and shrink
      const progress = p.life / p.maxLife;
      const currentScale = p.initialScale * Math.max(0.1, progress);
      p.mesh.scale.setScalar(currentScale);

      if (p.mesh.material instanceof THREE.MeshBasicMaterial) {
        p.mesh.material.opacity = progress;
      }
    }

    // Update Sinking Debris (barcos afundando)
    for (let i = this.activeDebris.length - 1; i >= 0; i--) {
      const d = this.activeDebris[i];
      d.life -= delta;

      if (d.life <= 0) {
        this.particleGroup.remove(d.mesh);
        if (d.mesh.material instanceof THREE.Material) {
          d.mesh.material.dispose();
        }
        this.activeDebris.splice(i, 1);
        continue;
      }

      d.mesh.position.y -= d.sinkSpeed * delta;
      d.mesh.rotation.y += d.rotationSpeed * delta;
      d.mesh.rotation.z = Math.sin((d.maxLife - d.life) * 3) * 0.18;

      const progress = d.life / d.maxLife;
      if (progress < 0.45) {
        d.mesh.position.y -= 0.2 * delta; // mergulho mais rapido no fim
      }
      if (d.mesh.material instanceof THREE.MeshStandardMaterial) {
        d.mesh.material.opacity = Math.min(0.95, progress * 1.5);
      }
    }

    // Update Expanding Rings
    for (let i = this.activeRings.length - 1; i >= 0; i--) {
      const r = this.activeRings[i];
      r.life -= delta;

      if (r.life <= 0) {
        this.particleGroup.remove(r.mesh);
        if (r.mesh.material instanceof THREE.Material) {
          r.mesh.material.dispose();
        }
        this.activeRings.splice(i, 1);
        continue;
      }

      const progress = 1 - r.life / r.maxLife; // 0 to 1
      const scale = 1 + progress * r.maxScale;
      r.mesh.scale.set(scale, scale, 1);

      if (r.mesh.material instanceof THREE.MeshBasicMaterial) {
        r.mesh.material.opacity = Math.max(0, 1 - progress);
      }
    }
  }

  public dispose() {
    this.activeParticles.forEach((p) => {
      this.particleGroup.remove(p.mesh);
      if (p.mesh.material instanceof THREE.Material) p.mesh.material.dispose();
    });
    this.activeRings.forEach((r) => {
      this.particleGroup.remove(r.mesh);
      if (r.mesh.material instanceof THREE.Material) r.mesh.material.dispose();
    });
    this.activeDebris.forEach((d) => {
      this.particleGroup.remove(d.mesh);
      if (d.mesh.material instanceof THREE.Material) d.mesh.material.dispose();
    });
    this.activeParticles = [];
    this.activeRings = [];
    this.activeDebris = [];

    this.sparkGeometry.dispose();
    this.smokeGeometry.dispose();
    this.ringGeometry.dispose();

    this.scene.remove(this.particleGroup);
  }
}
