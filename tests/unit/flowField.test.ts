import { describe, expect, it } from 'vitest';
import { buildFlowField, followFlowField } from '../../src/game/movement/flowField';
import { findPath } from '../../src/game/movement/pathfinding';

const SIZE = 40;
/** Mundo sintético: parede com uma passagem, lago bloqueado e uma faixa de raso (custo 3). */
const weight = (x: number, z: number): number => {
  const cx = Math.floor(x); const cz = Math.floor(z);
  if (cx === 20 && cz !== 30) return Infinity; // parede com passagem em z=30
  if (cx >= 5 && cx <= 12 && cz >= 8 && cz <= 14) return Infinity; // lago
  if (cz >= 20 && cz <= 22 && cx < 20) return 3; // raso
  return 1;
};
const blocked = (x: number, z: number) => !Number.isFinite(weight(x, z));

const costOf = (start: { x: number; z: number }, path: { x: number; z: number }[]): number => {
  let total = 0; let prev = { x: Math.floor(start.x), z: Math.floor(start.z) };
  for (const step of path) {
    const cell = { x: Math.floor(step.x), z: Math.floor(step.z) };
    total += (cell.x !== prev.x && cell.z !== prev.z ? Math.SQRT2 : 1) * Math.max(1, weight(step.x, step.z));
    prev = cell;
  }
  return total;
};

describe('campo de fluxo por destino', () => {
  const goal = { x: 35.5, z: 5.5 };
  const field = buildFlowField({ goal, weight, mapSize: SIZE })!;
  const starts = [{ x: 2.5, z: 2.5 }, { x: 3.5, z: 36.5 }, { x: 15.5, z: 25.5 }, { x: 30.5, z: 38.5 }, { x: 10.5, z: 21.5 }];

  it('o caminho pelo gradiente tem o mesmo custo do A* (inclusive no raso e contornando parede e lago)', () => {
    for (const start of starts) {
      const viaField = followFlowField(field, start);
      const viaAstar = findPath(start, goal, blocked, { mapSize: SIZE, weight });
      expect(viaField.length).toBeGreaterThan(0);
      const end = viaField[viaField.length - 1];
      expect(Math.floor(end.x)).toBe(35);
      expect(Math.floor(end.z)).toBe(5);
      expect(costOf(start, viaField)).toBeCloseTo(costOf(start, viaAstar), 6);
    }
  });

  it('nunca atravessa obstáculo nem corta canto', () => {
    for (const start of starts) {
      let prev = { x: Math.floor(start.x), z: Math.floor(start.z) };
      for (const step of followFlowField(field, start)) {
        expect(blocked(step.x, step.z)).toBe(false);
        const cell = { x: Math.floor(step.x), z: Math.floor(step.z) };
        if (cell.x !== prev.x && cell.z !== prev.z) {
          expect(blocked(cell.x + 0.5, prev.z + 0.5)).toBe(false);
          expect(blocked(prev.x + 0.5, cell.z + 0.5)).toBe(false);
        }
        prev = cell;
      }
    }
  });

  it('o mesmo campo atende o grupo todo: um único cálculo, vários caminhos', () => {
    expect(starts.every((start) => followFlowField(field, start).length > 0)).toBe(true);
    expect(field.expanded).toBeGreaterThan(0);
  });

  it('com os inícios do grupo o campo para antes de varrer o mapa inteiro', () => {
    const early = buildFlowField({ goal, weight, mapSize: SIZE, starts: [{ x: 33.5, z: 8.5 }] })!;
    expect(early.expanded).toBeLessThan(field.expanded);
    expect(followFlowField(early, { x: 33.5, z: 8.5 }).length).toBeGreaterThan(0);
  });

  it('início fora do campo ou destino bloqueado: sem rota e o chamador cai no A* (fallback seguro)', () => {
    const tiny = buildFlowField({ goal, weight, mapSize: SIZE, maxExpanded: 5 })!;
    expect(followFlowField(tiny, { x: 2.5, z: 2.5 })).toEqual([]);
    expect(buildFlowField({ goal: { x: 20.5, z: 5.5 }, weight, mapSize: SIZE })).toBeNull(); // dentro da parede
    expect(followFlowField(field, { x: 8.5, z: 10.5 })).toEqual([]); // início dentro do lago
  });

  it('mudança de terreno invalida o campo: um novo campo desvia da ponte erguida/derrubada', () => {
    const withBridge = (x: number, z: number) => (Math.floor(x) === 20 && Math.floor(z) === 5 ? 1 : weight(x, z));
    const before = followFlowField(field, { x: 15.5, z: 5.5 });
    const rebuilt = buildFlowField({ goal, weight: withBridge, mapSize: SIZE })!;
    const after = followFlowField(rebuilt, { x: 15.5, z: 5.5 });
    expect(after.length).toBeLessThan(before.length); // atalho pela nova passagem
  });
});
