import type { Building, BuildingType, GameState, PlayerResources, ResourceNode, Unit, UnitType } from './model';
import { BOAT_CAPACITY, isBoatUnit, worldSizeOf } from './model';
import { UNIT_ATTRIBUTES } from './unitAttributes';
import { BUILDING_CATALOG } from './buildingCatalog';
import { researchBlock } from './tech';
import { FOUNDATION_KIT, lifePhase } from './foundation';
import { canTarget, type OwnerVision } from './visionAuthority';
import { bodyOf, type BodyId } from './bodyModel';
import { canBuyTalent, effectiveBuildCost } from './talents';
import { outpostSpacingReason } from './colonies';
import { previewKit, previewLoad } from './colonialTransport';
import { redirectRoute, routeProblems, type RouteLeg, type RoutePort } from './tradeRoutes';
import { HOME, canPayAt, depotsIn, tradeAt, type LocalityResolver } from './depots';
import { UNIT_COSTS, tradeResource, type MarketResourceType } from './economy';

export const PLAYER_SLOTS = ['player1', 'player2', 'player3', 'player4'] as const;
export type PlayerSlot = (typeof PLAYER_SLOTS)[number];

const MAP_LIMIT = 60;
const MAX_ID_LENGTH = 128;
const BUILDING_TYPES = Object.keys(BUILDING_CATALOG).filter((type) => type !== 'town_center');
const UNIT_TYPES = ['villager', 'soldier', 'cavalry', 'fishing_boat', 'trade_boat', 'warship', 'colonial_transport'];
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
  | { type: 'load_cargo'; boatId: string; cargo: Partial<Record<'wood' | 'food' | 'gold' | 'stone' | 'planks', number>> }
  | { type: 'load_kit'; boatId: string }
  | { type: 'buy_talent'; id: string }
  | { type: 'set_route'; boatId: string; a: RoutePort; b: RoutePort; outbound: RouteLeg; back: RouteLeg | null; partial?: boolean }
  | { type: 'cancel_route'; boatId: string }
  | { type: 'pause_route' | 'resume_route'; boatId: string }
  | { type: 'redirect_route'; boatId: string; end: 'a' | 'b'; port: RoutePort }
  | { type: 'trade'; resource: MarketResourceType; action: 'buy' | 'sell'; amount: number; marketId?: string }
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

function isPositionWithin(value: unknown, limit: number): value is Position {
  return (
    isRecord(value) &&
    typeof value.x === 'number' && Number.isFinite(value.x) && value.x >= 0 && value.x <= limit &&
    typeof value.z === 'number' && Number.isFinite(value.z) && value.z >= 0 && value.z <= limit
  );
}

function isStringList(value: unknown, maxLength = 100): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= maxLength && value.every(isId);
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

