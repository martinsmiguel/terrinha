import type { Building, BuildingType, GameState, PlayerResources, ResourceNode, Unit, UnitType } from './model';
import { BOAT_CAPACITY, isBoatUnit } from './model';
import { UNIT_ATTRIBUTES } from './unitAttributes';
import { BUILDING_CATALOG } from './buildingCatalog';
import { researchBlock } from './tech';
import { FOUNDATION_KIT, lifePhase } from './foundation';
import { UNIT_COSTS, tradeResource, type MarketResourceType } from './economy';

export const PLAYER_SLOTS = ['player1', 'player2', 'player3', 'player4'] as const;
export type PlayerSlot = (typeof PLAYER_SLOTS)[number];

const MAP_LIMIT = 60;
const MAX_ID_LENGTH = 128;
const BUILDING_TYPES = Object.keys(BUILDING_CATALOG).filter((type) => type !== 'town_center');
const UNIT_TYPES = ['villager', 'soldier', 'cavalry', 'fishing_boat', 'trade_boat', 'warship'];
const RESOURCE_KEYS = ['wood', 'food', 'gold', 'stone', 'planks'] as const;

export function canAffordResources(resources: PlayerResources, cost: Partial<PlayerResources>): boolean {
  return RESOURCE_KEYS.every((key) => resources[key] >= (cost[key] ?? 0));
}

export function deductResourceCost(resources: PlayerResources, cost: Partial<PlayerResources>): PlayerResources {
  const next = { ...resources };
  RESOURCE_KEYS.forEach((key) => {
    next[key] -= cost[key] ?? 0;
  });
  return next;
}

export interface JoinRoomRequest {
  roomId: string;
  playerName: string;
  playerSlot: PlayerSlot;
  isHost: boolean;
}

export interface RoomMember {
  playerSlot?: string;
  isHost?: boolean;
}

type Position = { x: number; z: number };
type BuildableType = Exclude<BuildingType, 'town_center'>;
type TrainableType = UnitType;

interface CommandMetadata {
  playerSlot?: PlayerSlot;
  senderId?: string;
}

/**
 * Participantes do modo solo: o jogador humano vem primeiro e os slots
 * restantes sao preenchidos ate o tamanho escolhido (2, 3 ou 4 jogadores).
 */
export function soloMatchSlots(humanSlot: PlayerSlot, matchSize: number): PlayerSlot[] {
  return [humanSlot, ...PLAYER_SLOTS.filter((slot) => slot !== humanSlot)].slice(0, matchSize);
}

export type NetworkCommand = CommandMetadata & (
  | { type: 'move'; unitId: string; target: Position }
  | { type: 'gather'; unitId: string; targetId: string; origin?: Position; radiusLimit?: number; timeLimitSeconds?: number }
  | { type: 'set_work_zone'; unitIds: string[]; radiusLimit?: number; origin?: Position }
  | { type: 'attack' | 'build_order'; unitId: string; targetId: string }
  | { type: 'build'; buildingType: BuildableType; owner: PlayerSlot; position: Position; builderIds?: string[] }
  | { type: 'train'; buildingId: string; unitType: TrainableType }
  | { type: 'cancel_train'; buildingId: string; index: number }
  | { type: 'research'; id: string }
  | { type: 'repair'; unitId: string; buildingId: string }
  | { type: 'demolish'; buildingId: string }
  | { type: 'set_resource_mode'; resourceId: string; mode: 'clear_cut' | 'sustainable' }
  | { type: 'set_grove_mode'; clusterId?: string; treeIds?: string[]; mode: 'clear_cut' | 'sustainable' }
  | { type: 'set_colony_forestry'; enabled: boolean }
  | { type: 'remove_resource'; resourceId: string }
  | { type: 'embark'; unitIds: string[]; boatId: string }
  | { type: 'disembark'; boatId: string }
  | { type: 'trade'; resource: MarketResourceType; action: 'buy' | 'sell'; amount: number }
  | { type: 'found_capital'; wagonId: string; position: Position }
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_ID_LENGTH;
}

export function isPlayerSlot(value: unknown): value is PlayerSlot {
  return typeof value === 'string' && PLAYER_SLOTS.includes(value as PlayerSlot);
}

