import { decorationById } from './decorations';
import type { GameState } from './model';

/**
 * Beleza e contentamento (#206): enfeites e árvores plantadas adultas irradiam beleza num raio. Casas com beleza por
 * perto ficam contentes; fazendas e mercados com beleza por perto produzem mais (limitado, sem empilhar infinito).
 * Regra pura, aplicada pelo host.
 */

/** Árvore plantada adulta: beleza 1, raio 4 (a muda em crescimento ainda não conta). */
export const PLANTED_TREE_BEAUTY = { beauty: 1, radius: 4 };
/** Cada ponto de beleza vale +5% de produção, até +25%. */
export const BEAUTY_STEP = 0.05;
export const BEAUTY_CAP = 0.25;

interface Source { x: number; z: number; beauty: number; radius: number }

type BeautyState = Pick<GameState, 'decorations' | 'resourceNodes'>;

export function beautySources(state: BeautyState, owner: string): Source[] {
  const sources: Source[] = [];
  for (const decoration of state.decorations ?? []) {
    if (decoration.owner !== owner) continue;
    const def = decorationById(decoration.type);
    if (def && def.beauty > 0) sources.push({ x: decoration.position.x, z: decoration.position.z, beauty: def.beauty, radius: def.radius });
  }
  for (const node of state.resourceNodes) {
    if (node.plantedBy === owner && node.type === 'tree' && !node.isRegrowing && node.remaining > 0) {
      sources.push({ x: node.position.x, z: node.position.z, ...PLANTED_TREE_BEAUTY });
    }
  }
  return sources;
}

/** Beleza que chega a um ponto: soma das fontes do dono cujo raio o alcança. */
export function beautyAt(state: BeautyState, owner: string, point: { x: number; z: number }, sources = beautySources(state, owner)): number {
  return sources.reduce((total, source) => total + (Math.hypot(source.x - point.x, source.z - point.z) <= source.radius ? source.beauty : 0), 0);
}

/** Multiplicador de produção pela beleza no local (1 a 1,25). */
export const beautyMultiplier = (beauty: number): number => 1 + Math.min(BEAUTY_CAP, Math.max(0, beauty) * BEAUTY_STEP);

/** Resumo do império: beleza total e quantas casas estão contentes (beleza ≥ 2 por perto). */
export function beautySummary(state: BeautyState & Pick<GameState, 'buildings'>, owner: string): { total: number; contentHouses: number; houses: number } {
  const sources = beautySources(state, owner);
  const houses = state.buildings.filter((b) => b.owner === owner && b.type === 'house' && b.isComplete && b.health > 0);
  return {
    total: sources.reduce((t, s) => t + s.beauty, 0),
    contentHouses: houses.filter((house) => beautyAt(state, owner, house.position, sources) >= 2).length,
    houses: houses.length,
  };
}
