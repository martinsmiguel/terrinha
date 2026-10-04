import { isBoatUnit, MAP_SIZE } from './engine';
import type { BuildingType, GameState, Unit, UnitType } from './engine';
import { applyCost, canAfford, refinePlanks, UNIT_COSTS } from './economy';
import { findPath, nextWaypoint } from './movement/pathfinding';
import { resolveSeparation } from './movement/separation';
import { applyPopDelta, countDeathsByOwner } from './population';
import { advanceResearch, gatherMultiplier, TECH_DEFS, unitDamageMultiplier } from './tech';
import type { TechState } from './tech';
import { evaluateMatch } from './victory';

export interface SimulationMap {
  isWaterAt(x: number, z: number): boolean;
  isImpassableAt(x: number, z: number): boolean;
  isOceanAt(x: number, z: number): boolean;
}

export interface SimulationBuildingDefinition {
  name: string;
  buildTimeSeconds: number;
}

export interface SimulationPath {
  goal: { x: number; z: number };
  path: { x: number; z: number }[];
}

export type SimulationPathCache = Map<string, SimulationPath>;

export interface SimulationContext {
  playerSlot: string;
  mode: 'host' | 'single';
  map?: SimulationMap;
  nearestOceanCell?(x: number, z: number): { x: number; z: number };
  pathCache?: SimulationPathCache;
  activeSlots?: string[];
  gatherRadiusLimit: number;
  sustainableForestryEnabled: boolean;
  buildingDefinitions: Record<string, SimulationBuildingDefinition>;
  random(): number;
  createId(): string;
}

export type SimulationEffect =
  | { type: 'hit'; x: number; y: number; z: number; musket: boolean }
  | { type: 'boat-sinking'; x: number; z: number }
  | { type: 'construction-particles'; x: number; z: number }
  | { type: 'sound'; sound: 'combat-hit' | 'hammer' | 'building-completed' | 'unit-trained'; musket?: boolean; unitType?: UnitType; buildingType?: BuildingType }
  | { type: 'notification'; message: string; level: 'success' };

export interface SimulationTickResult {
  state: GameState;
  effects: SimulationEffect[];
}

