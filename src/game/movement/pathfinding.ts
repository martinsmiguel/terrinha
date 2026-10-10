/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GridPoint {
  x: number;
  z: number;
}

export interface PathOptions {
  /** Lado do mapa em unidades de mundo (padrão: MAP_SIZE do engine). */
  mapSize?: number;
  /** Lado de cada célula do grid (padrão: 1 = 1 célula por unidade). */
  cellSize?: number;
  /**
   * Limite de nós expandidos por chamada. O padrão cobre o grid inteiro
   * (60 × 60 = 3600), então uma busca normalmente termina completa.
   * Quando o orçamento esgota com destino ainda alcançável, devolve um
   * caminho parcial até o nó mais próximo do objetivo, para a próxima
   * chamada continuar de onde parou.
   */
  maxExpanded?: number;
  /**
   * Multiplicador do custo de entrar numa célula (1 = normal). Torna o raso mais caro que a terra seca para a rota
   * preferir o caminho seco quando ele não for muito mais longo. Células bloqueadas continuam sendo `isBlocked`.
   */
  cost?: (x: number, z: number) => number;
}

const DEFAULT_MAP_SIZE = 60;
const DEFAULT_CELL_SIZE = 1;
const SQRT2 = Math.SQRT2;

/** Heap binário mínimo por pontuação `f` — sem alocação por nó expandido. */
class MinHeap {
  private items: number[] = [];
  private scores: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, score: number): void {
    this.items.push(item);
    this.scores.push(score);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.scores[parent] <= this.scores[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop() as number;
    const lastScore = this.scores.pop() as number;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.scores[0] = lastScore;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.items.length && this.scores[left] < this.scores[smallest]) smallest = left;
        if (right < this.items.length && this.scores[right] < this.scores[smallest]) smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const item = this.items[a];
    this.items[a] = this.items[b];
    this.items[b] = item;
    const score = this.scores[a];
    this.scores[a] = this.scores[b];
    this.scores[b] = score;
  }
}

/** Distância octile (diagonal custa √2), admissível para 8-vizinhos. */
const octile = (dx: number, dz: number): number => {
  const min = Math.min(dx, dz);
  return dx + dz + (SQRT2 - 2) * min;
};

/**
 * A* no grid do mapa em coordenadas de mundo.
 *
 * - Água e cliffs entram pelo callback `isBlocked(x, z)` (recebe o centro da
 *   célula em unidades de mundo).
 * - Devolve os pontos do caminho **excluindo a célula de origem**; vazio
 *   quando a origem já é o destino, quando não há rota ou quando origem/meta
 *   estão bloqueadas/fora do mapa.
 * - Diagonais não cortam cantos: exigem ambos os vizinhos ortogonais livres.
 */
