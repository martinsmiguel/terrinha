import type { UnitType } from './model';

/** Corpos terrestres: humano (aldeão, soldado), montaria (cavalaria) e carroça. Valores em células de mundo. */
export type BodyId = 'human' | 'mount' | 'cart';

export interface BodySpec {
  height: number;
  radius: number;
  /** Maior profundidade de água em que o corpo ainda anda com os pés apoiados no fundo. */
  wadeDepth: number;
}

/** Padrões de projeto, revisados contra os modelos 3D: humano 1,8/0,35/0,81; montaria 1,6/0,6/0,72; carroça 1,4/0,8/0,35. */
export const BODIES: Readonly<Record<BodyId, BodySpec>> = {
  human: { height: 1.8, radius: 0.35, wadeDepth: 0.81 },
  mount: { height: 1.6, radius: 0.6, wadeDepth: 0.72 },
  cart: { height: 1.4, radius: 0.8, wadeDepth: 0.35 },
};

/** Calado do barco (0,8) mais margem de segurança (0,2): precisa de pelo menos 1,0 de água para flutuar. */
export const BOAT_DRAFT = 0.8;
export const BOAT_DRAFT_MARGIN = 0.2;
export const BOAT_REQUIRED_DEPTH = BOAT_DRAFT + BOAT_DRAFT_MARGIN;

export function bodyOf(type: UnitType): BodyId | 'boat' {
  switch (type) {
    case 'cavalry': return 'mount';
    case 'wagon': return 'cart';
    case 'fishing_boat':
    case 'trade_boat':
    case 'warship':
    case 'colonial_transport': return 'boat';
    default: return 'human';
  }
}

export type WaterKind = 'none' | 'ocean' | 'lake' | 'river';

/** Amostra de superfície em um ponto do mundo. `depth` é a profundidade da água (0 em terra seca). */
export interface Surface {
  water: WaterKind;
  depth: number;
  cliff: boolean;
}

export type SurfaceClass = 'dry' | 'shallow' | 'blocked';

/** Como um corpo terrestre vê a superfície: seca, rasa (anda vadeando) ou bloqueada (rochedo ou fundo demais). */
export function classifyForBody(surface: Surface, body: BodyId): SurfaceClass {
  if (surface.cliff) return 'blocked';
  if (surface.water === 'none' || surface.depth <= 0) return 'dry';
  return surface.depth <= BODIES[body].wadeDepth ? 'shallow' : 'blocked';
}

/** O barco flutua: só em oceano e com pelo menos o calado mais a margem. Rios e lagos são fechados aos barcos. */
export function boatCanFloat(surface: Surface): boolean {
  return surface.water === 'ocean' && !surface.cliff && surface.depth >= BOAT_REQUIRED_DEPTH;
}

/** O corpo pode estar neste ponto? (`boat` usa o calado; os demais, a profundidade de vau.) */
export function canStand(surface: Surface, body: BodyId | 'boat'): boolean {
  return body === 'boat' ? boatCanFloat(surface) : classifyForBody(surface, body) !== 'blocked';
}

/** Fração da velocidade mantida na superfície: 1 em terra seca; o raso desacelera até metade no limite do vau. */
export function speedFactor(surface: Surface, body: BodyId | 'boat'): number {
  if (body === 'boat' || classifyForBody(surface, body) !== 'shallow') return 1;
  return 1 - 0.5 * Math.min(1, surface.depth / BODIES[body].wadeDepth);
}

/** Custo de atravessar a superfície para a rota (1 em terra seca; o raso custa até 3x). O bloqueado é infinito. */
export function moveCost(surface: Surface, body: BodyId | 'boat'): number {
  if (!canStand(surface, body)) return Number.POSITIVE_INFINITY;
  return body === 'boat' || classifyForBody(surface, body) !== 'shallow' ? 1 : 1 + 2 * Math.min(1, surface.depth / BODIES[body].wadeDepth);
}
