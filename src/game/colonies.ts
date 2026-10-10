import type { Building, Unit } from './model';
import { isBoatUnit } from './model';

/** Dados revisados do posto avançado (entreposto). */
export const OUTPOST = {
  cost: { wood: 150, stone: 50 },
  buildSeconds: 20,
  maxHealth: 900,
  /** Raio do território em células: cura e economia valem dentro dele. */
  radius: 18,
  /** Distância mínima entre dois postos próprios e entre posto e capital própria. */
  minSpacing: 24,
  /** Cura terrestre: 2 HP por segundo, aplicada em fração a cada tick de 50 ms. */
  healPerSecond: 2,
  healPerTick: 0.1,
} as const;

const distance = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

const isAlive = (building: Building): boolean => building.health > 0;

/** Postos próprios vivos e concluídos: só eles dão território, economia e cura. */
export function activeOutposts(buildings: readonly Building[], owner?: string): Building[] {
  return buildings.filter((building) =>
    building.type === 'outpost' && building.isComplete && isAlive(building) && (owner === undefined || building.owner === owner));
}

/** Motivo de recusa por espaçamento, ou null. Vale para postos em obras e concluídos. */
export function outpostSpacingReason(
  position: { x: number; z: number },
  owner: string,
  buildings: readonly Building[]
): string | null {
  const tooClose = buildings.some((building) =>
    building.owner === owner && isAlive(building) && (building.type === 'outpost' || building.type === 'town_center')
    && distance(building.position, position) < OUTPOST.minSpacing);
  return tooClose ? `Perto demais de outro posto ou da capital (mínimo ${OUTPOST.minSpacing})` : null;
}

/** Posto próprio concluído que cobre o ponto, ou null. */
export function outpostCovering(position: { x: number; z: number }, owner: string, buildings: readonly Building[]): Building | null {
  return activeOutposts(buildings, owner).find((outpost) => distance(outpost.position, position) <= OUTPOST.radius) ?? null;
}

/**
 * Cura por tick: unidades terrestres próprias, vivas e feridas dentro do raio de um posto
 * concluído recebem `healPerTick` uma vez (vários postos não somam), sem passar de maxHealth
 * e sem reviver quem está com 0 de vida. Devolve a mesma lista se nada mudou.
 */
export function healUnitsInTerritory(units: readonly Unit[], buildings: readonly Building[]): readonly Unit[] {
  const outposts = activeOutposts(buildings);
  if (outposts.length === 0) return units;
  let changed = false;
  const next = units.map((unit) => {
    if (unit.health <= 0 || unit.health >= unit.maxHealth || isBoatUnit(unit.type)) return unit;
    const covered = outposts.some((outpost) => outpost.owner === unit.owner && distance(outpost.position, unit.position) <= OUTPOST.radius);
    if (!covered) return unit;
    changed = true;
    return { ...unit, health: Math.min(unit.maxHealth, unit.health + OUTPOST.healPerTick) };
  });
  return changed ? next : units;
}
