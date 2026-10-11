import type { BodyId } from './bodyModel';

/**
 * Ordem de movimento de grupo: calcula o destino de cada unidade em formação ao redor do ponto escolhido.
 * Regra pura, sem DOM: o `App` só lê o clique e envia as ordens que este módulo planeja.
 */

export type Formation = 'box' | 'line' | 'spread';
export interface Point { x: number; z: number }
export interface GroupUnit { id: string; position: Point; body: BodyId | 'boat' }
export interface MoveOrder { unitId: string; target: Point }
export type CanStand = (body: BodyId, x: number, z: number) => boolean;

const WORLD_MARGIN = 2;
const SNAP_RADIUS = 10;
const SNAP_STEP = 0.5;
/** Dois destinos mais próximos que isto contam como o mesmo lugar e não podem ser dados a unidades diferentes. */
const MIN_SEPARATION = 0.7;

/** Vetores de marcha (frente e flanco) do centro atual do grupo ao destino. */
export function marchVectors(units: readonly GroupUnit[], target: Point): { fwdX: number; fwdZ: number; perpX: number; perpZ: number } {
  const count = units.length || 1;
  const avgX = units.reduce((sum, u) => sum + u.position.x, 0) / count;
  const avgZ = units.reduce((sum, u) => sum + u.position.z, 0) / count;
  const dirX = target.x - avgX;
  const dirZ = target.z - avgZ;
  const len = Math.hypot(dirX, dirZ);
  if (len <= 0.01) return { fwdX: 0, fwdZ: 1, perpX: 1, perpZ: 0 };
  const fwdX = dirX / len;
  const fwdZ = dirZ / len;
  return { fwdX, fwdZ, perpX: -fwdZ, perpZ: fwdX };
}

/**
 * Destino ideal de cada unidade na formação, sem olhar o terreno. É a regra original do jogo, preservada
 * para que o teste mostre o que ela produzia quando o slot cai em água ou rochedo.
 */
export function formationSlots(count: number, center: Point, vectors: ReturnType<typeof marchVectors>, formation: Formation, worldSize: number): Point[] {
  const { fwdX, fwdZ, perpX, perpZ } = vectors;
  return Array.from({ length: count }, (_, idx) => {
    let x = center.x;
    let z = center.z;
    if (formation === 'line') {
      const maxRank = count > 8 ? Math.ceil(count / 2) : count;
      const rankIndex = idx % maxRank;
      const rankRow = Math.floor(idx / maxRank);
      const colOffset = (rankIndex - (maxRank - 1) / 2) * 1.6;
      const rowOffset = -rankRow * 1.8;
      x = center.x + perpX * colOffset + fwdX * rowOffset;
      z = center.z + perpZ * colOffset + fwdZ * rowOffset;
    } else if (formation === 'spread') {
      const angle = (idx / count) * Math.PI * 2;
      const radius = 1.8 + (idx % 2) * 1.4;
      x = center.x + Math.cos(angle) * radius;
      z = center.z + Math.sin(angle) * radius;
    } else {
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      const spacing = 1.4;
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const colOffset = (col - (cols - 1) / 2) * spacing;
      const rowOffset = -(row - (rows - 1) / 2) * spacing;
      x = center.x + perpX * colOffset + fwdX * rowOffset;
      z = center.z + perpZ * colOffset + fwdZ * rowOffset;
    }
    return { x: Math.max(WORLD_MARGIN, Math.min(worldSize - WORLD_MARGIN, x)), z: Math.max(WORLD_MARGIN, Math.min(worldSize - WORLD_MARGIN, z)) };
  });
}

/** Deslocamentos candidatos em anéis crescentes, do mais perto ao mais longe (calculado uma vez). */
const SNAP_OFFSETS: Point[] = (() => {
  const out: Point[] = [];
  const n = Math.round(SNAP_RADIUS / SNAP_STEP);
  for (let i = -n; i <= n; i += 1) {
    for (let j = -n; j <= n; j += 1) {
      const x = i * SNAP_STEP;
      const z = j * SNAP_STEP;
      if (Math.hypot(x, z) <= SNAP_RADIUS) out.push({ x, z });
    }
  }
  return out.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
})();

