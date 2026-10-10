import type { GridPoint } from './pathfinding';

/**
 * Campo de fluxo por destino: distâncias de custo mínimo (Dijkstra) a partir do destino, compartilhadas por todo um grupo que
 * vai para a mesma célula com o mesmo corpo. Cada unidade segue o gradiente em vez de rodar o próprio A*. Mesmas regras do A*:
 * 8 vizinhos, sem cortar cantos, peso por célula (Infinity bloqueia; o raso custa mais).
 */
export interface FlowField {
  cells: number;
  goalIndex: number;
  /** Menor custo até o destino por célula acertada (Infinity = não alcançado dentro do orçamento). */
  cost: Float64Array;
  weight: (x: number, z: number) => number;
  /** Quantas células foram expandidas ao montar o campo. */
  expanded: number;
}

const SQRT2 = Math.SQRT2;
const NEIGHBORS = [1, 0, -1, 0, 0, 1, 0, -1, 1, 1, 1, -1, -1, 1, -1, -1];

class Heap {
  private keys: number[] = [];
  private prios: number[] = [];
  get size(): number { return this.keys.length; }
  push(key: number, prio: number): void {
    this.keys.push(key); this.prios.push(prio);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.prios[p] <= this.prios[i]) break;
      [this.keys[p], this.keys[i]] = [this.keys[i], this.keys[p]];
      [this.prios[p], this.prios[i]] = [this.prios[i], this.prios[p]];
      i = p;
    }
  }
  pop(): { key: number; prio: number } {
    const top = { key: this.keys[0], prio: this.prios[0] };
    const lastKey = this.keys.pop()!; const lastPrio = this.prios.pop()!;
    if (this.keys.length > 0) {
      this.keys[0] = lastKey; this.prios[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1; const r = l + 1; let m = i;
        if (l < this.keys.length && this.prios[l] < this.prios[m]) m = l;
        if (r < this.keys.length && this.prios[r] < this.prios[m]) m = r;
        if (m === i) break;
        [this.keys[m], this.keys[i]] = [this.keys[i], this.keys[m]];
        [this.prios[m], this.prios[i]] = [this.prios[i], this.prios[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Monta o campo a partir do destino. Para quando todas as `starts` foram acertadas (ou o orçamento `maxExpanded` esgota),
 * o que mantém o custo proporcional à distância do grupo e não ao mapa inteiro.
 */
export function buildFlowField(options: {
  goal: GridPoint; weight: (x: number, z: number) => number; mapSize: number; starts?: readonly GridPoint[]; maxExpanded?: number;
}): FlowField | null {
  const { mapSize, weight } = options;
  const cells = Math.ceil(mapSize);
  const toCell = (v: number) => Math.floor(v);
  const toWorld = (c: number) => c + 0.5;
  const gx = toCell(options.goal.x); const gz = toCell(options.goal.z);
  if (gx < 0 || gz < 0 || gx >= cells || gz >= cells || !Number.isFinite(weight(toWorld(gx), toWorld(gz)))) return null;

  const cost = new Float64Array(cells * cells).fill(Number.POSITIVE_INFINITY);
  const done = new Uint8Array(cells * cells);
  const enter = new Float32Array(cells * cells); // custo de entrar na célula; 0 = não consultada; -1 = bloqueada
  const cellEnter = (x: number, z: number): number => {
    const i = z * cells + x;
    if (enter[i] === 0) { const w = weight(toWorld(x), toWorld(z)); enter[i] = Number.isFinite(w) ? Math.max(1, w) : -1; }
    return enter[i];
  };
  const goalIndex = gz * cells + gx;
  cost[goalIndex] = 0;
  const heap = new Heap();
  heap.push(goalIndex, 0);

  const pending = new Set<number>();
  for (const s of options.starts ?? []) {
    const sx = toCell(s.x); const sz = toCell(s.z);
    if (sx >= 0 && sz >= 0 && sx < cells && sz < cells) pending.add(sz * cells + sx);
  }
  const maxExpanded = options.maxExpanded ?? cells * cells;
  let expanded = 0;
  while (heap.size > 0 && expanded < maxExpanded) {
    const { key } = heap.pop();
    if (done[key]) continue;
    done[key] = 1; expanded += 1;
    pending.delete(key);
    if ((options.starts?.length ?? 0) > 0 && pending.size === 0) break;
    const cx = key % cells; const cz = (key - cx) / cells;
    // O custo de ir de n até a célula atual é o de ENTRAR na atual (as arestas são simétricas no A*, que cobra a célula de destino).
    for (let i = 0; i < NEIGHBORS.length; i += 2) {
      const dx = NEIGHBORS[i]; const dz = NEIGHBORS[i + 1];
      const nx = cx + dx; const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= cells || nz >= cells) continue;
      if (cellEnter(nx, nz) < 0) continue;
      const diagonal = dx !== 0 && dz !== 0;
      if (diagonal && (cellEnter(cx + dx, cz) < 0 || cellEnter(cx, cz + dz) < 0)) continue;
      const ni = nz * cells + nx;
      if (done[ni]) continue;
      const step = (diagonal ? SQRT2 : 1) * cellEnter(cx, cz);
      const next = cost[key] + step;
      if (next < cost[ni]) { cost[ni] = next; heap.push(ni, next); }
    }
  }
  return { cells, goalIndex, cost, weight, expanded };
}

/**
 * Segue o gradiente do campo a partir de `start` até o destino (ou `maxSteps`), devolvendo os pontos como o A*: células
 * centradas, sem o ponto inicial. Vazio se o início não foi acertado no campo (o chamador cai no A*).
 */
export function followFlowField(field: FlowField, start: GridPoint, maxSteps = 4096): GridPoint[] {
  const { cells, cost, weight } = field;
  let x = Math.floor(start.x); let z = Math.floor(start.z);
  if (x < 0 || z < 0 || x >= cells || z >= cells || !Number.isFinite(cost[z * cells + x])) return [];
  const path: GridPoint[] = [];
  for (let step = 0; step < maxSteps; step += 1) {
    const here = z * cells + x;
    if (here === field.goalIndex) break;
    let bestX = x; let bestZ = z; let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < NEIGHBORS.length; i += 2) {
      const dx = NEIGHBORS[i]; const dz = NEIGHBORS[i + 1];
      const nx = x + dx; const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= cells || nz >= cells) continue;
      const entering = weight(nx + 0.5, nz + 0.5);
      if (!Number.isFinite(entering)) continue;
      const diagonal = dx !== 0 && dz !== 0;
      if (diagonal && (!Number.isFinite(weight(x + dx + 0.5, z + 0.5)) || !Number.isFinite(weight(x + 0.5, z + dz + 0.5)))) continue;
      // Escolhe o vizinho que minimiza (custo de ir até ele + custo restante dele), não só o de menor potencial.
      const total = (diagonal ? SQRT2 : 1) * Math.max(1, entering) + cost[nz * cells + nx];
      if (total < best && cost[nz * cells + nx] < cost[here]) { best = total; bestX = nx; bestZ = nz; }
    }
    if (bestX === x && bestZ === z) return []; // sem descida: campo incompleto aqui, usa o A*
    x = bestX; z = bestZ;
    path.push({ x: x + 0.5, z: z + 0.5 });
  }
  return path;
}