function isPosition(value: unknown): value is Position {
  return (
    isRecord(value) &&
    typeof value.x === 'number' && Number.isFinite(value.x) && value.x >= 0 && value.x <= MAP_LIMIT &&
    typeof value.z === 'number' && Number.isFinite(value.z) && value.z >= 0 && value.z <= MAP_LIMIT
  );
}

function isStringList(value: unknown, maxLength = 100): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= maxLength && value.every(isId);
}

function isOptionalPosition(value: unknown): boolean {
  return value === undefined || isPosition(value);
}

function isOptionalRadius(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1000);
}

function isMode(value: unknown): value is 'clear_cut' | 'sustainable' {
  return value === 'clear_cut' || value === 'sustainable';
}

export function isValidJoinRequest(value: unknown): value is JoinRoomRequest {
  if (!isRecord(value)) return false;
  return (
    hasOnlyKeys(value, ['roomId', 'playerName', 'playerSlot', 'isHost']) &&
    typeof value.roomId === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(value.roomId) &&
    typeof value.playerName === 'string' && value.playerName.trim().length > 0 && value.playerName.length <= 32 &&
    isPlayerSlot(value.playerSlot) &&
    typeof value.isHost === 'boolean'
  );
}

export function roomJoinError(request: JoinRoomRequest, members: RoomMember[]): string | null {
  if (members.length >= PLAYER_SLOTS.length) return 'A sala já atingiu o limite de quatro jogadores.';

  const hasHost = members.some((member) => member.isHost === true);
  if ((request.isHost && hasHost) || (!request.isHost && !hasHost)) {
    return request.isHost ? 'Esta sala já tem um anfitrião.' : 'Não há uma partida aberta com esse código.';
  }

  if (members.some((member) => member.playerSlot === request.playerSlot)) {
    return 'Esta civilização já foi escolhida por outro jogador.';
  }

  return null;
}

export function isValidNetworkCommand(value: unknown): value is NetworkCommand {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if ((value.playerSlot !== undefined && !isPlayerSlot(value.playerSlot)) || (value.senderId !== undefined && !isId(value.senderId))) {
    return false;
  }
  const allowedKeys = (...keys: string[]) => hasOnlyKeys(value, ['type', 'playerSlot', 'senderId', ...keys]);

  switch (value.type) {
    case 'move':
      return allowedKeys('unitId', 'target') && isId(value.unitId) && isPosition(value.target);
    case 'gather':
      return (
        allowedKeys('unitId', 'targetId', 'origin', 'radiusLimit', 'timeLimitSeconds') &&
        isId(value.unitId) && isId(value.targetId) && isOptionalPosition(value.origin) &&
        isOptionalRadius(value.radiusLimit) &&
        (value.timeLimitSeconds === undefined || (typeof value.timeLimitSeconds === 'number' && Number.isFinite(value.timeLimitSeconds) && value.timeLimitSeconds >= 0 && value.timeLimitSeconds <= 86400))
      );
    case 'set_work_zone':
      return allowedKeys('unitIds', 'radiusLimit', 'origin') && isStringList(value.unitIds) && isOptionalRadius(value.radiusLimit) && isOptionalPosition(value.origin);
    case 'attack':
    case 'build_order':
      return allowedKeys('unitId', 'targetId') && isId(value.unitId) && isId(value.targetId);
    case 'build':
      return (
        allowedKeys('buildingType', 'owner', 'position', 'builderIds') &&
        typeof value.buildingType === 'string' && BUILDING_TYPES.includes(value.buildingType) &&
        isPlayerSlot(value.owner) && isPosition(value.position) &&
        (value.builderIds === undefined || (Array.isArray(value.builderIds) && value.builderIds.length <= 100 && value.builderIds.every(isId)))
      );
    case 'train':
      return allowedKeys('buildingId', 'unitType') && isId(value.buildingId) && typeof value.unitType === 'string' && UNIT_TYPES.includes(value.unitType);
    case 'cancel_train':
      return allowedKeys('buildingId', 'index') && isId(value.buildingId) && Number.isSafeInteger(value.index) && Number(value.index) >= 0 && Number(value.index) < 5;
    case 'research':
      return allowedKeys('id') && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 48;
    case 'repair':
      return allowedKeys('unitId', 'buildingId') && isId(value.unitId) && isId(value.buildingId);
    case 'demolish':
      return allowedKeys('buildingId') && isId(value.buildingId);
    case 'set_resource_mode':
      return allowedKeys('resourceId', 'mode') && isId(value.resourceId) && isMode(value.mode);
    case 'set_grove_mode':
      return (
        allowedKeys('clusterId', 'treeIds', 'mode') &&
        (value.clusterId === undefined || isId(value.clusterId)) &&
        (value.treeIds === undefined || (Array.isArray(value.treeIds) && value.treeIds.length <= 100 && value.treeIds.every(isId))) &&
        (value.clusterId !== undefined || (Array.isArray(value.treeIds) && value.treeIds.length > 0)) &&
        isMode(value.mode)
      );
    case 'set_colony_forestry':
      return allowedKeys('enabled') && typeof value.enabled === 'boolean';
    case 'remove_resource':
      return allowedKeys('resourceId') && isId(value.resourceId);
    case 'embark':
      return allowedKeys('unitIds', 'boatId') && isStringList(value.unitIds) && new Set(value.unitIds).size === value.unitIds.length && isId(value.boatId);
    case 'disembark':
      return allowedKeys('boatId') && isId(value.boatId);
    case 'found_capital':
      return allowedKeys('wagonId', 'position') && isId(value.wagonId) && isPosition(value.position);
    case 'trade':
      return (
        allowedKeys('resource', 'action', 'amount') &&
        (value.resource === 'wood' || value.resource === 'food' || value.resource === 'stone') &&
        (value.action === 'buy' || value.action === 'sell') &&
        typeof value.amount === 'number' &&
        Number.isInteger(value.amount) &&
        value.amount >= 1 &&
        value.amount <= 1000
      );
    default:
      return false;
  }
}

