import type { Building, BuildingType, GameState, Unit } from './engine';
import { applyPopDelta, countDeathsByOwner } from './population';

export interface SimulationMap {
  isWaterAt(x: number, z: number): boolean;
  isImpassableAt(x: number, z: number): boolean;
}

export interface SimulationBuildingDefinition {
  name: string;
  buildTimeSeconds: number;
}

export interface SimulationContext {
  playerSlot: string;
  mode: 'host' | 'single';
  map?: SimulationMap;
  gatherRadiusLimit: number;
  sustainableForestryEnabled: boolean;
  buildingDefinitions: Record<string, SimulationBuildingDefinition>;
  random(): number;
  createId(): string;
}

export type SimulationEffect =
  | { type: 'hit'; x: number; y: number; z: number; musket: boolean }
  | { type: 'construction-particles'; x: number; z: number }
  | { type: 'sound'; sound: 'combat-hit' | 'hammer' | 'building-completed' | 'unit-trained'; musket?: boolean; unitType?: Unit['type']; buildingType?: BuildingType }
  | { type: 'notification'; message: string; level: 'success' };

export interface SimulationTickResult {
  state: GameState;
  effects: SimulationEffect[];
}

const PLAYER_SLOTS = ['player1', 'player2', 'player3', 'player4'] as const;
const TICK_SECONDS = 0.05;

function findNearbyResource(
  nodes: GameState['resourceNodes'],
  unit: Unit,
  targetNode: GameState['resourceNodes'][number] | undefined,
  resourceType: GameState['resourceNodes'][number]['type'],
  anchor: { x: number; z: number },
  maxRadius: number
) {
  return nodes
    .filter((node) =>
      node.type === resourceType &&
      node.id !== targetNode?.id &&
      node.remaining > 0 &&
      !node.isRegrowing &&
      (maxRadius >= 999 || Math.hypot(node.position.x - anchor.x, node.position.z - anchor.z) <= maxRadius)
    )
    .sort((a, b) => {
      if (targetNode?.clusterId) {
        const aSame = a.clusterId === targetNode.clusterId ? 1 : 0;
        const bSame = b.clusterId === targetNode.clusterId ? 1 : 0;
        if (aSame !== bSame) return bSame - aSame;
      }
      return Math.hypot(a.position.x - unit.position.x, a.position.z - unit.position.z) -
        Math.hypot(b.position.x - unit.position.x, b.position.z - unit.position.z);
    })[0];
}