/** Valida a forma do comando; as posições devem caber no mundo da sessão (padrão 60). */
export function isValidNetworkCommand(value: unknown, mapSize: number = MAP_LIMIT): value is NetworkCommand {
  const isPosition = (candidate: unknown): candidate is Position => isPositionWithin(candidate, mapSize);
  const isRoutePort = (candidate: unknown): boolean =>
    isRecord(candidate) && hasOnlyKeys(candidate, ['buildingId', 'berth']) && isId(candidate.buildingId) && isPosition(candidate.berth);
  const isRouteLeg = (candidate: unknown): boolean =>
    isRecord(candidate) && hasOnlyKeys(candidate, ['resource', 'amount']) && (RESOURCE_KEYS as readonly string[]).includes(candidate.resource as string)
    && typeof candidate.amount === 'number' && Number.isInteger(candidate.amount) && candidate.amount >= 1 && candidate.amount <= 1000;
  const isOptionalPosition = (candidate: unknown): boolean => candidate === undefined || isPosition(candidate);
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
    case 'load_cargo':
      return allowedKeys('boatId', 'cargo') && isId(value.boatId) && isRecord(value.cargo)
        && Object.entries(value.cargo).every(([key, amount]) => (RESOURCE_KEYS as readonly string[]).includes(key) && typeof amount === 'number' && Number.isInteger(amount) && amount >= 0 && amount <= 1000);
    case 'load_kit':
      return allowedKeys('boatId') && isId(value.boatId);
    case 'buy_talent':
      return allowedKeys('id') && isId(value.id);
    case 'set_route':
      return allowedKeys('boatId', 'a', 'b', 'outbound', 'back', 'partial') && isId(value.boatId) && isRoutePort(value.a) && isRoutePort(value.b)
        && isRouteLeg(value.outbound) && (value.back === null || isRouteLeg(value.back)) && (value.partial === undefined || typeof value.partial === 'boolean');
    case 'cancel_route':
    case 'pause_route':
    case 'resume_route':
      return allowedKeys('boatId') && isId(value.boatId);
    case 'redirect_route':
      return allowedKeys('boatId', 'end', 'port') && isId(value.boatId) && (value.end === 'a' || value.end === 'b') && isRoutePort(value.port);
    case 'found_capital':
      return allowedKeys('wagonId', 'position') && isId(value.wagonId) && isPosition(value.position);
    case 'trade':
      return (
        allowedKeys('resource', 'action', 'amount', 'marketId') &&
        (value.marketId === undefined || isId(value.marketId)) &&
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

/** Localidade que paga uma obra: a do local; o primeiro posto de uma ilha sem depósito é pago pela metrópole. */
export function payerLocality(state: GameState, owner: string, type: string, position: { x: number; z: number }, localityOf?: LocalityResolver): string {
  const locality = localityOf?.(owner, position) ?? HOME;
  if (locality !== HOME && type === 'outpost' && depotsIn(state.buildings, owner, locality, localityOf!, false).length === 0) return HOME;
  return locality;
}

function canAffordTraining(state: GameState, building: Building, unitType: TrainableType, localityOf?: LocalityResolver): boolean {
  const resources = state.playerResources[building.owner];
  if (!resources || building.trainingQueue.length >= 5) return false;

  const queuedForOwner = state.buildings
    .filter((candidate) => candidate.owner === building.owner)
    .reduce((total, candidate) => total + candidate.trainingQueue.length, 0);
  if (resources.pop + queuedForOwner >= resources.maxPop) return false;

  return canPayAt(state, building.owner, localityOf?.(building.owner, building.position) ?? HOME, UNIT_COSTS[unitType]);
}

/**
 * Autoriza um comando de jogador no host. Com `vision` (visão autoritativa por dono), o jogador só pode escolher como
 * alvo o que conhece: inimigos visíveis agora, recursos e terreno de construção já explorados. Sem `vision`, só vale a
 * posse e as demais regras.
 */
export function isAuthorizedPlayerCommand(
  state: GameState,
  value: unknown,
  owner: PlayerSlot,
  vision?: OwnerVision,
  terrain?: { canStandAt(body: BodyId, x: number, z: number): boolean; localityOf?: LocalityResolver }
): value is NetworkCommand {
  if (!isValidNetworkCommand(value, worldSizeOf(state))) return false;

  switch (value.type) {
    case 'found_capital': {
      const kit = state.foundationKits?.[owner];
      return (
        ownsUnit(state, value.wagonId, owner)?.type === 'wagon' &&
        lifePhase(owner, state.buildings, state.units) === 'arriving' &&
        Boolean(kit && kit.wood >= FOUNDATION_KIT.wood && kit.stone >= FOUNDATION_KIT.stone) &&
        canTarget(vision, owner, { position: value.position }, 'explored')
      );
    }
    case 'move': {
      const unit = ownsUnit(state, value.unitId, owner);
      if (!unit) return false;
      // Mouse e rede usam a mesma consulta de corpo: destino em que o corpo terrestre nunca poderia estar é recusado.
      // Barcos são tratados pelo host, que leva o destino ao oceano navegável mais próximo.
      const body = bodyOf(unit.type);
      return body === 'boat' || !terrain || terrain.canStandAt(body, value.target.x, value.target.z);
    }
    case 'gather': {
      const unit = ownsUnit(state, value.unitId, owner);
      const node = state.resourceNodes.find((resource) => resource.id === value.targetId && resource.remaining > 0);
      if (!unit || !node) return false;
      if (!canTarget(vision, owner, node, 'explored')) return false;
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
        return Boolean(targetUnit && targetUnit.owner !== owner && isBoatUnit(targetUnit.type) && canTarget(vision, owner, targetUnit, 'visible'));
      }
      // Unidade inimiga: só enquanto visível. Edifício inimigo: basta já ter sido explorado (a posição não muda).
      return Boolean(
        (targetUnit && targetUnit.owner !== owner && canTarget(vision, owner, targetUnit, 'visible')) ||
        (targetBuilding && targetBuilding.owner !== owner && canTarget(vision, owner, targetBuilding, 'explored'))
      );
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
      if (!def || !resources || !canPayAt(state, owner, payerLocality(state, owner, value.buildingType, value.position, terrain?.localityOf), effectiveBuildCost(state, owner, value.buildingType, def.cost))) return false;
      if (!canTarget(vision, owner, { position: value.position }, 'explored')) return false;
      if (value.buildingType === 'outpost') {
        // Posto avançado: solo transitável conhecido e distância mínima de outros postos e da capital própria.
        if (terrain && !terrain.canStandAt('human', value.position.x, value.position.z)) return false;
        if (outpostSpacingReason(value.position, owner, state.buildings)) return false;
      }
      return (value.builderIds || []).every((id) => ownsUnit(state, id, owner)?.type === 'villager');
    }
    case 'train': {
      const building = ownsBuilding(state, value.buildingId, owner);
      if (!building || !building.isComplete || !canAffordTraining(state, building, value.unitType, terrain?.localityOf)) return false;
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
    case 'buy_talent':
      // O host valida nível, pré-requisito, pontos e ID único; recusa não debita nem repete.
      return canBuyTalent(state, owner, value.id).ok;
    case 'load_cargo':
    case 'load_kit': {
      const boat = ownsUnit(state, value.boatId, owner);
      if (!boat || !isBoatUnit(boat.type) || !terrain?.localityOf) return false;
      const locality = terrain.localityOf(owner, boat.position);
      return (value.type === 'load_kit'
        ? previewKit(state, boat.id, locality, terrain.localityOf)
        : previewLoad(state, boat.id, locality, value.cargo, terrain.localityOf)).ok;
    }
    case 'set_route': {
      const boat = ownsUnit(state, value.boatId, owner);
      return Boolean(boat) && routeProblems(state, value.boatId, value).length === 0;
    }
    case 'cancel_route': {
      const boat = ownsUnit(state, value.boatId, owner);
      return Boolean(boat?.route);
    }
    case 'pause_route':
    case 'resume_route': {
      const boat = ownsUnit(state, value.boatId, owner);
      return Boolean(boat?.route) && Boolean(boat?.route?.paused) === (value.type === 'resume_route');
    }
    case 'redirect_route': {
      const boat = ownsUnit(state, value.boatId, owner);
      return Boolean(boat?.route) && redirectRoute(state, value.boatId, value.end, value.port).problems.length === 0;
    }
    case 'disembark': {
      const boat = ownsUnit(state, value.boatId, owner);
      return Boolean(boat && isBoatUnit(boat.type) && (boat.passengers?.length ?? 0) > 0);
    }
    case 'trade': {
      const resources = state.playerResources[owner];
      if (!resources) return false;
      if (value.marketId !== undefined) {
        // Câmbio local: o mercado precisa ser próprio e concluído, e o saldo é o da ilha dele.
        const market = state.buildings.find((b) => b.id === value.marketId);
        if (!market || market.type !== 'market' || market.owner !== owner || !market.isComplete || market.health <= 0 || !terrain?.localityOf) return false;
        return tradeAt(state, owner, terrain.localityOf(owner, market.position), value.resource, value.action, value.amount).ok;
      }
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
