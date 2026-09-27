import { describe, expect, it } from 'vitest';
import { findPath, nextWaypoint } from '../../src/game/movement/pathfinding';

const MAP = 60;
const options = { mapSize: MAP, cellSize: 1 };

/** Mapa vazio: nada bloqueado. */
const empty = (): (() => boolean) => () => false;

/** Bloqueia uma caixa de células inclusive (coordenadas de mundo). */
const box = (minX: number, minZ: number, maxX: number, maxZ: number) => (x: number, z: number) =>
  x >= minX && x <= maxX && z >= minZ && z <= maxZ;

const worldToCell = (value: number): number => Math.floor(value);

describe('findPath', () => {
  it('walks straight across an empty map', () => {
    const path = findPath({ x: 5.5, z: 5.5 }, { x: 12.5, z: 5.5 }, empty(), options);

    expect(path.length).toBe(7);
    expect(path[0]).toEqual({ x: 6.5, z: 5.5 });
    expect(path[path.length - 1]).toEqual({ x: 12.5, z: 5.5 });
    for (const point of path) {
      expect(point.z).toBe(5.5);
    }
  });

  it('returns nothing when start equals goal', () => {
    expect(findPath({ x: 5.5, z: 5.5 }, { x: 5.5, z: 5.5 }, empty(), options)).toEqual([]);
  });

  it('returns nothing when the start or the goal is blocked', () => {
    const blockedStart = box(5.5, 5.5, 5.5, 5.5);
    expect(findPath({ x: 5.5, z: 5.5 }, { x: 12.5, z: 12.5 }, blockedStart, options)).toEqual([]);

    const blockedGoal = box(12.5, 12.5, 12.5, 12.5);
    expect(findPath({ x: 5.5, z: 5.5 }, { x: 12.5, z: 12.5 }, blockedGoal, options)).toEqual([]);
  });

  it('returns nothing when the goal is outside the map', () => {
    expect(findPath({ x: 5.5, z: 5.5 }, { x: 99.5, z: 5.5 }, empty(), options)).toEqual([]);
  });

  it('detours around an obstacle keeping every waypoint walkable', () => {
    const wall = box(10.5, -0.5, 10.5, 30.5);
    const path = findPath({ x: 5.5, z: 5.5 }, { x: 15.5, z: 5.5 }, wall, options);

    expect(path.length).toBeGreaterThan(10);
    for (const point of path) {
      expect(wall(point.x, point.z)).toBe(false);
      expect(worldToCell(point.x)).toBeLessThan(MAP);
    }
    expect(path[path.length - 1]).toEqual({ x: 15.5, z: 5.5 });
  });

  it('returns nothing when the obstacle seals the route', () => {
    const wall = box(10.5, -0.5, 10.5, MAP);
    expect(findPath({ x: 5.5, z: 5.5 }, { x: 15.5, z: 5.5 }, wall, options)).toEqual([]);
  });

  it('does not cut corners through a diagonal gap', () => {
    // Only cells (5,5) and (6,6) are open; the two orthogonal cells between
    // them are sealed, so the diagonal step would squeeze through a corner.
    const blocksDiagonal = (x: number, z: number): boolean => {
      const cx = worldToCell(x);
      const cz = worldToCell(z);
      return !((cx === 5 && cz === 5) || (cx === 6 && cz === 6));
    };
    const path = findPath({ x: 5.5, z: 5.5 }, { x: 6.5, z: 6.5 }, blocksDiagonal, options);

    expect(path).toEqual([]);
  });

  it('returns a partial path when the expansion budget runs out', () => {
    const wall = box(20.5, -0.5, 20.5, MAP);
    const path = findPath({ x: 5.5, z: 5.5 }, { x: 30.5, z: 5.5 }, wall, { ...options, maxExpanded: 5 });

    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1].x).toBeLessThan(30.5);
    for (const point of path) {
      expect(wall(point.x, point.z)).toBe(false);
    }
  });

  it('keeps marching when a connected route exceeds the 2.400 expansion budget', () => {
    const SIZE = 100;
    const opts = { mapSize: SIZE, cellSize: 1, maxExpanded: 2400 };
    // Cobaca em serpentina: paredes nas linhas impares com um vao alternado nas
    // pontas; chegar ao outro canto exige percorrer ~5.000 celulas, acima do
    // orcamento de 2.400 expansoes usado pelo tick do host.
    const snake = (x: number, z: number): boolean => {
      const cx = Math.floor(x);
      const cz = Math.floor(z);
      if (cz % 2 === 0) return false;
      const gap = ((cz - 1) / 2) % 2 === 0 ? SIZE - 1 : 0;
      return cx !== gap;
    };

    const goal = { x: 0.5, z: 98.5 };
    const legs: { x: number; z: number }[] = [];
    let from = { x: 1.5, z: 0.5 };

    for (let i = 0; i < 8; i++) {
      const leg = findPath(from, goal, snake, opts);
      if (leg.length === 0) break;
      for (const point of leg) {
        expect(snake(point.x, point.z)).toBe(false);
      }
      const end = leg[leg.length - 1];
      legs.push(end);
      if (end.x === goal.x && end.z === goal.z) break;
      from = end;
    }

    // A primeira chamada esgota o orcamento no meio da cobaca (trecho parcial)
    // e as chamadas seguintes continuam de onde a anterior parou.
    expect(legs.length).toBeGreaterThan(1);
    expect(legs[legs.length - 1]).toEqual(goal);
  });

  it('serves 100 searches on the full map within the tick budget', () => {
    const obstacles = (x: number, z: number): boolean =>
      box(15, 15, 25, 40)(x, z) || box(35, 5, 45, 30)(x, z);

    const startedAt = performance.now();
    for (let i = 0; i < 100; i++) {
      const path = findPath({ x: 2.5, z: 2.5 + (i % 20) }, { x: 55.5, z: 55.5 }, obstacles, options);
      expect(path.length).toBeGreaterThan(0);
    }
    const elapsed = performance.now() - startedAt;

    expect(elapsed).toBeLessThan(500);
  });
});

describe('nextWaypoint', () => {
  const path = [
    { x: 6.5, z: 5.5 },
    { x: 7.5, z: 5.5 },
    { x: 8.5, z: 5.5 },
  ];

  it('returns the first point still ahead of the unit', () => {
    expect(nextWaypoint({ x: 5.5, z: 5.5 }, path)).toEqual({ x: 6.5, z: 5.5 });
  });

  it('skips waypoints already reached', () => {
    expect(nextWaypoint({ x: 6.5, z: 5.5 }, path)).toEqual({ x: 7.5, z: 5.5 });
  });

  it('returns null at the end of the path', () => {
    expect(nextWaypoint({ x: 8.5, z: 5.5 }, path)).toBeNull();
    expect(nextWaypoint({ x: 50, z: 50 }, [])).toBeNull();
  });
});