export const findPath = (
  start: GridPoint,
  goal: GridPoint,
  isBlocked: (x: number, z: number) => boolean,
  options: PathOptions = {}
): GridPoint[] => {
  const mapSize = options.mapSize ?? DEFAULT_MAP_SIZE;
  const cellSize = options.cellSize ?? DEFAULT_CELL_SIZE;
  const cells = Math.ceil(mapSize / cellSize);

  const toCell = (value: number): number => Math.floor(value / cellSize);
  const toWorld = (cell: number): number => cell * cellSize + cellSize / 2;

  const startX = toCell(start.x);
  const startZ = toCell(start.z);
  const goalX = toCell(goal.x);
  const goalZ = toCell(goal.z);

  const inBounds = (x: number, z: number): boolean => x >= 0 && z >= 0 && x < cells && z < cells;
  if (!inBounds(startX, startZ) || !inBounds(goalX, goalZ)) return [];
  if (isBlocked(toWorld(startX), toWorld(startZ))) return [];
  if (isBlocked(toWorld(goalX), toWorld(goalZ))) return [];
  if (startX === goalX && startZ === goalZ) return [];

  const maxExpanded = options.maxExpanded ?? cells * cells;
  const cellCount = cells * cells;
  const gScore = new Float64Array(cellCount).fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Int32Array(cellCount).fill(-1);
  const closed = new Uint8Array(cellCount);
  const blocked = new Uint8Array(cellCount);

  const isCellBlocked = (x: number, z: number): boolean => {
    const index = z * cells + x;
    if (blocked[index] === 0) {
      blocked[index] = isBlocked(toWorld(x), toWorld(z)) ? 1 : 2;
    }
    return blocked[index] === 1;
  };

  const startIndex = startZ * cells + startX;
  const goalIndex = goalZ * cells + goalX;
  gScore[startIndex] = 0;

  const open = new MinHeap();
  open.push(startIndex, octile(Math.abs(goalX - startX), Math.abs(goalZ - startZ)));

  // dx, dz, custo
  const NEIGHBORS: number[] = [1, 0, 1, -1, 0, 1, -1, 0, 1, 1, 1, -1, -1, 1, -1, -1];

  let expanded = 0;
  let found = false;

  // Nó descoberto mais próximo do objetivo (menor heurística). Vira o desfecho
  // parcial quando o orçamento de expansão esgota antes de alcançar o destino.
  let bestIndex = startIndex;
  let bestH = octile(Math.abs(goalX - startX), Math.abs(goalZ - startZ));

  while (open.size > 0) {
    if (expanded >= maxExpanded) break;
    const current = open.pop();
    if (closed[current]) continue;
    closed[current] = 1;
    expanded++;

    if (current === goalIndex) {
      found = true;
      break;
    }

    const cx = current % cells;
    const cz = (current - cx) / cells;

    for (let i = 0; i < NEIGHBORS.length; i += 2) {
      const dx = NEIGHBORS[i];
      const dz = NEIGHBORS[i + 1];
      const nx = cx + dx;
      const nz = cz + dz;
      if (!inBounds(nx, nz)) continue;

      const diagonal = dx !== 0 && dz !== 0;
      if (diagonal) {
        // Não cortar cantos: os dois vizinhos ortogonais precisam estar livres.
        if (isCellBlocked(cx + dx, cz) || isCellBlocked(cx, cz + dz)) continue;
      }
      if (isCellBlocked(nx, nz)) continue;

      const neighborIndex = nz * cells + nx;
      if (closed[neighborIndex]) continue;

      const stepCost = (diagonal ? SQRT2 : 1) * Math.max(1, options.cost?.(toWorld(nx), toWorld(nz)) ?? 1);
      const tentative = gScore[current] + stepCost;
      if (tentative >= gScore[neighborIndex]) continue;

      cameFrom[neighborIndex] = current;
      gScore[neighborIndex] = tentative;
      const h = octile(Math.abs(goalX - nx), Math.abs(goalZ - nz));
      open.push(neighborIndex, tentative + h);
      if (h < bestH) {
        bestH = h;
        bestIndex = neighborIndex;
      }
    }
  }

  // Reconstrói a rota vindo de `fromIndex` até o início (inclusive).
  const buildPath = (fromIndex: number): GridPoint[] => {
    const path: GridPoint[] = [];
    let step = fromIndex;
    while (step !== -1 && step !== startIndex) {
      const x = step % cells;
      const z = (step - x) / cells;
      path.push({ x: toWorld(x), z: toWorld(z) });
      step = cameFrom[step];
    }
    path.reverse();
    return path;
  };

  if (found) return buildPath(goalIndex);

  // Fronteira vazia: o destino é realmente inalcançável, sem rota parcial.
  if (open.size === 0) return [];

  // Orçamento esgotado com destino ainda alcançável: devolve o trecho percorrido
  // até o nó mais próximo do objetivo. O chamador recalcula ao fim da rota e a
  // busca continua em etapas (cada etapa cabe no orçamento de um tick).
  return buildPath(bestIndex);
};

/**
 * Próximo ponto de um caminho para a unidade em `position`.
 * Devolve null quando o caminho acabou (unidade já está no fim).
 */
export const nextWaypoint = (
  position: GridPoint,
  path: GridPoint[],
  arriveRadius = 0.35
): GridPoint | null => {
  if (path.length === 0) return null;
  const last = path[path.length - 1];
  if (Math.hypot(last.x - position.x, last.z - position.z) <= arriveRadius) {
    return null;
  }
  for (const point of path) {
    if (Math.hypot(point.x - position.x, point.z - position.z) > arriveRadius) {
      return point;
    }
  }
  return null;
};

/**
 * Descarta do início do caminho os pontos já alcançados (dentro de `arriveRadius`). A rota só anda
 * para frente: sem isso, chegar perto do primeiro ponto fazia a unidade mirar o segundo, que a puxava
 * de volta para fora do raio do primeiro, e ela oscilava entre os dois para sempre.
 * Devolve o mesmo array quando nada foi consumido.
 */
export const consumeReachedWaypoints = (
  position: GridPoint,
  path: GridPoint[],
  arriveRadius = 0.35
): GridPoint[] => {
  let reached = 0;
  while (
    reached < path.length &&
    Math.hypot(path[reached].x - position.x, path[reached].z - position.z) <= arriveRadius
  ) {
    reached += 1;
  }
  return reached === 0 ? path : path.slice(reached);
};
