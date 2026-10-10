import type { Building, GameState, Unit } from './model';
import { FAROL_VISION, hasTalent } from './talents';
import { runeSources } from './mysticism';
import { MAP_SIZE } from './model';
import {
  createVisionGrid, expireVision, gridSizeOf, isExploredAt, isVisibleAt, revealVision, visionRadiusFor,
  type VisionSource,
} from './visibility';

/** Visão e exploração autoritativas, mantidas só no host: uma grade por dono (jogador ou IA). */
export type OwnerVision = Record<string, Uint8Array>;

type VisionState = Pick<GameState, 'units' | 'buildings' | 'ruleSettings'> & Partial<Pick<GameState, 'talents' | 'relics'>>;

const sourceOf = (entity: Unit | Building, state: VisionState): VisionSource => ({
  x: entity.position.x,
  z: entity.position.z,
  radius: (entity.type === 'dock' || entity.type === 'outpost') && hasTalent(state, entity.owner, 'farol')
    ? Math.max(visionRadiusFor(entity, state.ruleSettings), FAROL_VISION)
    : visionRadiusFor(entity, state.ruleSettings),
});

/** Fontes de visão de um dono: suas unidades e seus edifícios (a mesma regra do cliente, que só desenha a névoa). */
export function visionSourcesFor(state: VisionState, owner: string): VisionSource[] {
  return [
    ...state.units.filter((unit) => unit.owner === owner && unit.health > 0).map((unit) => sourceOf(unit, state)),
    ...state.buildings.filter((building) => building.owner === owner && building.health > 0).map((building) => sourceOf(building, state)),
    ...runeSources(state.relics, owner),
  ];
}

/**
 * Avança a visão de cada dono em um passo: o que estava visível vira explorado e o que está sob visão agora fica
 * visível. A exploração é preservada entre passos; grades de outra dimensão são descartadas e recriadas.
 */
export function updateOwnerVision(
  previous: OwnerVision | undefined,
  state: VisionState,
  owners: readonly string[],
  size: number = MAP_SIZE
): OwnerVision {
  const next: OwnerVision = {};
  for (const owner of owners) {
    const before = previous?.[owner];
    const base = before && gridSizeOf(before) === size ? before : createVisionGrid({ size });
    next[owner] = revealVision(expireVision(base), visionSourcesFor(state, owner));
  }
  return next;
}

const cellOf = (value: number) => Math.floor(value);

/** O dono vê agora (sob visão atual) esta posição. */
export function isVisibleTo(vision: OwnerVision | undefined, owner: string, x: number, z: number): boolean {
  const grid = vision?.[owner];
  return grid ? isVisibleAt(grid, cellOf(x), cellOf(z)) : false;
}

/** O dono já explorou esta posição (visível agora ou visto antes). */
export function isExploredBy(vision: OwnerVision | undefined, owner: string, x: number, z: number): boolean {
  const grid = vision?.[owner];
  return grid ? isExploredAt(grid, cellOf(x), cellOf(z)) : false;
}

export type TargetKnowledge = 'visible' | 'explored';

/**
 * Regras de conhecimento de alvos: inimigos (unidades e edifícios) só podem ser atacados enquanto visíveis; recursos e
 * terreno de construção só podem ser escolhidos se explorados. Entidades do próprio dono são sempre conhecidas.
 * Sem informação de visão (testes, solo legado) nada é bloqueado.
 */
export function canTarget(
  vision: OwnerVision | undefined,
  owner: string,
  target: { owner?: string; position: { x: number; z: number } },
  needs: TargetKnowledge
): boolean {
  if (!vision) return true;
  if (target.owner === owner) return true;
  return needs === 'visible'
    ? isVisibleTo(vision, owner, target.position.x, target.position.z)
    : isExploredBy(vision, owner, target.position.x, target.position.z);
}