function ownsUnit(state: GameState, unitId: string, owner: PlayerSlot): Unit | undefined {
  return state.units.find((unit) => unit.id === unitId && unit.owner === owner);
}

function ownsBuilding(state: GameState, buildingId: string, owner: PlayerSlot): Building | undefined {
  return state.buildings.find((building) => building.id === buildingId && building.owner === owner);
}

function canAffordTraining(state: GameState, building: Building, unitType: TrainableType): boolean {
  const resources = state.playerResources[building.owner];
  if (!resources || building.trainingQueue.length >= 5) return false;

  const queuedForOwner = state.buildings
    .filter((candidate) => candidate.owner === building.owner)
    .reduce((total, candidate) => total + candidate.trainingQueue.length, 0);
  if (resources.pop + queuedForOwner >= resources.maxPop) return false;

  return canAffordResources(resources, UNIT_COSTS[unitType]);
}

export function isAuthorizedPlayerCommand(
  state: GameState,
  value: unknown,
  owner: PlayerSlot
): value is NetworkCommand {
  if (!isValidNetworkCommand(value)) return false;

  switch (value.type) {
    case 'found_capital': {
      const kit = state.foundationKits?.[owner];
      return (
        ownsUnit(state, value.wagonId, owner)?.type === 'wagon' &&
        lifePhase(owner, state.buildings, state.units) === 'arriving' &&
        Boolean(kit && kit.wood >= FOUNDATION_KIT.wood && kit.stone >= FOUNDATION_KIT.stone)
      );
    }
    case 'move':
      return Boolean(ownsUnit(state, value.unitId, owner));
    case 'gather': {
      const unit = ownsUnit(state, value.unitId, owner);
      const node = state.resourceNodes.find((resource) => resource.id === value.targetId && resource.remaining > 0);
      if (!unit || !node) return false;
      return unit.type === 'villager'
        ? node.type !== 'fish_school'
        : unit.type === 'fishing_boat' && node.type === 'fish_school';
    }
    case 'set_work_zone':
      return value.unitIds.every((id) => {
        const unit = ownsUnit(state, id, owner);
        return unit?.type === 'villager';
      });
    case 'attack': {
      const attacker = ownsUnit(state, value.unitId, owner);
      if (!attacker) return false;
      if (!UNIT_ATTRIBUTES[attacker.type].canAttack) return false;
      const targetId = value.targetId;
      const targetUnit = state.units.find((unit) => unit.id === targetId);
      const targetBuilding = state.buildings.find((building) => building.id === targetId);
      // Barcos so enfrentam embarcacoes inimigas: nunca encostam em terra.
      if (isBoatUnit(attacker.type)) {
        return Boolean(targetUnit && targetUnit.owner !== owner && isBoatUnit(targetUnit.type));
      }
      return Boolean((targetUnit && targetUnit.owner !== owner) || (targetBuilding && targetBuilding.owner !== owner));
    }
    case 'build_order': {
      const unit = ownsUnit(state, value.unitId, owner);
      const building = ownsBuilding(state, value.targetId, owner);
      return unit?.type === 'villager' && Boolean(building);
    }
    case 'build': {
      if (value.owner !== owner) return false;
      const def = BUILDING_CATALOG[value.buildingType];
      const resources = state.playerResources[owner];
      if (!def || !resources || !canAffordResources(resources, def.cost)) return false;
      return (value.builderIds || []).every((id) => ownsUnit(state, id, owner)?.type === 'villager');
    }
    case 'train': {
      const building = ownsBuilding(state, value.buildingId, owner);
      if (!building || !building.isComplete || !canAffordTraining(state, building, value.unitType)) return false;
      return (
        (building.type === 'town_center' && value.unitType === 'villager') ||
        (building.type === 'barracks' && (value.unitType === 'soldier' || value.unitType === 'cavalry')) ||
        (building.type === 'dock' && isBoatUnit(value.unitType))
      );
    }
    case 'cancel_train': {
      const building = ownsBuilding(state, value.buildingId, owner);
      return Boolean(building && value.index < building.trainingQueue.length);
    }
    case 'repair': {
      const unit = ownsUnit(state, value.unitId, owner);
      const building = ownsBuilding(state, value.buildingId, owner);
      if (!unit || unit.type !== 'villager' || !building || !building.isComplete) return false;
      return building.health < building.maxHealth;
    }
    case 'demolish': {
      const building = ownsBuilding(state, value.buildingId, owner);
      if (!building) return false;
      return building.type !== 'town_center';
    }
    case 'set_resource_mode':
      return state.resourceNodes.some((resource) => resource.id === value.resourceId && resource.type === 'tree');
    case 'set_grove_mode': {
      const treeIds = value.treeIds;
      const trees = treeIds?.every((id) => state.resourceNodes.some((resource) => resource.id === id && resource.type === 'tree')) ?? true;
      const clusterExists = value.clusterId === undefined || state.resourceNodes.some((resource) => resource.clusterId === value.clusterId);
      return trees && clusterExists;
    }
    case 'research': {
      const techState = state.techs?.[owner];
      const resources = state.playerResources[owner];
      if (!techState || !resources) return false;
      return researchBlock(techState, value.id, resources) === null;
    }
    case 'set_colony_forestry':
      return true;
    case 'remove_resource':
      return state.resourceNodes.some((resource: ResourceNode) => resource.id === value.resourceId);
    case 'embark': {
      const boat = ownsUnit(state, value.boatId, owner);
      if (!boat || !isBoatUnit(boat.type)) return false;
      if (BOAT_CAPACITY[boat.type] <= 0) return false;
      return value.unitIds.every((unitId) => {
        const unit = ownsUnit(state, unitId, owner);
        return Boolean(unit) && !isBoatUnit((unit as Unit).type);
      });
    }
    case 'disembark': {
      const boat = ownsUnit(state, value.boatId, owner);
      return Boolean(boat && isBoatUnit(boat.type) && (boat.passengers?.length ?? 0) > 0);
    }
    case 'trade': {
      const resources = state.playerResources[owner];
      if (!resources) return false;
      return tradeResource(resources, value.resource, value.action, value.amount).ok;
    }
    default:
      return false;
  }
}

/**
 * Convidados não sustentam a partida: se quem saiu era o host, a sessão termina para todos.
 * Quando o convidado sai, o host conserva as últimas ordens dele, sem IA nem retomada automática.
 */
export function hostLeftSessionMessage(role: 'host' | 'client' | 'single', leaver: { isHost?: boolean }): string | null {
  return role === 'client' && leaver.isHost === true ? 'O host saiu da partida. A sessão foi encerrada.' : null;
}
