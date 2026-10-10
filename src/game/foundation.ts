import type { Building, GameState, Unit } from './model';

/** Kit de fundação reservado: só pode ser gasto fundando a capital, nunca no suprimento comum. */
export const FOUNDATION_KIT = { wood: 400, stone: 200 } as const;
export const CAPITAL_BUILD_SECONDS = 20;
export const CAPITAL_MAX_HEALTH = 2400;
export const CAPITAL_MIN_SITES = 3;
const TICKS_PER_SECOND = 20;
/** Avanço de progresso (0 a 100) por passo de simulação durante a fundação. */
export const CAPITAL_PROGRESS_PER_TICK = 100 / (CAPITAL_BUILD_SECONDS * TICKS_PER_SECOND);

export type LifePhase = 'arriving' | 'founding' | 'active' | 'eliminated';

export interface Point {
  x: number;
  z: number;
}

const isCapital = (building: Building, owner: string) =>
  building.type === 'town_center' && building.owner === owner && building.health > 0;

/**
 * Fase de vida do jogador, derivada do estado: chegando (só a carroça), fundando (capital em
 * obras), ativo (capital concluída) ou eliminado. Entrepostos e outras construções não contam.
 */
export function lifePhase(owner: string, buildings: readonly Building[], units: readonly Unit[]): LifePhase {
  const capital = buildings.find((building) => isCapital(building, owner));
  if (capital) return capital.isComplete ? 'active' : 'founding';
  const hasWagon = units.some((unit) => unit.owner === owner && unit.type === 'wagon' && unit.health > 0);
  return hasWagon ? 'arriving' : 'eliminated';
}

/** Posições de sede viáveis ao redor de `origin`, distintas entre si e ordenadas por proximidade. */
export function findCapitalSites(
  origin: Point,
  isViable: (x: number, z: number) => boolean,
  options: { count?: number; minSpacing?: number; maxRadius?: number; ringStep?: number } = {}
): Point[] {
  const { count = CAPITAL_MIN_SITES, minSpacing = 6, maxRadius = 20, ringStep = 1.5 } = options;
  const sites: Point[] = [];
  for (let radius = 0; radius <= maxRadius && sites.length < count; radius += ringStep) {
    const steps = radius === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * radius) / ringStep));
    for (let i = 0; i < steps && sites.length < count; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      const x = Math.round((origin.x + Math.cos(angle) * radius) * 10) / 10;
      const z = Math.round((origin.z + Math.sin(angle) * radius) * 10) / 10;
      if (!isViable(x, z)) continue;
      if (sites.some((site) => Math.hypot(site.x - x, site.z - z) < minSpacing)) continue;
      sites.push({ x, z });
    }
  }
  return sites;
}

export type FoundReason = 'wagon-missing' | 'not-arriving' | 'kit-missing' | 'site-invalid';
export type FoundResult =
  | { ok: true; state: GameState; capital: Building }
  | { ok: false; reason: FoundReason };

/**
 * Converte a carroça em capital em obras, uma única vez: a carroça some, o kit reservado é
 * consumido e a população cai em um. Repetir o pedido falha porque a carroça já não existe.
 */
export function foundCapital(
  state: GameState,
  request: { owner: string; wagonId: string; position: Point },
  isSiteValid: (x: number, z: number) => boolean,
  createId: () => string
): FoundResult {
  const { owner, wagonId, position } = request;
  const wagon = state.units.find((unit) => unit.id === wagonId && unit.owner === owner && unit.type === 'wagon' && unit.health > 0);
  if (!wagon) return { ok: false, reason: 'wagon-missing' };
  if (lifePhase(owner, state.buildings, state.units) !== 'arriving') return { ok: false, reason: 'not-arriving' };
  const kit = state.foundationKits?.[owner];
  if (!kit || kit.wood < FOUNDATION_KIT.wood || kit.stone < FOUNDATION_KIT.stone) return { ok: false, reason: 'kit-missing' };
  if (!Number.isFinite(position.x) || !Number.isFinite(position.z) || !isSiteValid(position.x, position.z)) {
    return { ok: false, reason: 'site-invalid' };
  }

  const capital: Building = {
    id: createId(),
    type: 'town_center',
    owner,
    position: { x: position.x, z: position.z },
    health: Math.round(CAPITAL_MAX_HEALTH * 0.1),
    maxHealth: CAPITAL_MAX_HEALTH,
    isComplete: false,
    buildProgress: 0,
    trainingQueue: [],
  };
  const { [owner]: _consumed, ...otherKits } = state.foundationKits ?? {};
  const resources = state.playerResources[owner];
  return {
    ok: true,
    capital,
    state: {
      ...state,
      units: state.units.filter((unit) => unit.id !== wagonId),
      buildings: [...state.buildings, capital],
      foundationKits: otherKits,
      playerResources: resources
        ? { ...state.playerResources, [owner]: { ...resources, pop: Math.max(0, resources.pop - 1) } }
        : state.playerResources,
    },
  };
}

/** Um passo da fundação automática: a capital em obras avança sozinha até concluir. */
export function advanceFoundation(building: Building): Building {
  if (building.type !== 'town_center' || building.isComplete || building.health <= 0) return building;
  const progress = Math.min(100, (building.buildProgress ?? 0) + CAPITAL_PROGRESS_PER_TICK);
  const done = progress >= 100;
  return {
    ...building,
    buildProgress: progress,
    isComplete: done,
    health: done ? building.maxHealth : Math.max(building.health, Math.round(building.maxHealth * (0.1 + 0.9 * (progress / 100)))),
  };
}
