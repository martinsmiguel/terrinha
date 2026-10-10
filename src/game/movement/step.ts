import { isBoatUnit } from '../model';
import type { UnitType } from '../model';

export interface StepTerrain {
  isImpassableAt(x: number, z: number): boolean;
  isOceanAt(x: number, z: number): boolean;
}

export interface Point {
  x: number;
  z: number;
}

/** Célula em que o corpo da unidade pode estar: oceano para barcos, terra transitável para os demais. */
export function canOccupy(type: UnitType, x: number, z: number, terrain?: StepTerrain): boolean {
  if (!terrain) return true;
  return isBoatUnit(type) ? terrain.isOceanAt(x, z) : !terrain.isImpassableAt(x, z);
}

/**
 * Único cálculo de passo do domínio: anda `speed` em direção a `to` sem ultrapassar o alvo.
 * Retorna `null` quando o passo é ilegal; unidades terrestres ainda deslizam por um eixo livre.
 */
export function stepToward(type: UnitType, from: Point, to: Point, speed: number, terrain?: StepTerrain): Point | null {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (!(speed > 0) || !Number.isFinite(dist) || dist < 1e-6) return null;
  const length = Math.min(speed, dist);
  const next = { x: from.x + (dx / dist) * length, z: from.z + (dz / dist) * length };
  if (canOccupy(type, next.x, next.z, terrain)) return next;
  if (isBoatUnit(type)) return null;
  const moved = (a: number, b: number) => Math.abs(a - b) > 1e-6;
  if (moved(next.x, from.x) && canOccupy(type, next.x, from.z, terrain)) return { x: next.x, z: from.z };
  if (moved(next.z, from.z) && canOccupy(type, from.x, next.z, terrain)) return { x: from.x, z: next.z };
  return null;
}