/** Advances one 20 Hz simulation step without React, Three.js, or external effects. */
export function tickGameState(state: GameState, context: SimulationContext): SimulationTickResult {
  const effects: SimulationEffect[] = [];
  let updatedUnits: Unit[] = state.units.map((unit) => ({
    ...unit,
    position: { ...unit.position },
    targetPosition: unit.targetPosition ? { ...unit.targetPosition } : null,
    gatherOrigin: unit.gatherOrigin ? { ...unit.gatherOrigin } : undefined,
  }));
  let updatedNodes = state.resourceNodes.map((node) => ({ ...node, position: { ...node.position } }));
  let updatedBuildings = state.buildings.map((building) => ({
    ...building,
    position: { ...building.position },
    trainingQueue: building.trainingQueue.map((item) => ({ ...item })),
  }));
  let updatedResources: GameState['playerResources'] = Object.fromEntries(
    Object.entries(state.playerResources).map(([slot, resources]) => [slot, { ...resources }])
  );

  updatedUnits = updatedUnits.map((unit) => {
    if (unit.targetPosition) {
      const dx = unit.targetPosition.x - unit.position.x;
      const dz = unit.targetPosition.z - unit.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.25) return { ...unit, targetPosition: null, state: 'idle' as const };

      const speed = unit.type === 'soldier' ? 0.2 : 0.16;
      const nextX = unit.position.x + (dx / distance) * speed;
      const nextZ = unit.position.z + (dz / distance) * speed;
      const isBoat = unit.type === 'fishing_boat' || unit.type === 'trade_boat';
      if (context.map) {
        if (isBoat && !context.map.isWaterAt(nextX, nextZ)) {
          return { ...unit, targetPosition: null, state: 'idle' as const };
        }
        if (!isBoat && context.map.isImpassableAt(nextX, nextZ)) {
          if (!context.map.isImpassableAt(nextX, unit.position.z)) {
            return { ...unit, position: { x: nextX, z: unit.position.z }, state: 'moving' as const };
          }
          if (!context.map.isImpassableAt(unit.position.x, nextZ)) {
            return { ...unit, position: { x: unit.position.x, z: nextZ }, state: 'moving' as const };
          }
          return { ...unit, targetPosition: null, state: 'idle' as const };
        }
      }
      return { ...unit, position: { x: nextX, z: nextZ }, state: 'moving' as const };
    }

    if (unit.state === 'gathering' && unit.targetEntityId) {
      const targetNode = updatedNodes.find((node) => node.id === unit.targetEntityId);
      let nextShiftRemaining = unit.gatherShiftSecondsRemaining;
      if (unit.gatherTimeLimitSeconds && unit.gatherTimeLimitSeconds > 0) {
        nextShiftRemaining = (unit.gatherShiftSecondsRemaining ?? unit.gatherTimeLimitSeconds) - TICK_SECONDS;
        if (nextShiftRemaining <= 0) {
          return { ...unit, state: 'idle' as const, targetEntityId: null, targetPosition: null, gatherShiftSecondsRemaining: undefined };
        }
      }

      if (targetNode && targetNode.remaining > 0 && !targetNode.isRegrowing) {
        const dx = targetNode.position.x - unit.position.x;
        const dz = targetNode.position.z - unit.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance > 1.8) {
          return {
            ...unit,
            position: { x: unit.position.x + (dx / distance) * 0.16, z: unit.position.z + (dz / distance) * 0.16 },
            gatherShiftSecondsRemaining: nextShiftRemaining,
          };
        }

        let gatherRate = 0.5;
        if (targetNode.type === 'tree' && updatedBuildings.some((building) => building.owner === unit.owner && building.type === 'sawmill' && building.isComplete)) {
          gatherRate *= 1.35;
        } else if (targetNode.type === 'gold_mine' && updatedBuildings.some((building) => building.owner === unit.owner && building.type === 'mine' && building.isComplete)) {
          gatherRate *= 1.4;
        } else if (targetNode.type === 'fish_school') {
          gatherRate = unit.type === 'fishing_boat' ? 1.0 : 0.65;
        }

        targetNode.remaining = Math.max(0, targetNode.remaining - gatherRate);
        const resourceKey = targetNode.type === 'tree' ? 'wood' : targetNode.type === 'gold_mine' ? 'gold' : 'food';
        if (updatedResources[unit.owner]) {
          updatedResources[unit.owner][resourceKey] += gatherRate;
        }

        if (targetNode.remaining <= 0) {
          if (targetNode.type === 'fish_school') targetNode.remaining = 600;
          const sustainableTree = targetNode.type === 'tree' &&
            (targetNode.harvestMode === 'sustainable' || (unit.owner === context.playerSlot && context.sustainableForestryEnabled));
          if (sustainableTree) {
            targetNode.harvestMode = 'sustainable';
            targetNode.isRegrowing = true;
            targetNode.regrowthProgress = 0;
            targetNode.remaining = 0;
          }

          const maxRadius = unit.gatherRadiusLimit || context.gatherRadiusLimit || 18;
          const anchor = unit.gatherOrigin || targetNode.position || unit.position;
          const nextTarget = findNearbyResource(updatedNodes, unit, targetNode, targetNode.type, anchor, maxRadius);
          if (nextTarget) {
            if (sustainableTree) nextTarget.harvestMode = 'sustainable';
            return { ...unit, targetEntityId: nextTarget.id, state: 'gathering' as const, gatherOrigin: anchor, gatherRadiusLimit: maxRadius, gatherShiftSecondsRemaining: nextShiftRemaining };
          }
          return { ...unit, state: 'idle' as const, targetEntityId: null, targetPosition: null, gatherOrigin: anchor, gatherRadiusLimit: maxRadius, gatherShiftSecondsRemaining: undefined };
        }
        return { ...unit, gatherShiftSecondsRemaining: nextShiftRemaining };
      }

      const resourceType = targetNode?.type || 'tree';
      const sustainableTree = resourceType === 'tree' &&
        (targetNode?.harvestMode === 'sustainable' || (unit.owner === context.playerSlot && context.sustainableForestryEnabled));
      const maxRadius = unit.gatherRadiusLimit || context.gatherRadiusLimit || 14;
      const anchor = unit.gatherOrigin || targetNode?.position || unit.position;
      const nextTarget = findNearbyResource(updatedNodes, unit, targetNode, resourceType, anchor, maxRadius);
      if (nextTarget) {
        if (sustainableTree) nextTarget.harvestMode = 'sustainable';
        return { ...unit, targetEntityId: nextTarget.id, state: 'gathering' as const, gatherOrigin: anchor, gatherRadiusLimit: maxRadius, gatherShiftSecondsRemaining: nextShiftRemaining };
      }
      return { ...unit, state: 'idle' as const, targetEntityId: null, targetPosition: null, gatherOrigin: anchor, gatherRadiusLimit: maxRadius, gatherShiftSecondsRemaining: undefined };
    }

    if (unit.state === 'attacking' && unit.targetEntityId) {
      const targetUnit = updatedUnits.find((candidate) => candidate.id === unit.targetEntityId);
      const targetBuilding = targetUnit ? undefined : updatedBuildings.find((candidate) => candidate.id === unit.targetEntityId);
      const target = targetUnit || targetBuilding;
      if (!target || target.health <= 0) return { ...unit, state: 'idle' as const, targetEntityId: null };

      const dx = target.position.x - unit.position.x;
      const dz = target.position.z - unit.position.z;
      const distance = Math.hypot(dx, dz);
      const attackRange = unit.type === 'soldier' ? (targetBuilding ? 5.5 : 4.5) : (targetBuilding ? 2.5 : 1.2);
      if (distance > attackRange) {
        return { ...unit, position: { x: unit.position.x + (dx / distance) * 0.18, z: unit.position.z + (dz / distance) * 0.18 } };
      }

      const cooldown = unit.attackCooldown ?? 0;
      if (cooldown > 0) return { ...unit, attackCooldown: cooldown - 1 };
      const musket = unit.type === 'soldier';
      target.health = Math.max(0, target.health - (musket ? 24 : 8));
      effects.push({ type: 'hit', x: target.position.x, y: targetBuilding ? 1.4 : 0.65, z: target.position.z, musket });
      effects.push({ type: 'sound', sound: 'combat-hit', musket });
      if (target.health <= 0) effects.push({ type: 'hit', x: target.position.x, y: targetBuilding ? 1.0 : 0.3, z: target.position.z, musket: false });
      return { ...unit, attackCooldown: musket ? 12 : 8 };
    }

    if (unit.state === 'building' && unit.targetEntityId) {
      const targetBuilding = updatedBuildings.find((building) => building.id === unit.targetEntityId);
      if (!targetBuilding || targetBuilding.isComplete || targetBuilding.health <= 0) {
        return { ...unit, state: 'idle' as const, targetEntityId: null };
      }
      const dx = targetBuilding.position.x - unit.position.x;
      const dz = targetBuilding.position.z - unit.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 2.4) {
        return { ...unit, position: { x: unit.position.x + (dx / distance) * 0.16, z: unit.position.z + (dz / distance) * 0.16 } };
      }

      const definition = context.buildingDefinitions[targetBuilding.type];
      const buildTime = definition?.buildTimeSeconds ?? 10;
      targetBuilding.buildProgress = Math.min(100, (targetBuilding.buildProgress || 0) + 100 / (buildTime * 20));
      targetBuilding.health = Math.round(targetBuilding.maxHealth * (0.1 + 0.9 * (targetBuilding.buildProgress / 100)));
      if (context.random() < 0.22) {
        effects.push({ type: 'construction-particles', x: targetBuilding.position.x, z: targetBuilding.position.z });
        if (targetBuilding.owner === context.playerSlot) effects.push({ type: 'sound', sound: 'hammer' });
      }
      if (targetBuilding.buildProgress >= 100) {
        targetBuilding.isComplete = true;
        targetBuilding.health = targetBuilding.maxHealth;
        if (targetBuilding.type === 'house' && updatedResources[targetBuilding.owner]) updatedResources[targetBuilding.owner].maxPop += 5;
        if (targetBuilding.owner === context.playerSlot) {
          effects.push({ type: 'sound', sound: 'building-completed', buildingType: targetBuilding.type });
          effects.push({ type: 'notification', message: `Construção Concluída: ${definition?.name ?? 'Edifício'}!`, level: 'success' });
        }
        return { ...unit, state: 'idle' as const, targetEntityId: null };
      }
    }
    return unit;
  });

  const deathsByOwner = countDeathsByOwner(updatedUnits);
  updatedUnits = updatedUnits.filter((unit) => unit.health > 0);
  for (const [owner, deaths] of Object.entries(deathsByOwner)) updatedResources = applyPopDelta(updatedResources, owner, -deaths);
  updatedBuildings = updatedBuildings.filter((building) => building.health > 0);

  updatedNodes = updatedNodes.map((node) => {
    if (!node.isRegrowing) return node;
    const progress = Math.min(100, (node.regrowthProgress || 0) + 0.28);
    return progress >= 100
      ? { ...node, isRegrowing: false, regrowthProgress: 100, remaining: node.maxCapacity || 150 }
      : { ...node, regrowthProgress: progress };
  }).filter((node) => node.remaining > 0 || node.isRegrowing);

  updatedBuildings = updatedBuildings.map((building) => {
    const currentItem = building.trainingQueue[0];
    if (!currentItem) return building;
    const progress = currentItem.progress + 2;
    if (progress < 100) {
      return { ...building, trainingQueue: [{ ...currentItem, progress }, ...building.trainingQueue.slice(1)] };
    }

    const isBoat = currentItem.unitType === 'fishing_boat' || currentItem.unitType === 'trade_boat';
    const maxHealth = isBoat ? 220 : currentItem.unitType === 'soldier' ? 150 : 100;
    updatedUnits.push({
      id: context.createId(),
      type: currentItem.unitType,
      owner: building.owner,
      position: {
        x: building.position.x + (isBoat ? 2.5 : context.random() * 2 + 2),
        z: building.position.z + (isBoat ? 2.5 : context.random() * 2 + 2),
      },
      targetPosition: null,
      targetEntityId: null,
      health: maxHealth,
      maxHealth,
      attackDamage: currentItem.unitType === 'soldier' ? 18 : 5,
      state: 'idle',
    });
    if (updatedResources[building.owner]) updatedResources = applyPopDelta(updatedResources, building.owner, 1);
    if (building.owner === context.playerSlot) effects.push({ type: 'sound', sound: 'unit-trained', unitType: currentItem.unitType });
    return { ...building, trainingQueue: building.trainingQueue.slice(1) };
  });

  updatedBuildings.forEach((building) => {
    if (building.type !== 'tower' || !building.isComplete || building.health <= 0) return;
    building.attackCooldown = Math.max(0, (building.attackCooldown || 0) - 1);
    if (building.attackCooldown > 0) return;
    let nearestEnemy: Unit | undefined;
    let nearestDistance = 12;
    for (const enemy of updatedUnits) {
      if (enemy.owner === building.owner || enemy.health <= 0) continue;
      const distance = Math.hypot(enemy.position.x - building.position.x, enemy.position.z - building.position.z);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestEnemy = enemy;
      }
    }
    if (!nearestEnemy) return;
    nearestEnemy.health = Math.max(0, nearestEnemy.health - 16);
    building.attackCooldown = 22;
    effects.push({ type: 'hit', x: nearestEnemy.position.x, y: 0.7, z: nearestEnemy.position.z, musket: true });
    effects.push({ type: 'sound', sound: 'combat-hit', musket: true });
  });

  for (const slot of PLAYER_SLOTS) {
    const resources = updatedResources[slot];
    if (!resources) continue;
    resources.food += updatedBuildings.filter((building) => building.owner === slot && building.type === 'farm' && building.isComplete && building.health > 0).length * 0.1;
    resources.gold += updatedBuildings.filter((building) => building.owner === slot && building.type === 'market' && building.isComplete && building.health > 0).length * 0.05;
    resources.gold += updatedUnits.filter((unit) => unit.owner === slot && unit.type === 'trade_boat' && unit.health > 0).length * 0.15;
  }

  if (context.mode === 'single') {
    const aiTownCenter = updatedBuildings.find((building) => building.owner === 'player2' && building.type === 'town_center');
    const aiUnits = updatedUnits.filter((unit) => unit.owner === 'player2');
    const aiResources = updatedResources.player2;
    if (aiTownCenter && aiTownCenter.trainingQueue.length === 0 && aiUnits.length < 8 && aiResources?.food >= 50) {
      aiResources.food -= 50;
      aiTownCenter.trainingQueue.push({ unitType: aiUnits.length % 2 === 0 ? 'soldier' : 'villager', progress: 0 });
    }
    aiUnits.forEach((unit) => {
      if (unit.state !== 'idle') return;
      if (unit.type === 'villager') {
        const nearestTree = updatedNodes.find((node) => node.type === 'tree');
        if (nearestTree) {
          unit.state = 'gathering';
          unit.targetEntityId = nearestTree.id;
        }
      } else if (unit.type === 'soldier' && aiUnits.filter((candidate) => candidate.type === 'soldier').length >= 3) {
        const playerTownCenter = updatedBuildings.find((building) => building.owner === 'player1');
        if (playerTownCenter) unit.targetPosition = { x: playerTownCenter.position.x + 2, z: playerTownCenter.position.z + 2 };
      }
    });
  }

  return {
    state: { units: updatedUnits, buildings: updatedBuildings, resourceNodes: updatedNodes, playerResources: updatedResources },
    effects,
  };
}
