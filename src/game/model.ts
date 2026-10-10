import type { MatchStatus } from './victory';
import type { TechState } from './tech';
import type { RuleSettings } from './unitAttributes';

export type UnitType = 'villager' | 'soldier' | 'cavalry' | 'fishing_boat' | 'trade_boat' | 'warship' | 'wagon' | 'colonial_transport';

/** Unidades navais: navegam apenas na agua e enfrentam outras embarcacoes. */
export const BOAT_UNIT_TYPES: readonly UnitType[] = ['fishing_boat', 'trade_boat', 'warship', 'colonial_transport'];

export const isBoatUnit = (type: UnitType): boolean => BOAT_UNIT_TYPES.includes(type);

export const BOAT_CAPACITY: Record<UnitType, number> = {
  villager: 0,
  soldier: 0,
  cavalry: 0,
  fishing_boat: 2,
  trade_boat: 4,
  warship: 0,
  wagon: 0,
  colonial_transport: 6,
};
export type BuildingType =
  | 'town_center'
  | 'house'
  | 'barracks'
  | 'tower'
  | 'sawmill'
  | 'mine'
  | 'market'
  | 'farm'
  | 'dock'
  | 'outpost';

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
  state: 'idle' | 'moving' | 'gathering' | 'attacking' | 'building' | 'fishing' | 'trading' | 'repairing';
  gatheringResource?: 'wood' | 'food' | 'gold' | 'fish' | 'stone' | 'planks';
  attackCooldown?: number;
  gatherOrigin?: { x: number; z: number }; // Anchor position where gathering started
  gatherRadiusLimit?: number; // Maximum search radius for consecutive resources
  gatherTimeLimitSeconds?: number; // Configured work shift timer in seconds (0 = infinite)
  gatherShiftSecondsRemaining?: number; // Real-time remaining seconds for current gathering shift
  passengers?: Unit[];
  embarkTargetId?: string;
  /** Carga do porão (barcos): recursos retirados do estoque de um posto. */
  cargo?: { wood: number; food: number; gold: number; stone: number; planks: number };
  /** Kit de colonização a bordo do transporte colonial (150 madeira e 50 pedra). */
  kit?: boolean;
  /** Segundos até o próximo passageiro poder desembarcar; ausente = sem desembarque em curso. */
  disembarkCooldown?: number;
  /** Rota comercial automática do barco mercante (ver tradeRoutes). */
  route?: import('./tradeRoutes').TradeRoute;
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
  type: 'tree' | 'gold_mine' | 'food_bush' | 'fish_school' | 'stone';
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
  /** Regras validadas ao criar a sessão; o host as aplica no tick e as envia no snapshot. */
  ruleSettings?: RuleSettings;
  units: Unit[];
  buildings: Building[];
  resourceNodes: ResourceNode[];
  playerResources: Record<string, PlayerResources>;
  /** Estado da partida segundo a condicao de vitoria (calculado pelo host). */
  match?: MatchStatus;
  /** Era, tecnologias concluidas e fila de pesquisa de cada jogador (host). */
  techs?: Record<string, TechState>;
  /** Semente do mapa procedural: a mesma semente recria o mesmo arquipelago. */
  mapSeed?: number;
  /** Lado do mundo em células, compartilhado por host e convidados junto com a semente. */
  mapSize?: number;
  /** Kit de fundacao reservado por jogador ate a capital ser fundada (separado do suprimento). */
  foundationKits?: Record<string, { wood: number; stone: number }>;
  /** Plantas e monumentos das ilhas (estado do host). */
  relics?: import('./mysticism').Relic[];
  /** Efeitos temporários por dono (bênção da planta). */
  buffs?: Record<string, { blessing?: number }>;
  /** Segundos de partida simulados (estações). */
  elapsed?: number;
  /** Talentos comprados por dono (IDs únicos; sem respec). */
  talents?: Record<string, string[]>;
  /** Maestrias e pontos por dono (XP só do host, por eventos autoritativos; só desta sessão). */
  mastery?: Record<string, import('./mastery').MasteryState>;
  /** Estoques das localidades coloniais (dono → ilha). A metrópole usa `playerResources`. */
  localStocks?: Record<string, Record<string, { wood: number; food: number; gold: number; stone: number; planks: number }>>;
}

/** Dimensão padrão do mundo; a dimensão real da sessão vem de `GameState.mapSize`. */
export const MAP_SIZE = 60;

/** Lado do mundo da partida: o configurado na sessão ou o padrão. */
export const worldSizeOf = (state: { mapSize?: number }): number => state.mapSize ?? MAP_SIZE;
