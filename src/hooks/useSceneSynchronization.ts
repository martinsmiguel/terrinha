import { useEffect } from 'react';
import * as THREE from 'three';
import type { GameEngine, GameState } from '../game/engine';
import { isBoatUnit } from '../game/engine';
import type { MultiplayerManager } from '../game/multiplayer';
import type { ProceduralMapResult } from '../game/proceduralMap';
import { create3DHealthBar, update3DHealthBar } from '../game/healthBar';
import type { BuildingType } from '../game/buildingCatalog';
import { createConstructionScaffold } from '../game/buildingScaffold';
import { FACTION_COLORS } from '../game/factions';
import { isVisibleAt } from '../game/visibility';
import type { PlayerSlot } from '../game/networkCommands';

type MutableValue<T> = { current: T };

interface SceneSynchronizationContext {
  engineRef: MutableValue<GameEngine | null>;
  multiRef: MutableValue<MultiplayerManager | null>;
  proceduralMapRef: MutableValue<ProceduralMapResult | null>;
  resourceMeshes: MutableValue<Map<string, THREE.Group>>;
  unitMeshes: MutableValue<Map<string, THREE.Group>>;
  buildingMeshes: MutableValue<Map<string, THREE.Group>>;
  gameState: GameState;
  selectedEntity: { id: string; kind: 'unit' | 'building' | 'resource' } | null;
  selectedUnitIds: string[];
  role: 'host' | 'client' | 'single';
  playerSlot: PlayerSlot;
  visionGridRef: MutableValue<Uint8Array>;
}

