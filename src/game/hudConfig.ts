import type { GameState } from './model';

export type HudComposition = 'map-first' | 'explore' | 'manage';
export type HudMode = 'full' | 'compact' | 'hidden';

/** Configuração completa do HUD: é o que o histórico guarda e restaura. Nunca contém estado da partida. */
export interface HudConfig {
  composition: HudComposition;
  mode: HudMode;
  /** Painel contextual (dados reais): começa fechado. */
  panelOpen: boolean;
  minimapCollapsed: boolean;
  selectionCollapsed: boolean;
  /** Recolhe o HUD sozinho após inatividade; desligado por padrão. */
  idleCollapse: boolean;
}

export const DEFAULT_HUD_CONFIG: HudConfig = {
  composition: 'map-first',
  mode: 'full',
  panelOpen: false,
  minimapCollapsed: false,
  selectionCollapsed: false,
  idleCollapse: false,
};

/** Indicadores vitais: aparecem em toda composição e em todo modo exceto o cinemático (onde a restauração é o único controle). */
export const VITAL_INDICATORS = ['wood', 'food', 'gold', 'stone', 'planks', 'population'] as const;
export type VitalIndicator = (typeof VITAL_INDICATORS)[number];
export type ExtraIndicator = 'idle-villagers' | 'queues' | 'selection' | 'era';
export type IndicatorId = VitalIndicator | ExtraIndicator;

/** Conjunto declarado de indicadores por composição (além dos vitais). */
export const COMPOSITION_INDICATORS: Record<HudComposition, readonly ExtraIndicator[]> = {
  'map-first': ['selection'],
  explore: ['selection', 'idle-villagers', 'era'],
  manage: ['selection', 'idle-villagers', 'queues', 'era'],
};

export const COMPOSITION_LABEL: Record<HudComposition, string> = {
  'map-first': 'Mapa primeiro',
  explore: 'Exploração',
  manage: 'Gestão',
};

export const COMPOSITION_ORDER: readonly HudComposition[] = ['map-first', 'explore', 'manage'];

/** Indicadores visíveis numa configuração. Os vitais nunca saem; no modo oculto nada é desenhado além do botão de restaurar. */
export function indicatorsFor(config: HudConfig): IndicatorId[] {
  if (config.mode === 'hidden') return [];
  return [...VITAL_INDICATORS, ...(config.panelOpen ? COMPOSITION_INDICATORS[config.composition] : [])];
}

/** A composição aplica um conjunto coerente de painéis; o painel contextual só abre em Gestão. */
export function applyComposition(config: HudConfig, composition: HudComposition): HudConfig {
  return {
    ...config,
    composition,
    panelOpen: composition === 'manage',
    minimapCollapsed: composition === 'map-first' ? config.minimapCollapsed : false,
    selectionCollapsed: false,
  };
}

export function nextComposition(current: HudComposition): HudComposition {
  return COMPOSITION_ORDER[(COMPOSITION_ORDER.indexOf(current) + 1) % COMPOSITION_ORDER.length];
}

const sameConfig = (a: HudConfig, b: HudConfig): boolean =>
  a.composition === b.composition && a.mode === b.mode && a.panelOpen === b.panelOpen && a.minimapCollapsed === b.minimapCollapsed
  && a.selectionCollapsed === b.selectionCollapsed && a.idleCollapse === b.idleCollapse;

export const HISTORY_LIMIT = 50;

export interface HudHistory { past: HudConfig[]; present: HudConfig; future: HudConfig[] }

export const createHistory = (present: HudConfig = DEFAULT_HUD_CONFIG): HudHistory => ({ past: [], present, future: [] });

/** Registra uma mudança de configuração; igual à atual não cria entrada e uma nova mudança descarta o "refazer". */
export function commit(history: HudHistory, next: HudConfig): HudHistory {
  if (sameConfig(history.present, next)) return history;
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

export function undo(history: HudHistory): HudHistory {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo(history: HudHistory): HudHistory {
  const [next, ...rest] = history.future;
  if (!next) return history;
  return { past: [...history.past, history.present], present: next, future: rest };
}

const COMPOSITIONS: readonly string[] = COMPOSITION_ORDER;
const MODES: readonly string[] = ['full', 'compact', 'hidden'];

/**
 * Regra de recarga: só a configuração sobrevive (localStorage); o histórico começa vazio. Ao carregar, o painel contextual
 * volta fechado e o modo oculto vira completo, para o jogador nunca abrir a partida sem HUD nem sem saber restaurá-lo.
 */
export function restoreConfig(raw: unknown): HudConfig {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_HUD_CONFIG;
  const value = raw as Record<string, unknown>;
  const flag = (key: keyof HudConfig, fallback: boolean): boolean => (typeof value[key] === 'boolean' ? (value[key] as boolean) : fallback);
  const composition = typeof value.composition === 'string' && COMPOSITIONS.includes(value.composition) ? (value.composition as HudComposition) : DEFAULT_HUD_CONFIG.composition;
  const mode = typeof value.mode === 'string' && MODES.includes(value.mode) ? (value.mode as HudMode) : DEFAULT_HUD_CONFIG.mode;
  return {
    composition,
    mode: mode === 'hidden' ? 'full' : mode,
    panelOpen: false,
    minimapCollapsed: flag('minimapCollapsed', DEFAULT_HUD_CONFIG.minimapCollapsed),
    selectionCollapsed: flag('selectionCollapsed', DEFAULT_HUD_CONFIG.selectionCollapsed),
    idleCollapse: flag('idleCollapse', DEFAULT_HUD_CONFIG.idleCollapse),
  };
}

export interface HudReadout {
  wood: number; food: number; gold: number; stone: number; planks: number;
  population: { current: number; max: number };
  idleVillagers: number;
  /** Treinos em fila, na ordem dos edifícios: nada é inventado, só o que está nas filas da partida. */
  queues: { buildingId: string; unit: string; progress: number }[];
  selection: { kind: 'unit' | 'building' | 'resource'; id: string } | null;
}

/** Leitura do estado REAL do jogador para o painel; é a única fonte dos números do HUD, sem valores demonstrativos. */
export function readHud(
  state: Pick<GameState, 'playerResources' | 'units' | 'buildings'>,
  owner: string,
  selection: HudReadout['selection'] = null
): HudReadout {
  const resources = state.playerResources[owner];
  return {
    wood: resources?.wood ?? 0, food: resources?.food ?? 0, gold: resources?.gold ?? 0, stone: resources?.stone ?? 0, planks: resources?.planks ?? 0,
    population: { current: resources?.pop ?? 0, max: resources?.maxPop ?? 0 },
    idleVillagers: state.units.filter((unit) => unit.owner === owner && unit.type === 'villager' && unit.health > 0 && unit.state === 'idle').length,
    queues: state.buildings.filter((building) => building.owner === owner && building.isComplete)
      .flatMap((building) => building.trainingQueue.map((item) => ({ buildingId: building.id, unit: item.unitType, progress: item.progress }))),
    selection,
  };
}