export const REPAIR_HP_PER_TICK = 4;
export const REPAIR_WOOD_PER_HP = 0.05;
export const REPAIR_REACH = 2.2;

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

  if (state.match?.status === 'finished') return { state, effects: [] };

  const playerSlot = context.playerSlot;
  const pMap = context.map;
  const pathCache: SimulationPathCache = context.pathCache ?? new Map<string, SimulationPath>();
  const activeSlots = context.activeSlots ?? [playerSlot];

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
  const updatedTechs: Record<string, TechState> = { ...(state.techs ?? {}) };

  updatedUnits = updatedUnits.map((unit) => {
    if (unit.targetPosition) {
      const goal = unit.targetPosition;
      const dx = goal.x - unit.position.x;
      const dz = goal.z - unit.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 0.25) {
        pathCache.delete(unit.id);
        return { ...unit, targetPosition: null, state: 'idle' as const };
      }

      const speed = unit.type === 'soldier' ? 0.2 : unit.type === 'cavalry' ? 0.3 : 0.16;
      const boat = isBoatUnit(unit.type);

      let heading = goal;
      if (pMap) {
        const pathFor = (from: { x: number; z: number }) => {
          const isBlocked = boat
            ? (x: number, z: number) => !pMap.isOceanAt(x, z)
            : (x: number, z: number) => pMap.isImpassableAt(x, z);
          return findPath(from, goal, isBlocked, { mapSize: MAP_SIZE, maxExpanded: 2400 });
        };

        const cached = pathCache.get(unit.id);
        if (!cached || cached.goal.x !== goal.x || cached.goal.z !== goal.z) {
          pathCache.set(unit.id, { goal: { x: goal.x, z: goal.z }, path: pathFor(unit.position) });
        }

        let cachedPath = pathCache.get(unit.id)?.path ?? [];
        if (cachedPath.length > 0 && nextWaypoint(unit.position, cachedPath) === null) {
          cachedPath = pathFor(unit.position);
          pathCache.set(unit.id, { goal: { x: goal.x, z: goal.z }, path: cachedPath });
        }

        const waypoint = cachedPath.length > 0 ? nextWaypoint(unit.position, cachedPath) : null;
        heading = waypoint ?? goal;
      }

      const hx = heading.x - unit.position.x;
      const hz = heading.z - unit.position.z;
      const headingDist = Math.sqrt(hx * hx + hz * hz);
      if (headingDist < 1e-6) {
        pathCache.delete(unit.id);
        return { ...unit, targetPosition: null, state: 'idle' as const };
      }

      const nextX = unit.position.x + (hx / headingDist) * speed;
      const nextZ = unit.position.z + (hz / headingDist) * speed;

      if (pMap) {
        if (boat) {
          if (!pMap.isOceanAt(nextX, nextZ)) {
            return { ...unit, targetPosition: null, state: 'idle' as const };
          }
        } else if (pMap.isImpassableAt(nextX, nextZ)) {
          if (!pMap.isImpassableAt(nextX, unit.position.z)) {
            return { ...unit, position: { x: nextX, z: unit.position.z }, state: 'moving' as const };
          } else if (!pMap.isImpassableAt(unit.position.x, nextZ)) {
            return { ...unit, position: { x: unit.position.x, z: nextZ }, state: 'moving' as const };
          } else {
            return { ...unit, targetPosition: null, state: 'idle' as const };
          }
        }
      }

      return { ...unit, position: { x: nextX, z: nextZ }, state: 'moving' as const };
    }

    if (unit.state === 'repairing' && unit.targetEntityId) {
      const targetId = unit.targetEntityId;
      const building = updatedBuildings.find((bd) => bd.id === targetId);
      if (!building || !building.isComplete || building.owner !== unit.owner || building.health >= building.maxHealth) {
        return { ...unit, state: 'idle' as const, targetEntityId: null, targetPosition: null };
      }

      const repairDx = building.position.x - unit.position.x;
      const repairDz = building.position.z - unit.position.z;
      const repairDistance = Math.sqrt(repairDx * repairDx + repairDz * repairDz);

      if (repairDistance > REPAIR_REACH) {
        const step = 0.16;
        const nextX = unit.position.x + (repairDx / repairDistance) * step;
        const nextZ = unit.position.z + (repairDz / repairDistance) * step;
        if (pMap && pMap.isImpassableAt(nextX, nextZ)) {
          return { ...unit, state: 'idle' as const, targetEntityId: null };
        }
        return { ...unit, position: { x: nextX, z: nextZ }, state: 'repairing' as const };
      }

      const ownerResources = updatedResources[unit.owner];
      const healed = Math.min(REPAIR_HP_PER_TICK, building.maxHealth - building.health);
      const woodCost = healed * REPAIR_WOOD_PER_HP;
      if (!ownerResources || healed <= 0 || ownerResources.wood < woodCost) {
        return { ...unit, state: 'idle' as const, targetEntityId: null };
      }

      updatedResources = {
        ...updatedResources,
        [unit.owner]: { ...ownerResources, wood: ownerResources.wood - woodCost },
      };
      updatedBuildings = updatedBuildings.map((bd) =>
        bd.id === building.id ? { ...bd, health: bd.health + healed } : bd
      );
      return { ...unit, state: 'repairing' as const };
    }

    if (unit.state === 'gathering' && unit.targetEntityId) {
      const targetNode = updatedNodes.find((node) => node.id === unit.targetEntityId);

      let nextShiftRemaining = unit.gatherShiftSecondsRemaining;
      if (unit.gatherTimeLimitSeconds && unit.gatherTimeLimitSeconds > 0) {
        const currentRemaining = unit.gatherShiftSecondsRemaining ?? unit.gatherTimeLimitSeconds;
        nextShiftRemaining = currentRemaining - TICK_SECONDS;
        if (nextShiftRemaining <= 0) {
          return {
            ...unit,
            state: 'idle' as const,
            targetEntityId: null,
            targetPosition: null,
            gatherShiftSecondsRemaining: undefined,
          };
        }
      }

      if (targetNode && targetNode.remaining > 0 && !targetNode.isRegrowing) {
        const dx = targetNode.position.x - unit.position.x;
        const dz = targetNode.position.z - unit.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 1.8) {
          const walkSpeed = 0.16;
          return {
            ...unit,
            position: {
              x: unit.position.x + (dx / dist) * walkSpeed,
              z: unit.position.z + (dz / dist) * walkSpeed,
            },
            gatherShiftSecondsRemaining: nextShiftRemaining,
          };
        }

        let gatherRate = 0.5;
        if (targetNode.type === 'tree') {
          const hasSawmill = updatedBuildings.some(
            (building) => building.owner === unit.owner && building.type === 'sawmill' && building.isComplete
          );
          if (hasSawmill) gatherRate *= 1.35;
        } else if (targetNode.type === 'gold_mine' || targetNode.type === 'stone') {
          const hasMine = updatedBuildings.some(
            (building) => building.owner === unit.owner && building.type === 'mine' && building.isComplete
          );
          if (hasMine) gatherRate *= 1.4;
        } else if (targetNode.type === 'fish_school') {
          gatherRate = unit.type === 'fishing_boat' ? 1.0 : 0.65;
        }

        gatherRate *= gatherMultiplier(updatedTechs[unit.owner], targetNode.type);

        targetNode.remaining = Math.max(0, targetNode.remaining - gatherRate);

        const resKey =
          targetNode.type === 'tree'
            ? 'wood'
            : targetNode.type === 'gold_mine'
            ? 'gold'
            : targetNode.type === 'stone'
            ? 'stone'
            : 'food';
        if (updatedResources[unit.owner]) {
          updatedResources = {
            ...updatedResources,
            [unit.owner]: {
              ...updatedResources[unit.owner],
              [resKey]: updatedResources[unit.owner][resKey] + gatherRate,
            },
          };
        }

        if (targetNode.remaining <= 0) {
          if (targetNode.type === 'fish_school') {
            targetNode.remaining = 600;
          }

          const isSustainableTree =
            targetNode.type === 'tree' &&
            (targetNode.harvestMode === 'sustainable' ||
              (unit.owner === playerSlot && context.sustainableForestryEnabled));

          if (isSustainableTree) {
            targetNode.harvestMode = 'sustainable';
            targetNode.isRegrowing = true;
            targetNode.regrowthProgress = 0;
            targetNode.remaining = 0;
          }

          const maxRadius = unit.gatherRadiusLimit || context.gatherRadiusLimit || 18;
          const anchor = unit.gatherOrigin || targetNode.position || unit.position;
          const nextTarget = findNearbyResource(updatedNodes, unit, targetNode, targetNode.type, anchor, maxRadius);

          if (nextTarget) {
            if (isSustainableTree) nextTarget.harvestMode = 'sustainable';
            return {
              ...unit,
              targetEntityId: nextTarget.id,
              state: 'gathering' as const,
              gatherOrigin: anchor,
              gatherRadiusLimit: maxRadius,
              gatherTimeLimitSeconds: unit.gatherTimeLimitSeconds,
              gatherShiftSecondsRemaining: nextShiftRemaining,
            };
          }

          return {
            ...unit,
            state: 'idle' as const,
            targetEntityId: null,
            targetPosition: null,
            gatherOrigin: anchor,
            gatherRadiusLimit: maxRadius,
            gatherShiftSecondsRemaining: undefined,
          };
        }

        return { ...unit, gatherShiftSecondsRemaining: nextShiftRemaining };
      }

      const resType = targetNode?.type || 'tree';
      const isSustainableTree =
        resType === 'tree' &&
        ((targetNode && targetNode.harvestMode === 'sustainable') ||
          (unit.owner === playerSlot && context.sustainableForestryEnabled));

      const maxRadius = unit.gatherRadiusLimit || context.gatherRadiusLimit || 14;
      const anchor = unit.gatherOrigin || targetNode?.position || unit.position;
      const nextTarget = findNearbyResource(updatedNodes, unit, targetNode, resType, anchor, maxRadius);

      if (nextTarget) {
        if (isSustainableTree) nextTarget.harvestMode = 'sustainable';
        return {
          ...unit,
          targetEntityId: nextTarget.id,
          state: 'gathering' as const,
          gatherOrigin: anchor,
          gatherRadiusLimit: maxRadius,
          gatherTimeLimitSeconds: unit.gatherTimeLimitSeconds,
          gatherShiftSecondsRemaining: nextShiftRemaining,
        };
      }

      return {
        ...unit,
        state: 'idle' as const,
        targetEntityId: null,
        targetPosition: null,
        gatherOrigin: anchor,
        gatherRadiusLimit: maxRadius,
        gatherShiftSecondsRemaining: undefined,
      };
    }

    if (unit.state === 'attacking' && unit.targetEntityId) {
      const targetEnemy = updatedUnits.find((candidate) => candidate.id === unit.targetEntityId);
      const targetBuilding = !targetEnemy ? updatedBuildings.find((b) => b.id === unit.targetEntityId) ?? null : null;
      const target = targetEnemy || targetBuilding;

      if (target && target.health > 0) {
        const dx = target.position.x - unit.position.x;
        const dz = target.position.z - unit.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        const attackRange =
          unit.type === 'soldier'
            ? targetBuilding
              ? 5.5
              : 4.5
            : unit.type === 'cavalry'
            ? targetBuilding
              ? 3.5
              : 2.5
            : unit.type === 'warship'
            ? targetBuilding
              ? 5
              : 7
            : targetBuilding
            ? 2.5
            : 1.2;

        if (dist > attackRange) {
          const approachSpeed = unit.type === 'cavalry' ? 0.26 : unit.type === 'warship' ? 0.2 : 0.18;
          return {
            ...unit,
            position: {
              x: unit.position.x + (dx / dist) * approachSpeed,
              z: unit.position.z + (dz / dist) * approachSpeed,
            },
          };
        }

        const cooldown = unit.attackCooldown ?? 0;
        if (cooldown > 0) return { ...unit, attackCooldown: cooldown - 1 };

        const baseDamage =
          unit.type === 'soldier' ? 24 : unit.type === 'cavalry' ? 32 : unit.type === 'warship' ? 20 : 8;
        const damage = Math.round(baseDamage * unitDamageMultiplier(updatedTechs[unit.owner], unit.type));
        const prevHealth = target.health;
        target.health = Math.max(0, target.health - damage);

        const isMusket = unit.type === 'soldier';
        effects.push({
          type: 'hit',
          x: target.position.x,
          y: targetBuilding ? 1.4 : 0.65,
          z: target.position.z,
          musket: isMusket,
        });
        effects.push({ type: 'sound', sound: 'combat-hit', musket: isMusket });

        if (prevHealth > 0 && target.health <= 0) {
          if (targetEnemy && isBoatUnit(targetEnemy.type)) {
            effects.push({ type: 'boat-sinking', x: target.position.x, z: target.position.z });
          } else {
            effects.push({
              type: 'hit',
              x: target.position.x,
              y: targetBuilding ? 1.0 : 0.3,
              z: target.position.z,
              musket: false,
            });
          }
        }

        return { ...unit, attackCooldown: isMusket ? 12 : unit.type === 'warship' ? 16 : 8 };
      }

      return { ...unit, state: 'idle' as const, targetEntityId: null };
    }

    if (unit.state === 'building' && unit.targetEntityId) {
      const targetB = updatedBuildings.find((building) => building.id === unit.targetEntityId);
      if (targetB && !targetB.isComplete && targetB.health > 0) {
        const dx = targetB.position.x - unit.position.x;
        const dz = targetB.position.z - unit.position.z;
        const dist = Math.hypot(dx, dz);

        const buildRange = 2.4;
        if (dist > buildRange) {
          const walkSpeed = 0.16;
          return {
            ...unit,
            position: {
              x: unit.position.x + (dx / dist) * walkSpeed,
              z: unit.position.z + (dz / dist) * walkSpeed,
            },
          };
        }

        const bDef = context.buildingDefinitions[targetB.type];
        const buildTime = bDef ? bDef.buildTimeSeconds : 10;
        const progressDelta = 100 / (buildTime * 20);
        targetB.buildProgress = Math.min(100, (targetB.buildProgress || 0) + progressDelta);
        targetB.health = Math.round(targetB.maxHealth * (0.1 + 0.9 * (targetB.buildProgress / 100)));

        if (context.random() < 0.22) {
          effects.push({ type: 'construction-particles', x: targetB.position.x, z: targetB.position.z });
          if (targetB.owner === playerSlot) {
            effects.push({ type: 'sound', sound: 'hammer' });
          }
        }

        if (targetB.buildProgress >= 100) {
          targetB.isComplete = true;
          targetB.health = targetB.maxHealth;
          if (targetB.type === 'house' && updatedResources[targetB.owner]) {
            updatedResources[targetB.owner].maxPop += 5;
          }
          if (targetB.owner === playerSlot) {
            effects.push({ type: 'sound', sound: 'building-completed', buildingType: targetB.type });
            effects.push({
              type: 'notification',
              message: `Construção Concluída: ${bDef ? bDef.name : 'Edifício'}!`,
              level: 'success',
            });
          }
          return { ...unit, state: 'idle' as const, targetEntityId: null };
        }
      } else {
        return { ...unit, state: 'idle' as const, targetEntityId: null };
      }
    }

    return unit;
  });

  const deathsByOwner = countDeathsByOwner(updatedUnits);
  updatedUnits = updatedUnits.filter((unit) => unit.health > 0);
  const liveUnitIds = new Set(updatedUnits.map((unit) => unit.id));
  pathCache.forEach((_, id) => {
    if (!liveUnitIds.has(id)) pathCache.delete(id);
  });
  for (const owner of Object.keys(deathsByOwner)) {
    updatedResources = applyPopDelta(updatedResources, owner, -deathsByOwner[owner]);
  }

  updatedBuildings = updatedBuildings.filter((building) => building.health > 0);

  updatedNodes = updatedNodes
    .map((node) => {
      if (node.isRegrowing) {
        const nextProgress = Math.min(100, (node.regrowthProgress || 0) + 0.28);
        if (nextProgress >= 100) {
          return {
            ...node,
            isRegrowing: false,
            regrowthProgress: 100,
            remaining: node.maxCapacity || 150,
          };
        }
        return { ...node, regrowthProgress: nextProgress };
      }
      return node;
    })
    .filter((node) => node.remaining > 0 || node.isRegrowing);

  updatedBuildings = updatedBuildings.map((building) => {
    if (building.trainingQueue.length === 0) return building;

    const currentItem = { ...building.trainingQueue[0] };
    currentItem.progress += 2;

    if (currentItem.progress < 100) {
      return {
        ...building,
        trainingQueue: [currentItem, ...building.trainingQueue.slice(1)],
      };
    }

    const boat = isBoatUnit(currentItem.unitType);
    const maxHp =
      currentItem.unitType === 'warship'
        ? 300
        : boat
        ? 220
        : currentItem.unitType === 'soldier'
        ? 150
        : currentItem.unitType === 'cavalry'
        ? 180
        : 100;
    const spawnX = building.position.x + (boat ? 2.5 : context.random() * 2 + 2);
    const spawnZ = building.position.z + (boat ? 2.5 : context.random() * 2 + 2);
    const newUnit: Unit = {
      id: context.createId(),
      type: currentItem.unitType,
      owner: building.owner,
      position: boat && context.nearestOceanCell
        ? context.nearestOceanCell(spawnX, spawnZ)
        : { x: spawnX, z: spawnZ },
      targetPosition: null,
      targetEntityId: null,
      health: maxHp,
      maxHealth: maxHp,
      attackDamage:
        currentItem.unitType === 'soldier'
          ? 18
          : currentItem.unitType === 'cavalry'
          ? 20
          : currentItem.unitType === 'warship'
          ? 24
          : 5,
      state: 'idle',
    };
    updatedUnits.push(newUnit);

    if (updatedResources[building.owner]) {
      updatedResources = applyPopDelta(updatedResources, building.owner, 1);
    }

    if (building.owner === playerSlot) {
      effects.push({ type: 'sound', sound: 'unit-trained', unitType: currentItem.unitType });
    }

    return { ...building, trainingQueue: building.trainingQueue.slice(1) };
  });

  updatedBuildings.forEach((building) => {
    if (building.type !== 'tower' || !building.isComplete || building.health <= 0) return;
    building.attackCooldown = Math.max(0, (building.attackCooldown || 0) - 1);
    if (building.attackCooldown > 0) return;

    let nearestEnemy: Unit | null = null;
    let nearestDist = 12;
    for (const enemy of updatedUnits) {
      if (enemy.owner === building.owner || enemy.health <= 0) continue;
      const dist = Math.hypot(enemy.position.x - building.position.x, enemy.position.z - building.position.z);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestEnemy = enemy;
      }
    }

    if (!nearestEnemy) return;
    nearestEnemy.health = Math.max(0, nearestEnemy.health - 16);
    building.attackCooldown = 22;
    effects.push({ type: 'hit', x: nearestEnemy.position.x, y: 0.7, z: nearestEnemy.position.z, musket: true });
    effects.push({ type: 'sound', sound: 'combat-hit', musket: true });
  });

  PLAYER_SLOTS.forEach((slot) => {
    const res = updatedResources[slot];
    if (!res) return;

    const completedFarms = updatedBuildings.filter(
      (building) => building.owner === slot && building.type === 'farm' && building.isComplete && building.health > 0
    ).length;
    if (completedFarms > 0) res.food += completedFarms * 0.1;

    const completedMarkets = updatedBuildings.filter(
      (building) => building.owner === slot && building.type === 'market' && building.isComplete && building.health > 0
    ).length;
    if (completedMarkets > 0) res.gold = (res.gold || 0) + completedMarkets * 0.05;

    const activeTradeBoats = updatedUnits.filter(
      (candidate) => candidate.owner === slot && candidate.type === 'trade_boat' && candidate.health > 0
    ).length;
    if (activeTradeBoats > 0) res.gold = (res.gold || 0) + activeTradeBoats * 0.15;

    const completedSawmills = updatedBuildings.filter(
      (building) => building.owner === slot && building.type === 'sawmill' && building.isComplete && building.health > 0
    ).length;
    if (completedSawmills > 0) {
      updatedResources[slot] = refinePlanks(res, completedSawmills);
    }
  });

  if (context.mode === 'single') {
    const aiSlots = activeSlots.filter((slot) => slot !== playerSlot);

    aiSlots.forEach((aiSlot) => {
      const aiTc = updatedBuildings.find((building) => building.owner === aiSlot && building.type === 'town_center');
      const aiUnits = updatedUnits.filter((candidate) => candidate.owner === aiSlot);
      const aiRes = updatedResources[aiSlot];
      if (!aiRes || !aiTc) return;

      if (aiTc.trainingQueue.length === 0 && aiUnits.length < 8) {
        const cycle: UnitType[] = ['soldier', 'villager', 'soldier', 'cavalry'];
        const trainType = cycle[aiUnits.length % cycle.length];
        const cost = UNIT_COSTS[trainType];
        if (canAfford(aiRes, cost)) {
          updatedResources[aiSlot] = applyCost(aiRes, cost);
          aiTc.trainingQueue.push({ unitType: trainType, progress: 0 });
        }
      }

      aiUnits.forEach((aiUnit) => {
        if (aiUnit.state !== 'idle') return;

        if (aiUnit.type === 'villager') {
          const nearestTree = updatedNodes.find((node) => node.type === 'tree');
          if (nearestTree) {
            aiUnit.state = 'gathering';
            aiUnit.targetEntityId = nearestTree.id;
          }
          return;
        }

        const soldiers = aiUnits.filter((candidate) => candidate.type === 'soldier').length;
        const cavalry = aiUnits.filter((candidate) => candidate.type === 'cavalry').length;
        const shouldMarch =
          (aiUnit.type === 'soldier' && soldiers >= 3) ||
          (aiUnit.type === 'cavalry' && (cavalry >= 2 || soldiers >= 3));
        if (shouldMarch) {
          const humanTc = updatedBuildings.find(
            (building) => building.owner === playerSlot && building.type === 'town_center'
          );
          if (humanTc) {
            aiUnit.targetPosition = { x: humanTc.position.x + 2, z: humanTc.position.z + 2 };
          }
        }
      });
    });
  }

  Object.keys(updatedTechs).forEach((slot) => {
    const before = updatedTechs[slot];
    if (!before) return;
    const after = advanceResearch(before, TICK_SECONDS);
    updatedTechs[slot] = after;
    if (slot !== playerSlot || after === before) return;

    if (after.completed.length > before.completed.length) {
      const techId = after.completed[after.completed.length - 1];
      const tech = TECH_DEFS.find((candidate) => candidate.id === techId);
      effects.push({
        type: 'notification',
        message: `Tecnologia pesquisada: ${tech?.name ?? techId}! (${tech?.description ?? ''})`,
        level: 'success',
      });
      effects.push({ type: 'sound', sound: 'building-completed', buildingType: 'market' });
    } else if (after.era !== before.era) {
      effects.push({
        type: 'notification',
        message: `Avanço de era concluído: ${after.era}!`,
        level: 'success',
      });
      effects.push({ type: 'sound', sound: 'building-completed', buildingType: 'town_center' });
    }
  });

  if (pMap && updatedUnits.length > 1) {
    const movedPositions = new Map<string, { x: number; z: number }>();
    const relax = (units: Unit[], isBlocked: (x: number, z: number) => boolean) => {
      if (units.length < 2) return;
      const resolved = resolveSeparation(
        units.map((unit) => ({ id: unit.id, x: unit.position.x, z: unit.position.z })),
        { mapSize: MAP_SIZE, isBlocked }
      );
      resolved.forEach((pos, index) => {
        const unit = units[index];
        if (pos.x !== unit.position.x || pos.z !== unit.position.z) {
          movedPositions.set(unit.id, { x: pos.x, z: pos.z });
        }
      });
    };
    relax(updatedUnits.filter((unit) => !isBoatUnit(unit.type)), (x, z) => pMap.isImpassableAt(x, z));
    relax(updatedUnits.filter((unit) => isBoatUnit(unit.type)), (x, z) => !pMap.isOceanAt(x, z));
    if (movedPositions.size > 0) {
      updatedUnits = updatedUnits.map((unit) => {
        const pos = movedPositions.get(unit.id);
        return pos ? { ...unit, position: pos } : unit;
      });
    }
  }

  return {
    state: {
      ...state,
      units: updatedUnits,
      buildings: updatedBuildings,
      resourceNodes: updatedNodes,
      playerResources: updatedResources,
      techs: updatedTechs,
      match:
        activeSlots.length >= 2
          ? evaluateMatch(updatedBuildings, activeSlots)
          : { status: 'running' as const, players: activeSlots },
    },
    effects,
  };
}