const inWorld = (p: Point, worldSize: number) => p.x >= WORLD_MARGIN && p.x <= worldSize - WORLD_MARGIN && p.z >= WORLD_MARGIN && p.z <= worldSize - WORLD_MARGIN;

/** Ponto onde o corpo pode ficar mais próximo de `near`, ou `null` se não houver nenhum num raio de 10. */
export function nearestStandable(near: Point, body: BodyId, canStand: CanStand, worldSize: number, taken: readonly Point[] = []): Point | null {
  for (const offset of SNAP_OFFSETS) {
    const p = { x: near.x + offset.x, z: near.z + offset.z };
    if (!inWorld(p, worldSize) || !canStand(body, p.x, p.z)) continue;
    if (taken.some((t) => Math.hypot(t.x - p.x, t.z - p.z) < MIN_SEPARATION)) continue;
    return p;
  }
  return null;
}

export interface GroupMovePlan {
  orders: MoveOrder[];
  /** Centro realmente usado (o escolhido, ou o ponto de terra mais próximo quando o escolhido não serve). */
  center: Point;
  /** O ponto clicado não servia para o grupo e o centro foi levado ao terreno válido mais próximo. */
  centerMoved: boolean;
  /** Quantas unidades tiveram o slot trocado por um ponto válido próximo. */
  adjusted: number;
  /** Unidades que não têm nenhum ponto válido perto do destino. */
  unplaced: string[];
}

/**
 * Planeja o movimento de grupo: todo destino enviado ao host é um lugar onde o corpo da unidade pode ficar,
 * porque o host recusa o resto em silêncio. O centro escolhido é respeitado sempre que algum corpo do grupo puder ficar nele;
 * os slots da formação que cairiam em água funda ou rochedo vão para o ponto válido mais próximo.
 * Barcos seguem sem ajuste: o host leva o destino deles ao oceano navegável.
 */
export function planGroupMove(units: readonly GroupUnit[], target: Point, formation: Formation, worldSize: number, canStand: CanStand): GroupMovePlan {
  const land = units.filter((u): u is GroupUnit & { body: BodyId } => u.body !== 'boat');
  const bodies = [...new Set(land.map((u) => u.body))];
  const clampedTarget = { x: Math.max(WORLD_MARGIN, Math.min(worldSize - WORLD_MARGIN, target.x)), z: Math.max(WORLD_MARGIN, Math.min(worldSize - WORLD_MARGIN, target.z)) };

  // Centro: o ponto clicado se todos os corpos terrestres do grupo puderem ficar nele; senão o mais próximo em que possam.
  let center = clampedTarget;
  let centerMoved = false;
  if (bodies.some((body) => !canStand(body, center.x, center.z))) {
    const reference = bodies.find((body) => !canStand(body, center.x, center.z))!;
    const snapped = nearestStandable(center, reference, (b, x, z) => bodies.every((other) => canStand(other, x, z)) && canStand(b, x, z), worldSize);
    if (snapped) { center = snapped; centerMoved = true; }
  }

  const vectors = marchVectors(units, center);
  const slots = formationSlots(units.length, center, vectors, formation, worldSize);
  const orders: MoveOrder[] = [];
  const taken: Point[] = [];
  const unplaced: string[] = [];
  let adjusted = 0;
  units.forEach((unit, index) => {
    if (unit.body === 'boat') { orders.push({ unitId: unit.id, target: slots[index] }); return; }
    const slot = slots[index];
    if (canStand(unit.body, slot.x, slot.z) && !taken.some((t) => Math.hypot(t.x - slot.x, t.z - slot.z) < MIN_SEPARATION)) {
      orders.push({ unitId: unit.id, target: slot });
      taken.push(slot);
      return;
    }
    const fallback = nearestStandable(slot, unit.body, canStand, worldSize, taken)
      ?? nearestStandable(center, unit.body, canStand, worldSize, taken);
    if (!fallback) { unplaced.push(unit.id); return; }
    orders.push({ unitId: unit.id, target: fallback });
    taken.push(fallback);
    adjusted += 1;
  });
  return { orders, center, centerMoved, adjusted, unplaced };
}