export function useSceneSynchronization({
  engineRef, multiRef, proceduralMapRef, resourceMeshes, unitMeshes, buildingMeshes,
  gameState, selectedEntity, selectedUnitIds, role, playerSlot, visionGridRef,
}: SceneSynchronizationContext): void {
  const selectedResource = selectedEntity?.kind === 'resource'
    ? gameState.resourceNodes.find((node) => node.id === selectedEntity.id)
    : null;
  useEffect(() => {
    if (!engineRef.current) return;
    const { scene } = engineRef.current;

    // 1. Sync Resource Nodes
    const currentResourceIds = new Set(gameState.resourceNodes.map((n) => n.id));
    resourceMeshes.current.forEach((mesh, id) => {
      if (!currentResourceIds.has(id)) {
        scene.remove(mesh);
        resourceMeshes.current.delete(id);
      }
    });

    gameState.resourceNodes.forEach((node) => {
      let group = resourceMeshes.current.get(node.id);
      const isSelected = selectedEntity?.id === node.id;

      if (!group) {
        group = new THREE.Group();
        const nodeY =
          node.type === 'fish_school'
            ? 0.02
            : proceduralMapRef.current
            ? proceduralMapRef.current.getHeightAt(node.position.x, node.position.z)
            : 0;
        group.position.set(node.position.x, nodeY, node.position.z);

        // Accurate hit collider avoiding overlap between adjacent grove trees
        const isMineral = node.type === 'gold_mine' || node.type === 'stone';
        const hitRadius = node.type === 'tree' ? 1.25 : isMineral ? 1.5 : 1.1;
        const hitHeight = node.type === 'tree' ? 4.8 : isMineral ? 2.8 : 2.0;
        const hitGeo = new THREE.CylinderGeometry(hitRadius, hitRadius, hitHeight, 10);
        const hitMat = new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
        const hitMesh = new THREE.Mesh(hitGeo, hitMat);
        hitMesh.position.y = hitHeight / 2;
        hitMesh.name = 'hit_collider';
        group.add(hitMesh);

        // 3D Selection Ring on ground
        const ringGeo = new THREE.RingGeometry(1.3, 1.5, 24);
        const ringMat = new THREE.MeshBasicMaterial({
          color:
            node.type === 'tree'
              ? 0x22c55e
              : node.type === 'gold_mine'
              ? 0xfacc15
              : node.type === 'stone'
              ? 0x94a3b8
              : 0xf43f5e,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.04;
        ring.name = 'selection_ring';
        group.add(ring);

        if (node.type === 'tree') {
          // A. Mature Tree Model Group
          const matureGroup = new THREE.Group();
          matureGroup.name = 'mature_model';

          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.25, 1.2, 6),
            new THREE.MeshStandardMaterial({ color: 0x5c4033 })
          );
          trunk.position.y = 0.6;
          trunk.castShadow = true;
          matureGroup.add(trunk);

          const leaves1 = new THREE.Mesh(
            new THREE.ConeGeometry(1.1, 1.5, 6),
            new THREE.MeshStandardMaterial({ color: 0x2e6f40, roughness: 0.8 })
          );
          leaves1.position.y = 1.8;
          leaves1.castShadow = true;
          matureGroup.add(leaves1);

          const leaves2 = new THREE.ConeGeometry(0.8, 1.3, 6);
          const leavesMesh2 = new THREE.Mesh(leaves2, leaves1.material);
          leavesMesh2.position.y = 2.6;
          leavesMesh2.castShadow = true;
          matureGroup.add(leavesMesh2);

          group.add(matureGroup);

          // B. Young Sapling / Sprout Model Group (shown when regrowing after sustainable harvest)
          const saplingGroup = new THREE.Group();
          saplingGroup.name = 'sapling_model';

          const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.08, 0.45, 5),
            new THREE.MeshStandardMaterial({ color: 0x854d0e })
          );
          stem.position.y = 0.22;
          stem.castShadow = true;
          saplingGroup.add(stem);

          const foliage = new THREE.Mesh(
            new THREE.SphereGeometry(0.35, 6, 6),
            new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.65 })
          );
          foliage.position.y = 0.55;
          foliage.castShadow = true;
          saplingGroup.add(foliage);

          saplingGroup.visible = false;
          group.add(saplingGroup);
        } else if (node.type === 'gold_mine') {
          // Gold rock cluster
          const rockGeo = new THREE.DodecahedronGeometry(0.9, 1);
          const rockMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.65, roughness: 0.3 });
          const rock = new THREE.Mesh(rockGeo, rockMat);
          rock.position.y = 0.55;
          rock.castShadow = true;
          group.add(rock);

          const smallRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.48, 0), rockMat);
          smallRock.position.set(0.65, 0.3, 0.45);
          group.add(smallRock);

          const miniRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), rockMat);
          miniRock.position.set(-0.55, 0.2, -0.4);
          group.add(miniRock);
        } else if (node.type === 'stone') {
          // Grey granite quarry outcrop
          const rockGeo = new THREE.DodecahedronGeometry(0.9, 1);
          const rockMat = new THREE.MeshStandardMaterial({ color: 0x8f9aa8, metalness: 0.15, roughness: 0.85 });
          const rock = new THREE.Mesh(rockGeo, rockMat);
          rock.position.y = 0.55;
          rock.castShadow = true;
          group.add(rock);

          const smallRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), rockMat);
          smallRock.position.set(0.6, 0.28, 0.5);
          smallRock.rotation.set(0.4, 0.8, 0.2);
          group.add(smallRock);

          const miniRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), rockMat);
          miniRock.position.set(-0.6, 0.22, -0.35);
          group.add(miniRock);

          const pebbleMat = new THREE.MeshStandardMaterial({ color: 0xb6bec8, roughness: 0.95 });
          const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), pebbleMat);
          pebble.position.set(0.15, 0.1, -0.7);
          group.add(pebble);
        } else if (node.type === 'fish_school') {
          // Fish School in river / water
          const fishGroup = new THREE.Group();
          fishGroup.name = 'fish_school_model';

          const ripple = new THREE.Mesh(
            new THREE.RingGeometry(0.65, 1.05, 16),
            new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
          );
          ripple.rotation.x = -Math.PI / 2;
          ripple.position.y = 0.05;
          ripple.name = 'fish_ripple';
          fishGroup.add(ripple);

          for (let f = 0; f < 4; f++) {
            const angle = (f / 4) * Math.PI * 2;
            const fish = new THREE.Mesh(
              new THREE.ConeGeometry(0.08, 0.38, 4),
              new THREE.MeshStandardMaterial({ color: 0x93c5fd, metalness: 0.8, roughness: 0.2 })
            );
            fish.position.set(Math.cos(angle) * 0.6, 0.05, Math.sin(angle) * 0.6);
            fish.rotation.y = angle + Math.PI / 2;
            fish.name = `fish_${f}`;
            fishGroup.add(fish);
          }
          group.add(fishGroup);
        } else {
          // Berry Bush
          const bush = new THREE.Mesh(
            new THREE.SphereGeometry(0.65, 6, 6),
            new THREE.MeshStandardMaterial({ color: 0xa83250 })
          );
          bush.position.y = 0.45;
          bush.castShadow = true;
          group.add(bush);
        }

        scene.add(group);
        resourceMeshes.current.set(node.id, group);
      }

      // Rotate swimming fish in fish_school
      if (node.type === 'fish_school') {
        const fishModel = group.getObjectByName('fish_school_model');
        if (fishModel) {
          fishModel.rotation.y = performance.now() * 0.0015;
          const ripple = fishModel.getObjectByName('fish_ripple') as THREE.Mesh;
          if (ripple && ripple.material instanceof THREE.MeshBasicMaterial) {
            ripple.material.opacity = 0.5 + Math.sin(performance.now() * 0.004) * 0.2;
          }
        }
      }

      // Update selection ring opacity and companion grove highlighting
      const ring = group.getObjectByName('selection_ring') as THREE.Mesh;
      if (ring && ring.material instanceof THREE.MeshBasicMaterial) {
        if (isSelected) {
          ring.material.opacity = 0.95;
          ring.scale.set(1.15, 1.15, 1.15);
        } else if (
          selectedEntity?.kind === 'resource' &&
          selectedResource?.type === 'tree' &&
          node.type === 'tree' &&
          ((selectedResource.clusterId && node.clusterId === selectedResource.clusterId) ||
            Math.hypot(node.position.x - selectedResource.position.x, node.position.z - selectedResource.position.z) <= 12)
        ) {
          ring.material.opacity = 0.38;
          ring.scale.set(0.9, 0.9, 0.9);
        } else {
          ring.material.opacity = 0;
          ring.scale.set(1, 1, 1);
        }
      }

      // Update tree growth visuals
      if (node.type === 'tree') {
        const mature = group.getObjectByName('mature_model');
        const sapling = group.getObjectByName('sapling_model');
        if (mature && sapling) {
          if (node.isRegrowing) {
            mature.visible = false;
            sapling.visible = true;
            const progress = (node.regrowthProgress || 0) / 100;
            const s = 0.35 + 0.65 * progress;
            sapling.scale.set(s, s, s);
          } else {
            mature.visible = true;
            sapling.visible = false;
          }
        }
      }

      // Maintain node elevation on terrain surface
      const nodeY =
        node.type === 'fish_school'
          ? 0.02
          : proceduralMapRef.current
          ? proceduralMapRef.current.getHeightAt(node.position.x, node.position.z)
          : 0;
      group.position.y = nodeY;
    });

    // 2. Sync Units
    const currentUnitIds = new Set(gameState.units.map((u) => u.id));
    unitMeshes.current.forEach((mesh, id) => {
      if (!currentUnitIds.has(id)) {
        scene.remove(mesh);
        unitMeshes.current.delete(id);
      }
    });

    gameState.units.forEach((unit) => {
      let group = unitMeshes.current.get(unit.id);
      const isSelected = selectedUnitIds.includes(unit.id) || selectedEntity?.id === unit.id;
      const ownerColor = FACTION_COLORS[unit.owner]?.hex ?? 0x3b82f6;

      if (!group) {
        group = new THREE.Group();

        // Selection ring
        const ringGeo = new THREE.RingGeometry(0.55, 0.7, 16);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x22c55e,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.04;
        ring.name = 'selection_ring';
        group.add(ring);

        // Character Model
        if (unit.type === 'soldier') {
          // Musket Soldier with Tricorn Hat
          const body = new THREE.Mesh(
            new THREE.CylinderGeometry(0.25, 0.3, 1.1, 8),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          body.position.y = 0.55;
          body.castShadow = true;
          group.add(body);

          const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0xffdbac })
          );
          head.position.y = 1.25;
          group.add(head);

          const hat = new THREE.Mesh(
            new THREE.CylinderGeometry(0.35, 0.35, 0.15, 3),
            new THREE.MeshStandardMaterial({ color: 0x1f2937 })
          );
          hat.position.y = 1.4;
          group.add(hat);

          // Musket
          const musket = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6),
            new THREE.MeshStandardMaterial({ color: 0x4a2e18 })
          );
          musket.position.set(0.28, 0.7, 0.1);
          musket.rotation.z = -0.3;
          group.add(musket);
        } else if (unit.type === 'cavalry') {
          // Cavalaria montada: cavalo + cavaleiro
          const horseBody = new THREE.Mesh(
            new THREE.BoxGeometry(0.45, 0.5, 1.3),
            new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.85 })
          );
          horseBody.position.y = 0.75;
          horseBody.castShadow = true;
          group.add(horseBody);

          const horseHead = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.42, 0.5),
            new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.85 })
          );
          horseHead.position.set(0, 1.0, -0.78);
          group.add(horseHead);

          const legGeometry = new THREE.CylinderGeometry(0.07, 0.07, 0.55, 6);
          const legMaterial = new THREE.MeshStandardMaterial({ color: 0x4a2e18 });
          const legSpots: [number, number][] = [[0.16, 0.45], [-0.16, 0.45], [0.16, -0.45], [-0.16, -0.45]];
          const unitGroup = group;
          legSpots.forEach(([legX, legZ]) => {
            const leg = new THREE.Mesh(legGeometry, legMaterial);
            leg.position.set(legX, 0.27, legZ);
            unitGroup.add(leg);
          });

          const rider = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.25, 0.7, 8),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          rider.position.y = 1.35;
          rider.castShadow = true;
          group.add(rider);

          const riderHead = new THREE.Mesh(
            new THREE.SphereGeometry(0.17, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0xffdbac })
          );
          riderHead.position.y = 1.85;
          group.add(riderHead);

          const helmet = new THREE.Mesh(
            new THREE.ConeGeometry(0.16, 0.3, 6),
            new THREE.MeshStandardMaterial({ color: 0x1f2937 })
          );
          helmet.position.y = 2.08;
          group.add(helmet);
        } else if (unit.type === 'fishing_boat') {
          // Barco de Pesca (Wooden skiff with triangular sail)
          const hull = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.35, 1.6),
            new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.7 })
          );
          hull.position.y = 0.12;
          hull.castShadow = true;
          group.add(hull);

          const mast = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 1.3, 4),
            new THREE.MeshStandardMaterial({ color: 0xd4d4d8 })
          );
          mast.position.set(0, 0.75, 0.1);
          group.add(mast);

          const sail = new THREE.Mesh(
            new THREE.ConeGeometry(0.45, 0.85, 3),
            new THREE.MeshStandardMaterial({ color: ownerColor, roughness: 0.5 })
          );
          sail.position.set(0.18, 0.8, 0.05);
          sail.rotation.z = Math.PI / 8;
          group.add(sail);
        } else if (unit.type === 'trade_boat') {
          // Barco Mercante (Merchant trade vessel with dual sails and cargo)
          const hull = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 0.45, 2.0),
            new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.6 })
          );
          hull.position.y = 0.16;
          hull.castShadow = true;
          group.add(hull);

          const mast = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 1.8, 4),
            new THREE.MeshStandardMaterial({ color: 0x78350f })
          );
          mast.position.set(0, 0.95, 0.1);
          group.add(mast);

          const sail = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.7, 0.04),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          sail.position.set(0, 1.1, 0.15);
          group.add(sail);

          const crate = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.3, 0.4),
            new THREE.MeshStandardMaterial({ color: 0xb45309 })
          );
          crate.position.set(0, 0.45, -0.4);
          group.add(crate);
        } else if (unit.type === 'warship') {
          // Barco de Guerra (casco blindado com canhoes e vela negra)
          const hull = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 0.55, 2.5),
            new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.55, metalness: 0.25 })
          );
          hull.position.y = 0.2;
          hull.castShadow = true;
          group.add(hull);

          const mast = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 2.1, 6),
            new THREE.MeshStandardMaterial({ color: 0x57534e })
          );
          mast.position.set(0, 1.15, 0.15);
          group.add(mast);

          const sail = new THREE.Mesh(
            new THREE.BoxGeometry(1.15, 0.95, 0.06),
            new THREE.MeshStandardMaterial({ color: ownerColor, roughness: 0.6 })
          );
          sail.position.set(0, 1.4, 0.3);
          group.add(sail);

          const crown = new THREE.Mesh(
            new THREE.ConeGeometry(0.22, 0.3, 6),
            new THREE.MeshStandardMaterial({ color: 0x0f172a })
          );
          crown.position.set(0, 2.3, 0.15);
          group.add(crown);

          for (const side of [-1, 1]) {
            const cannon = new THREE.Mesh(
              new THREE.CylinderGeometry(0.11, 0.13, 0.75, 8),
              new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.35 })
            );
            cannon.rotation.z = Math.PI / 2;
            cannon.position.set(side * 0.62, 0.42, -0.35);
            group.add(cannon);
          }
        } else {
          // Villager
          const body = new THREE.Mesh(
            new THREE.CylinderGeometry(0.24, 0.28, 0.95, 8),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          body.position.y = 0.48;
          body.castShadow = true;
          group.add(body);

          const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0xffdbac })
          );
          head.position.y = 1.08;
          group.add(head);

          // Straw Hat
          const hat = new THREE.Mesh(
            new THREE.ConeGeometry(0.38, 0.2, 8),
            new THREE.MeshStandardMaterial({ color: 0xd97706 })
          );
          hat.position.y = 1.22;
          group.add(hat);
        }

        // Floating 3D Health Bar (only visible when selected or damaged)
        const isBoat = isBoatUnit(unit.type);
        const healthBar = create3DHealthBar({
          width: isBoat ? 1.2 : unit.type === 'cavalry' ? 1.2 : unit.type === 'soldier' ? 1.0 : 0.9,
          height: unit.type === 'soldier' || unit.type === 'cavalry' ? 0.13 : 0.12,
          ownerColor,
          yOffset: isBoat ? 1.9 : unit.type === 'cavalry' ? 2.4 : unit.type === 'soldier' ? 1.75 : 1.55,
        });
        group.add(healthBar);

        scene.add(group);
        unitMeshes.current.set(unit.id, group);
      }

      // Update position according to terrain elevation
      const isBoat = isBoatUnit(unit.type);
      const unitY = isBoat
        ? 0.02
        : proceduralMapRef.current
        ? proceduralMapRef.current.getHeightAt(unit.position.x, unit.position.z)
        : 0;
      group.position.set(unit.position.x, unitY, unit.position.z);

      // Update selection indicator visibility
      const ring = group.getObjectByName('selection_ring') as THREE.Mesh;
      if (ring && ring.material instanceof THREE.MeshBasicMaterial) {
        ring.material.opacity = isSelected ? 0.9 : 0;
      }

      // Update 3D Health Bar visibility and fill
      const healthBar = group.getObjectByName('health_bar_container') as THREE.Group;
      if (healthBar) {
        update3DHealthBar(healthBar, unit.health, unit.maxHealth, isSelected);
      }

      // Nevoa: inimigos fora da visao atual nao aparecem na cena
      group.visible =
        unit.owner === playerSlot ||
        isVisibleAt(visionGridRef.current, Math.floor(unit.position.x), Math.floor(unit.position.z));
    });

    // 3. Sync Buildings
    const currentBuildingIds = new Set(gameState.buildings.map((b) => b.id));
    buildingMeshes.current.forEach((mesh, id) => {
      if (!currentBuildingIds.has(id)) {
        scene.remove(mesh);
        buildingMeshes.current.delete(id);
      }
    });

    gameState.buildings.forEach((b) => {
      let group = buildingMeshes.current.get(b.id);
      const isSelected = selectedEntity?.id === b.id;
      const ownerColor = FACTION_COLORS[b.owner]?.hex ?? 0x2563eb;

      // Recreate mesh if construction completion status changed
      if (group && group.userData.isComplete !== b.isComplete) {
        scene.remove(group);
        buildingMeshes.current.delete(b.id);
        group = undefined;
      }

      if (!group) {
        group = new THREE.Group();
        const bGroundY = proceduralMapRef.current ? proceduralMapRef.current.getHeightAt(b.position.x, b.position.z) : 0;
        group.position.set(b.position.x, bGroundY, b.position.z);
        group.userData.isComplete = b.isComplete;

        // Selection ring
        const ringRadius = b.type === 'town_center' ? 3.2 : b.type === 'barracks' ? 2.6 : 2.1;
        const ringGeo = new THREE.RingGeometry(ringRadius, ringRadius + 0.2, 24);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x22c55e,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.05;
        ring.name = 'building_selection_ring';
        group.add(ring);

        // Universal heavy stone plinth foundation (anchors building deep into terrain so it never floats or sinks)
        const plinthMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.95 });

        if (!b.isComplete) {
          // In-progress construction site scaffolding
          const scaffold = createConstructionScaffold(b.type as BuildingType, ownerColor);
          group.add(scaffold);
        } else if (b.type === 'town_center') {
          // Town Center: Grand colonial structure
          const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.4, 4.0), plinthMat);
          plinth.position.y = -0.15;
          plinth.receiveShadow = true;
          group.add(plinth);

          const base = new THREE.Mesh(
            new THREE.BoxGeometry(3.6, 2.0, 3.6),
            new THREE.MeshStandardMaterial({ color: 0xddc9a3, roughness: 0.7 })
          );
          base.position.y = 1.0;
          base.castShadow = true;
          group.add(base);

          const roof = new THREE.Mesh(
            new THREE.ConeGeometry(2.8, 1.8, 4),
            new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5 })
          );
          roof.position.y = 2.9;
          roof.rotation.y = Math.PI / 4;
          roof.castShadow = true;
          group.add(roof);

          // Flagpole
          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 2.5),
            new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8 })
          );
          pole.position.set(0, 4.0, 0);
          group.add(pole);

          // Flag
          const flag = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.5, 0.04),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          flag.position.set(0.42, 4.9, 0);
          group.add(flag);
        } else if (b.type === 'house') {
          // Colonial House
          const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.35, 2.1), plinthMat);
          plinth.position.y = -0.15;
          plinth.receiveShadow = true;
          group.add(plinth);

          const base = new THREE.Mesh(
            new THREE.BoxGeometry(1.8, 1.2, 1.8),
            new THREE.MeshStandardMaterial({ color: 0xc4b59d })
          );
          base.position.y = 0.6;
          base.castShadow = true;
          group.add(base);

          const roof = new THREE.Mesh(
            new THREE.ConeGeometry(1.4, 0.9, 4),
            new THREE.MeshStandardMaterial({ color: 0xb45309 })
          );
          roof.position.y = 1.65;
          roof.rotation.y = Math.PI / 4;
          roof.castShadow = true;
          group.add(roof);
        } else if (b.type === 'barracks') {
          // Military Barracks
          const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.35, 2.7), plinthMat);
          plinth.position.y = -0.15;
          plinth.receiveShadow = true;
          group.add(plinth);

          const base = new THREE.Mesh(
            new THREE.BoxGeometry(2.8, 1.5, 2.4),
            new THREE.MeshStandardMaterial({ color: 0x78716c })
          );
          base.position.y = 0.75;
          base.castShadow = true;
          group.add(base);

          const roof = new THREE.Mesh(
            new THREE.BoxGeometry(3.0, 0.4, 2.6),
            new THREE.MeshStandardMaterial({ color: 0x475569 })
          );
          roof.position.y = 1.65;
          group.add(roof);

          const banner = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.8, 0.4),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          banner.position.set(1.45, 1.0, 0);
          group.add(banner);
        } else if (b.type === 'tower') {
          // Watchtower (Stone & Wood defense fort)
          const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.35, 0.45, 8), plinthMat);
          plinth.position.y = -0.15;
          plinth.receiveShadow = true;
          group.add(plinth);

          const stoneBase = new THREE.Mesh(
            new THREE.CylinderGeometry(0.8, 1.0, 3.0, 8),
            new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 })
          );
          stoneBase.position.y = 1.5;
          stoneBase.castShadow = true;
          group.add(stoneBase);

          const woodPlatform = new THREE.Mesh(
            new THREE.BoxGeometry(1.8, 0.5, 1.8),
            new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 })
          );
          woodPlatform.position.y = 3.25;
          group.add(woodPlatform);

          const roof = new THREE.Mesh(
            new THREE.ConeGeometry(1.3, 0.8, 4),
            new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.5 })
          );
          roof.position.y = 3.9;
          roof.rotation.y = Math.PI / 4;
          group.add(roof);

          const flag = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.25, 0.03),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          flag.position.set(0.2, 4.4, 0);
          group.add(flag);
        } else if (b.type === 'sawmill') {
          // Sawmill & Lumber Camp (Serralheria & Madeireira)
          const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.35, 2.3), plinthMat);
          plinth.position.y = -0.15;
          plinth.receiveShadow = true;
          group.add(plinth);

          const base = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 1.3, 2.0),
            new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.8 })
          );
          base.position.y = 0.65;
          base.castShadow = true;
          group.add(base);

          const roof = new THREE.Mesh(
            new THREE.ConeGeometry(1.6, 0.9, 4),
            new THREE.MeshStandardMaterial({ color: 0x713f12, roughness: 0.6 })
          );
          roof.position.y = 1.7;
          roof.rotation.y = Math.PI / 4;
          roof.castShadow = true;
          group.add(roof);

          // Water wheel / saw blade
          const wheel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.8, 0.8, 0.25, 8),
            new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.5 })
          );
          wheel.position.set(-1.3, 0.7, 0);
          wheel.rotation.z = Math.PI / 2;
          wheel.name = 'sawmill_wheel';
          group.add(wheel);

          // Pile of timber logs
          const log = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 1.2, 5),
            new THREE.MeshStandardMaterial({ color: 0x5c4033 })
          );
          log.position.set(0.6, 0.15, 1.1);
          log.rotation.z = Math.PI / 2;
          group.add(log);

          const flag = new THREE.Mesh(
            new THREE.BoxGeometry(0.35, 0.2, 0.03),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          flag.position.set(0, 2.3, 0);
          group.add(flag);
        } else if (b.type === 'mine') {
          // Mineradora & Pedreira (Stone/Gold extraction and smelting forge)
          const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.4, 2.5), plinthMat);
          plinth.position.y = -0.15;
          plinth.receiveShadow = true;
          group.add(plinth);

          const stoneBase = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 1.4, 2.2),
            new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 })
          );
          stoneBase.position.y = 0.7;
          stoneBase.castShadow = true;
          group.add(stoneBase);

          // Dark shaft entrance
          const entrance = new THREE.Mesh(
            new THREE.BoxGeometry(1.0, 1.0, 0.4),
            new THREE.MeshBasicMaterial({ color: 0x09090b })
          );
          entrance.position.set(0, 0.5, 1.0);
          group.add(entrance);

          // Timber headframe tower with hoist pulley
          const headframe = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 1.6, 0.8),
            new THREE.MeshStandardMaterial({ color: 0x78350f })
          );
          headframe.position.set(0.6, 1.8, -0.4);
          headframe.castShadow = true;
          group.add(headframe);

          const wheel = new THREE.Mesh(
            new THREE.TorusGeometry(0.3, 0.06, 6, 12),
            new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.7 })
          );
          wheel.position.set(0.6, 2.5, -0.4);
          group.add(wheel);
        } else if (b.type === 'market') {
          // Mercadão do Império (Grand commercial hub with awnings)
          const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.35, 2.9), plinthMat);
          plinth.position.y = -0.15;
          plinth.receiveShadow = true;
          group.add(plinth);

          const hall = new THREE.Mesh(
            new THREE.BoxGeometry(3.0, 1.4, 2.6),
            new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.6 })
          );
          hall.position.y = 0.7;
          hall.castShadow = true;
          group.add(hall);

          const tent = new THREE.Mesh(
            new THREE.ConeGeometry(2.0, 1.2, 4),
            new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4 })
          );
          tent.position.y = 1.9;
          tent.rotation.y = Math.PI / 4;
          tent.castShadow = true;
          group.add(tent);

          const banner = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 1.0, 0.5),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          banner.position.set(1.55, 1.0, 0);
          group.add(banner);
        } else if (b.type === 'farm') {
          // Fazenda & Granja (Cultivated wheat plot)
          const farmSoil = new THREE.Mesh(
            new THREE.BoxGeometry(2.8, 0.35, 2.8),
            new THREE.MeshStandardMaterial({ color: 0x582f0e, roughness: 0.95 })
          );
          farmSoil.position.y = -0.15;
          farmSoil.receiveShadow = true;
          group.add(farmSoil);

          const field = new THREE.Mesh(
            new THREE.BoxGeometry(2.6, 0.15, 2.6),
            new THREE.MeshStandardMaterial({ color: 0xca8a04, roughness: 0.95 })
          );
          field.position.y = 0.08;
          group.add(field);

          const shed = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 0.8, 0.9),
            new THREE.MeshStandardMaterial({ color: 0x854d0e })
          );
          shed.position.set(0.7, 0.45, 0.7);
          shed.castShadow = true;
          group.add(shed);

          const roof = new THREE.Mesh(
            new THREE.ConeGeometry(0.7, 0.5, 4),
            new THREE.MeshStandardMaterial({ color: 0xb45309 })
          );
          roof.position.set(0.7, 1.05, 0.7);
          roof.rotation.y = Math.PI / 4;
          group.add(roof);
        } else if (b.type === 'dock') {
          // Cais & Doca Naval (Waterfront wooden pier)
          const pier = new THREE.Mesh(
            new THREE.BoxGeometry(2.8, 0.35, 2.8),
            new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 })
          );
          pier.position.y = 0.18;
          pier.castShadow = true;
          group.add(pier);

          // Deep pilings extending firmly into water bed
          for (let px = -1.1; px <= 1.1; px += 2.2) {
            for (let pz = -1.1; pz <= 1.1; pz += 2.2) {
              const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, 1.4, 5),
                new THREE.MeshStandardMaterial({ color: 0x451a03 })
              );
              post.position.set(px, -0.2, pz);
              group.add(post);
            }
          }

          const hut = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 0.9, 1.1),
            new THREE.MeshStandardMaterial({ color: 0x9ca3af })
          );
          hut.position.set(0.65, 0.65, 0.65);
          hut.castShadow = true;
          group.add(hut);

          const flag = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.25, 0.03),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          flag.position.set(0.65, 1.3, 0.65);
          group.add(flag);
        }

        // Floating 3D Health Bar
        const barWidth =
          b.type === 'town_center'
            ? 3.2
            : b.type === 'barracks' || b.type === 'market'
            ? 2.5
            : b.type === 'tower' || b.type === 'dock' || b.type === 'mine'
            ? 2.0
            : 1.8;
        const barHeight = b.type === 'town_center' ? 0.28 : b.type === 'barracks' ? 0.22 : 0.18;
        const barY =
          b.type === 'town_center'
            ? 5.3
            : b.type === 'tower'
            ? 4.7
            : b.type === 'mine'
            ? 3.0
            : b.type === 'market'
            ? 2.6
            : 2.45;

        const healthBar = create3DHealthBar({
          width: barWidth,
          height: barHeight,
          ownerColor,
          yOffset: barY,
        });
        group.add(healthBar);

        scene.add(group);
        buildingMeshes.current.set(b.id, group);
      }

      // Update ring
      const ring = group.getObjectByName('building_selection_ring') as THREE.Mesh;
      if (ring && ring.material instanceof THREE.MeshBasicMaterial) {
        ring.material.opacity = isSelected ? 0.85 : 0;
      }

      // Update 3D Health Bar visibility, fill, and construction progress
      const healthBar = group.getObjectByName('health_bar_container') as THREE.Group;
      if (healthBar) {
        update3DHealthBar(
          healthBar,
          b.health,
          b.maxHealth,
          isSelected,
          !b.isComplete,
          b.buildProgress || 0
        );
      }

      // Update scaffold preview height as building is being constructed
      if (!b.isComplete) {
        const scaffold = group.getObjectByName('construction_scaffold') as THREE.Group;
        if (scaffold) {
          const preview = scaffold.getObjectByName('scaffold_preview') as THREE.Mesh;
          if (preview) {
            const progressRatio = Math.max(0.1, Math.min(1, (b.buildProgress || 0) / 100));
            preview.scale.y = progressRatio;
            const origH = b.type === 'tower' ? 1.2 : 0.8;
            preview.position.y = (origH * progressRatio) / 2;
          }
        }
      }

      // Maintain exact terrain elevation so buildings never sink or hover
      const bGroundY = proceduralMapRef.current ? proceduralMapRef.current.getHeightAt(b.position.x, b.position.z) : 0;
      group.position.y = bGroundY;

      // Nevoa: edificios inimigos fora da visao atual nao aparecem na cena
      group.visible =
        b.owner === playerSlot ||
        isVisibleAt(visionGridRef.current, Math.floor(b.position.x), Math.floor(b.position.z));
    });

    // Host broadcasts simulation state to connected clients in LAN
    if (role === 'host' && multiRef.current) {
      multiRef.current.broadcast(gameState);
    }
  }, [gameState, selectedEntity, selectedResource, selectedUnitIds, role, playerSlot, visionGridRef]);

}
