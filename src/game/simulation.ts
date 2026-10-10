import { isBoatUnit, worldSizeOf } from './model';
import { boardArrivedPassengers } from './navalTransport';
import type { BuildingType, GameState, Unit, UnitType } from './model';
import { applyCost, canAfford, refinePlanks, UNIT_COSTS } from './economy';
import { findDockOceanSpawnCell } from './dockPlacement';
import { consumeReachedWaypoints, findPath } from './movement/pathfinding';
import { resolveSeparation } from './movement/separation';
import { stepToward } from './movement/step';
import { applyPopDelta, countDeathsByOwner } from './population';
import { advanceResearch, gatherMultiplier, TECH_DEFS, unitDamageMultiplier } from './tech';
import type { TechState } from './tech';
import { evaluateMatch } from './victory';
import { advanceFoundation, clearEliminatedOrders, lifePhase } from './foundation';
import { canTarget, type OwnerVision } from './visionAuthority';
import { bodyOf, moveCost, type BodyId, type Surface } from './bodyModel';
import { UNIT_ATTRIBUTES, effectiveAttribute, unitAttribute, type RuleSettings } from './unitAttributes';

export interface SimulationMap {
  isWaterAt(x: number, z: number): boolean;
  isImpassableAt(x: number, z: number): boolean;
  isOceanAt(x: number, z: number): boolean;
  /** Modelo de corpos (opcional): vau dos corpos terrestres, calado dos barcos e superfície com profundidade. */
  canStandAt?(body: BodyId, x: number, z: number): boolean;
  isNavigableAt?(x: number, z: number): boolean;
  surfaceAt?(x: number, z: number): Surface;
}

/** Célula bloqueada para o corpo da unidade: calado para barcos, vau para os terrestres; sem o modelo, a regra legada. */
function blockedFor(type: UnitType, map: SimulationMap): (x: number, z: number) => boolean {
  const body = bodyOf(type);
  if (body === 'boat') return map.isNavigableAt ? (x, z) => !map.isNavigableAt!(x, z) : (x, z) => !map.isOceanAt(x, z);
  return map.canStandAt ? (x, z) => !map.canStandAt!(body, x, z) : (x, z) => map.isImpassableAt(x, z);
}

/** Custo de travessia para a rota (o raso custa mais que a terra seca); `undefined` sem superfície com profundidade. */
function costFor(type: UnitType, map: SimulationMap): ((x: number, z: number) => number) | undefined {
  if (!map.surfaceAt) return undefined;
  const body = bodyOf(type);
  return (x, z) => {
    const cost = moveCost(map.surfaceAt!(x, z), body);
    return Number.isFinite(cost) ? cost : 1;
  };
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
  ruleSettings?: RuleSettings;
  /** Visão e exploração por dono, mantidas no host. Sem ela, nenhum alvo é filtrado por visão. */
  vision?: OwnerVision;
  /** Fertilidade declarada do solo (perfil da ilha); multiplica o rendimento das fazendas. Sem ela, 1. */
  fertilityAt?(x: number, z: number): number;
  playerSlot: string;
  mode: 'host' | 'single';
  map?: SimulationMap;
  nearestOceanCell?(x: number, z: number, maxRadius?: number): { x: number; z: number };
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
  maxRadius: number,
  knows: (node: GameState['resourceNodes'][number]) => boolean = () => true
) {
  return nodes
    .filter((node) =>
      knows(node) &&
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

/**
 * Rota A* de `from` até `goal`. O A* trabalha em centros de célula: uma unidade de pé na borda legal de uma célula cujo
 * centro é intransitável (costa, margem de lago) teria rota vazia. Nesse caso a rota parte da vizinha livre mais próxima.
 */
function routeFrom(
  from: { x: number; z: number },
  goal: { x: number; z: number },
  isBlocked: (x: number, z: number) => boolean,
  mapSize: number,
  cost?: (x: number, z: number) => number
): { x: number; z: number }[] {
  const options = { mapSize, maxExpanded: 2400, cost };
  const direct = findPath(from, goal, isBlocked, options);
  if (direct.length > 0) return direct;
  const cellX = Math.floor(from.x);
  const cellZ = Math.floor(from.z);
  let best: { x: number; z: number } | null = null;
  let bestDistance = Infinity;
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      const center = { x: cellX + dx + 0.5, z: cellZ + dz + 0.5 };
      if (isBlocked(center.x, center.z)) continue;
      const distance = Math.hypot(center.x - from.x, center.z - from.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = center;
      }
    }
  }
  if (!best) return [];
  const rest = findPath(best, goal, isBlocked, options);
  return rest.length > 0 ? [best, ...rest] : [];
}

