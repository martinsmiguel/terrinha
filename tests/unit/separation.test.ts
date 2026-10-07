import { describe, expect, it } from 'vitest';
import { resolveSeparation, type Body } from '../../src/game/movement/separation';

const body = (id: string, x: number, z: number): Body => ({ id, x, z });

describe('resolveSeparation', () => {
  it('pushes overlapping units apart to at least 2 × radius', () => {
    const result = resolveSeparation([body('a', 10, 10), body('b', 10.2, 10)], { radius: 0.5 });

    const [a, b] = result;
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(0.999);
  });

  it('leaves well spaced units untouched', () => {
    const input = [body('a', 10, 10), body('b', 20, 20)];
    expect(resolveSeparation(input)).toEqual(input);
  });

  it('does not mutate the input array', () => {
    const input = [body('a', 10, 10), body('b', 10.1, 10)];
    resolveSeparation(input);

    expect(input[0]).toEqual({ id: 'a', x: 10, z: 10 });
    expect(input[1]).toEqual({ id: 'b', x: 10.1, z: 10 });
  });

  it('separates a pile of units occupying the same spot', () => {
    const pile = [body('a', 30, 30), body('b', 30, 30), body('c', 30, 30), body('d', 30, 30)];
    const result = resolveSeparation(pile, { radius: 0.5, iterations: 4 });

    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const distance = Math.hypot(result[i].x - result[j].x, result[i].z - result[j].z);
        expect(distance).toBeGreaterThanOrEqual(0.9);
      }
    }
  });

  it('keeps every body inside the map bounds', () => {
    const result = resolveSeparation([body('a', 0.2, 0.2), body('b', 0.3, 0.3)], {
      radius: 0.5,
      mapSize: 60,
      iterations: 4,
    });

    for (const point of result) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(60);
      expect(point.z).toBeGreaterThanOrEqual(0);
      expect(point.z).toBeLessThanOrEqual(60);
    }
  });

  it('refuses to move a unit into blocked terrain', () => {
    const blocked = (x: number, _z: number): boolean => x >= 20;
    const result = resolveSeparation([body('a', 19.7, 10), body('b', 20.5, 10)], {
      radius: 0.5,
      isBlocked: blocked,
      iterations: 4,
    });

    expect(result[0].x).toBeLessThan(20);
  });

  it('stays within the tick budget for 200 units', () => {
    const units: Body[] = [];
    for (let i = 0; i < 200; i++) {
      units.push(body(`u${i}`, (i % 20) * 3, Math.floor(i / 20) * 3));
    }
    // Douze unidades amontoadas forçam trabalho real no broad-phase.
    for (let i = 0; i < 12; i++) {
      units.push(body(`c${i}`, 40 + i * 0.05, 40));
    }

    const startedAt = performance.now();
    resolveSeparation(units, { radius: 0.5 });
    const elapsed = performance.now() - startedAt;

    expect(elapsed).toBeLessThan(50);
  });
});
