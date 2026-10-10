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

/** Raio máximo (em células) que uma unidade é deslocada ao ser acomodada; além disso ela fica no lugar. */
export const SETTLE_RADIUS = 3;

export interface SettleResult<T extends { id: string; position: Point }> {
  units: T[];
  /** Unidades que estavam em posição ilegal e foram levadas à célula legal mais próxima. */
  moved: string[];
  /** Unidades em posição ilegal sem célula legal ao alcance: ficam onde estão e ordens são limpas, sem morte nem teleporte. */
  stranded: string[];
}

/**
 * Acomoda unidades depois de uma mudança ao vivo da superfície (ponte destruída, revisão de regras do corpo): quem está
 * em posição ilegal vai para a célula legal mais próxima dentro de `SETTLE_RADIUS`. Nunca mata nem teleporta além do raio;
 * sem célula ao alcance a unidade fica parada para o dono decidir.
 */
export function settleUnits<T extends { id: string; type: UnitType; position: Point; state?: string; targetPosition?: Point | null; targetEntityId?: string | null }>(
  units: readonly T[],
  terrain: StepTerrain
): SettleResult<T> {
  const moved: string[] = [];
  const stranded: string[] = [];
  const settled = units.map((unit) => {
    if (canOccupy(unit.type, unit.position.x, unit.position.z, terrain)) return unit;
    let best: Point | null = null;
    let bestDistance = Infinity;
    const cx = Math.floor(unit.position.x);
    const cz = Math.floor(unit.position.z);
    for (let dx = -SETTLE_RADIUS; dx <= SETTLE_RADIUS; dx += 1) {
      for (let dz = -SETTLE_RADIUS; dz <= SETTLE_RADIUS; dz += 1) {
        const center = { x: cx + dx + 0.5, z: cz + dz + 0.5 };
        const distance = Math.hypot(center.x - unit.position.x, center.z - unit.position.z);
        if (distance > SETTLE_RADIUS || distance >= bestDistance) continue;
        if (!canOccupy(unit.type, center.x, center.z, terrain)) continue;
        bestDistance = distance;
        best = center;
      }
    }
    if (!best) {
      stranded.push(unit.id);
      return { ...unit, state: 'idle', targetPosition: null, targetEntityId: null };
    }
    moved.push(unit.id);
    return { ...unit, position: best, state: 'idle', targetPosition: null, targetEntityId: null };
  });
  return { units: settled, moved, stranded };
}
