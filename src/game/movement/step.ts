import { bodyOf, speedFactor, type BodyId, type Surface } from '../bodyModel';
import type { UnitType } from '../model';

export interface StepTerrain {
  isImpassableAt(x: number, z: number): boolean;
  isOceanAt(x: number, z: number): boolean;
  /** Modelo de corpos: o corpo terrestre pode estar neste ponto (seco ou raso até o seu vau). */
  canStandAt?(body: BodyId, x: number, z: number): boolean;
  /** Modelo de corpos: o barco flutua neste ponto (oceano com calado mais margem). */
  isNavigableAt?(x: number, z: number): boolean;
  /** Superfície no ponto: dá a velocidade no raso. */
  surfaceAt?(x: number, z: number): Surface;
}

export interface Point {
  x: number;
  z: number;
}

/**
 * Ponto em que o corpo da unidade pode estar. Com o modelo de corpos (`canStandAt`/`isNavigableAt`): barco só em oceano
 * com calado mais margem; humano, montaria e carroça em terra seca ou água rasa até o próprio vau. Sem ele, a regra
 * legada: oceano para barcos, terra transitável para os demais.
 */
export function canOccupy(type: UnitType, x: number, z: number, terrain?: StepTerrain): boolean {
  if (!terrain) return true;
  const body = bodyOf(type);
  if (body === 'boat') return terrain.isNavigableAt ? terrain.isNavigableAt(x, z) : terrain.isOceanAt(x, z);
  return terrain.canStandAt ? terrain.canStandAt(body, x, z) : !terrain.isImpassableAt(x, z);
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
  // O raso desacelera: a velocidade vale a superfície onde a unidade está.
  const pace = terrain?.surfaceAt ? speed * speedFactor(terrain.surfaceAt(from.x, from.z), bodyOf(type)) : speed;
  const length = Math.min(pace, dist);
  const next = { x: from.x + (dx / dist) * length, z: from.z + (dz / dist) * length };
  if (canOccupy(type, next.x, next.z, terrain)) return next;
  if (bodyOf(type) === 'boat') return null;
  const moved = (a: number, b: number) => Math.abs(a - b) > 1e-6;
  if (moved(next.x, from.x) && canOccupy(type, next.x, from.z, terrain)) return { x: next.x, z: from.z };
  if (moved(next.z, from.z) && canOccupy(type, from.x, next.z, terrain)) return { x: from.x, z: next.z };
  return null;
}