/** Advances one 20 Hz simulation step without React, Three.js, or external effects. */
export function tickGameState(state: GameState, context: SimulationContext): SimulationTickResult {
  const effects: SimulationEffect[] = [];
  const mapSize = worldSizeOf(state);

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
  updatedBuildings = updatedBuildings.map((building) => {
    const advanced = advanceFoundation(building);
    if (advanced.isComplete && !building.isComplete) {
      effects.push({ type: 'sound', sound: 'building-completed', buildingType: 'town_center' });
      if (building.owner === playerSlot) {
        effects.push({ type: 'notification', message: 'Capital fundada! O Centro da Vila está pronto.', level: 'success' });
      }
    }
    return advanced;
  });
  let updatedResources: GameState['playerResources'] = Object.fromEntries(
    Object.entries(state.playerResources).map(([slot, resources]) => [slot, { ...resources }])
  );
  const updatedTechs: Record<string, TechState> = { ...(state.techs ?? {}) };
  const ruleSettings = context.ruleSettings ?? state.ruleSettings;

  /**
   * Próximo passo de uma unidade rumo a `goal` nas ações de aproximação (coleta, obra, reparo e perseguição): segue em
   * linha reta enquanto o passo é legal e, quando o terreno bloqueia, segue a rota do A* (lago e rio entre a unidade e o
   * alvo não podem impedir a coleta). `null` quando não existe passo legal nem rota.
   */
  const routeStep = (unit: Unit, goal: { x: number; z: number }): { x: number; z: number } | null => {
    const speed = unitAttribute(unit.type, 'movePerTick', ruleSettings);
    if (!pMap) return stepToward(unit.type, unit.position, goal, speed, undefined);

    const cached = pathCache.get(unit.id);
    const followingRoute = Boolean(cached && cached.goal.x === goal.x && cached.goal.z === goal.z && cached.path.length > 0);
    if (!followingRoute) {
      const direct = stepToward(unit.type, unit.position, goal, speed, pMap);
      if (direct) return direct;
    }

    const pathFor = (from: { x: number; z: number }) =>
      routeFrom(from, goal, blockedFor(unit.type, pMap), mapSize, costFor(unit.type, pMap));
    if (!cached || cached.goal.x !== goal.x || cached.goal.z !== goal.z) {
      pathCache.set(unit.id, { goal: { x: goal.x, z: goal.z }, path: pathFor(unit.position) });
    }
    const before = pathCache.get(unit.id)?.path ?? [];
    let route = consumeReachedWaypoints(unit.position, before);
    if (before.length > 0 && route.length === 0) route = pathFor(unit.position);
    if (route !== before) pathCache.set(unit.id, { goal: { x: goal.x, z: goal.z }, path: route });
    if (route.length === 0) return null;
    return stepToward(unit.type, unit.position, route[0], speed, pMap);
  };

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

      const speed = unitAttribute(unit.type, 'movePerTick', ruleSettings);

      let heading = goal;
      if (pMap) {
        const pathFor = (from: { x: number; z: number }) =>
          routeFrom(from, goal, blockedFor(unit.type, pMap), mapSize, costFor(unit.type, pMap));

        const cached = pathCache.get(unit.id);
        if (!cached || cached.goal.x !== goal.x || cached.goal.z !== goal.z) {
          pathCache.set(unit.id, { goal: { x: goal.x, z: goal.z }, path: pathFor(unit.position) });
        }

        const before = pathCache.get(unit.id)?.path ?? [];
        let cachedPath = consumeReachedWaypoints(unit.position, before);
        // Fim de uma rota parcial: calcula o trecho seguinte a partir daqui.
        if (before.length > 0 && cachedPath.length === 0) cachedPath = pathFor(unit.position);
        if (cachedPath !== before) pathCache.set(unit.id, { goal: { x: goal.x, z: goal.z }, path: cachedPath });

        const waypoint = cachedPath.length > 0 ? cachedPath[0] : null;
        heading = waypoint ?? goal;
      }

      const hx = heading.x - unit.position.x;
      const hz = heading.z - unit.position.z;
      const headingDist = Math.sqrt(hx * hx + hz * hz);
      if (headingDist < 1e-6) {
        pathCache.delete(unit.id);
        return { ...unit, targetPosition: null, state: 'idle' as const };
      }

      const next = stepToward(unit.type, unit.position, heading, speed, pMap);
      if (!next) return { ...unit, targetPosition: null, state: 'idle' as const };
      return { ...unit, position: next, state: 'moving' as const };
    }

    return unit;
  });

  updatedUnits = boardArrivedPassengers(updatedUnits);

  updatedUnits = updatedUnits.map((unit) => {
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
        const next = routeStep(unit, building.position);
        if (!next) return { ...unit, state: 'idle' as const, targetEntityId: null };
        return { ...unit, position: next, state: 'repairing' as const };
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
          const next = routeStep(unit, targetNode.position);
          if (!next) {
            return {
              ...unit,
              state: 'idle' as const,
              targetEntityId: null,
              targetPosition: null,
              gatherShiftSecondsRemaining: undefined,
            };
          }
          return { ...unit, position: next, gatherShiftSecondsRemaining: nextShiftRemaining };
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

        const gathered = Math.min(gatherRate, targetNode.remaining);
        targetNode.remaining -= gathered;

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
              [resKey]: updatedResources[unit.owner][resKey] + gathered,
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
          const nextTarget = findNearbyResource(updatedNodes, unit, targetNode, targetNode.type, anchor, maxRadius, (node) => canTarget(context.vision, unit.owner, node, 'explored'));

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
      const nextTarget = findNearbyResource(updatedNodes, unit, targetNode, resType, anchor, maxRadius, (node) => canTarget(context.vision, unit.owner, node, 'explored'));

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
      const attributes = UNIT_ATTRIBUTES[unit.type];
      if (!attributes.canAttack) return { ...unit, state: 'idle' as const, targetEntityId: null };
      const targetEnemy = updatedUnits.find((candidate) => candidate.id === unit.targetEntityId);
      const targetBuilding = !targetEnemy ? updatedBuildings.find((b) => b.id === unit.targetEntityId) ?? null : null;
      const target = targetEnemy || targetBuilding;

      // Alvo inimigo fora de vista: a perseguição acaba. Unidade exige visão atual; edifício, só exploração.
      if (target && target.owner !== unit.owner && !canTarget(context.vision, unit.owner, target, targetEnemy ? 'visible' : 'explored')) {
        return { ...unit, state: 'idle' as const, targetEntityId: null, targetPosition: null };
      }

      if (target && target.health > 0) {
        const dx = target.position.x - unit.position.x;
        const dz = target.position.z - unit.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        const attackRange = targetBuilding ? attributes.attackRangeBuilding : attributes.attackRangeUnit;

        if (dist > attackRange) {
          const next = routeStep(unit, target.position);
          if (!next) return { ...unit, state: 'idle' as const, targetEntityId: null, targetPosition: null };
          return { ...unit, position: next };
        }

        const cooldown = unit.attackCooldown ?? 0;
        if (cooldown > 0) return { ...unit, attackCooldown: cooldown - 1 };

        const damage = Math.round(effectiveAttribute(unitAttribute(unit.type, 'attackDamage', ruleSettings), [],
          [unitDamageMultiplier(updatedTechs[unit.owner], unit.type) - 1]));
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

        return { ...unit, attackCooldown: attributes.attackCooldownTicks };
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
          const next = routeStep(unit, targetB.position);
          if (!next) return { ...unit, state: 'idle' as const, targetEntityId: null, targetPosition: null };
          return { ...unit, position: next };
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
    const maxHp = unitAttribute(currentItem.unitType, 'maxHealth', ruleSettings);
    const spawnX = building.position.x + (boat ? 2.5 : context.random() * 2 + 2);
    const spawnZ = building.position.z + (boat ? 2.5 : context.random() * 2 + 2);
    let spawnPosition: { x: number; z: number } = { x: spawnX, z: spawnZ };
    if (boat) {
      // Barco so nasce em oceano navegavel dentro da janela do cais: o raio e
      // limitado pela mesma janela da validacao de posicionamento, entao um
      // canal curto entre ilhas nunca vira teletransporte. Sem mapa nao ha
      // prova de navegabilidade, entao a fila aguarda sem criar unidade.
      const oceanCell = context.map
        ? findDockOceanSpawnCell(
            context.map.isNavigableAt ?? context.map.isOceanAt,
            building.position.x,
            building.position.z,
            spawnX,
            spawnZ
          )
        : null;
      // Um cais legado sem saída oceânica não pode criar barco em terra.
      // Preservar a fila (e o custo já pago) até existir um spawn válido.
      if (!oceanCell) return building;
      spawnPosition = oceanCell;
    }
    const newUnit: Unit = {
      id: context.createId(),
      type: currentItem.unitType,
      owner: building.owner,
      position: spawnPosition,
      targetPosition: null,
      targetEntityId: null,
      health: maxHp,
      maxHealth: maxHp,
      attackDamage: unitAttribute(currentItem.unitType, 'attackDamage', ruleSettings),
      state: 'idle',
      ...(boat ? { passengers: [] as Unit[] } : {}),
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
      if (!canTarget(context.vision, building.owner, enemy, 'visible')) continue;
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
    );
    // Cada fazenda rende 0,1 por passo vezes a fertilidade declarada da ilha onde está.
    for (const farm of completedFarms) res.food += 0.1 * (context.fertilityAt?.(farm.position.x, farm.position.z) ?? 1);

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
      if (!aiRes || !aiTc || !aiTc.isComplete) return;

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
          let nearestTree: (typeof updatedNodes)[number] | null = null;
          let nearestDistance = Infinity;
          for (const node of updatedNodes) {
            if (node.type !== 'tree') continue;
            if (!canTarget(context.vision, aiSlot, node, 'explored')) continue;
            const distanceToTc = Math.hypot(node.position.x - aiTc.position.x, node.position.z - aiTc.position.z);
            if (distanceToTc <= 18 && distanceToTc < nearestDistance) {
              nearestDistance = distanceToTc;
              nearestTree = node;
            }
          }
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
          // A IA só marcha contra o que já descobriu.
          if (humanTc && canTarget(context.vision, aiSlot, humanTc, 'explored')) {
            const goal = { x: humanTc.position.x + 2, z: humanTc.position.z + 2 };
            const distanceToHuman = Math.hypot(goal.x - aiUnit.position.x, goal.z - aiUnit.position.z);
            if (distanceToHuman > 26) return;
            const pathExists =
              !pMap ||
              findPath(aiUnit.position, goal, (x, z) => pMap.isImpassableAt(x, z), {
                mapSize,
                maxExpanded: 800,
              }).length > 0;
            if (pathExists) {
              aiUnit.targetPosition = goal;
            }
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
        { mapSize, isBlocked }
      );
      resolved.forEach((pos, index) => {
        const unit = units[index];
        if (pos.x !== unit.position.x || pos.z !== unit.position.z) {
          movedPositions.set(unit.id, { x: pos.x, z: pos.z });
        }
      });
    };
    // Cada corpo é empurrado só para onde ele pode estar: barcos pelo calado, os demais pelo próprio vau.
    for (const group of ['human', 'mount', 'cart', 'boat'] as const) {
      const members = updatedUnits.filter((unit) => bodyOf(unit.type) === group);
      if (members.length > 0) relax(members, blockedFor(members[0].type, pMap));
    }
    if (movedPositions.size > 0) {
      updatedUnits = updatedUnits.map((unit) => {
        const pos = movedPositions.get(unit.id);
        return pos ? { ...unit, position: pos } : unit;
      });
    }
  }

  // Eliminação só existe numa partida com pelo menos dois contendores (mesma regra da vitória).
  const eliminated = activeSlots.length >= 2
    ? activeSlots.filter((slot) => lifePhase(slot, updatedBuildings, updatedUnits) === 'eliminated')
    : [];
  if (eliminated.length > 0) {
    const cleared = clearEliminatedOrders(updatedUnits, updatedBuildings, eliminated);
    updatedUnits = cleared.units;
    updatedBuildings = cleared.buildings;
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
          ? evaluateMatch(updatedBuildings, activeSlots, updatedUnits)
          : { status: 'running' as const, players: activeSlots },
    },
    effects,
  };
}
