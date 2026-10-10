import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findPath } from '../../src/game/movement/pathfinding';
import { generateProceduralTerrain } from '../../src/game/proceduralMap';

/**
 * Card #77: A* real sobre terreno real, por escala. Mede tempo (p50/p95/p99), chegada (rota completa até o destino; rota parcial
 * NÃO é chegada) e comprimento contra a linha reta. Decide se navegação hierárquica (HPA*) é necessária na escala efetiva.
 * BENCH_REPORT=<arquivo.json> grava o relatório.
 */
const SIZES = [60, 192, 384, 768];
const SAMPLES = 120;
const SIM_MAX_EXPANDED = 2400;
const report: Record<string, unknown> = {};

const pct = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return +sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)].toFixed(3);
};
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

describe('A* real por escala (base da decisão sobre HPA*)', () => {
  it.each(SIZES)('mundo %i: tempo, chegada e comprimento em pares de terra da mesma ilha', (size) => {
    const map = generateProceduralTerrain(size, 31337);
    const random = rng(size);
    const island = map.islands.find((candidate) => candidate.kind === 'native')!;
    const pick = () => {
      for (let tries = 0; tries < 400; tries += 1) {
        const angle = random() * Math.PI * 2;
        const radius = random() * island.baseRadius * 0.9;
        const x = island.center.x + Math.cos(angle) * radius;
        const z = island.center.z + Math.sin(angle) * radius;
        if (map.canStandAt('human', x, z)) return { x: Math.floor(x) + 0.5, z: Math.floor(z) + 0.5 };
      }
      return null;
    };
    const blocked = (x: number, z: number) => !map.canStandAt('human', x, z);
    const times: number[] = [];
    let arrived = 0;
    let partial = 0;
    const ratios: number[] = [];
    for (let i = 0; i < SAMPLES; i += 1) {
      const from = pick();
      const to = pick();
      if (!from || !to || Math.hypot(from.x - to.x, from.z - to.z) < 8) continue;
      const started = performance.now();
      const path = findPath(from, to, blocked, { mapSize: size, maxExpanded: SIM_MAX_EXPANDED });
      times.push(performance.now() - started);
      const end = path[path.length - 1];
      if (path.length > 0 && Math.hypot(end.x - to.x, end.z - to.z) <= 1.5) {
        arrived += 1;
        let length = 0;
        let prev = from;
        for (const step of path) { length += Math.hypot(step.x - prev.x, step.z - prev.z); prev = step; }
        ratios.push(length / Math.hypot(from.x - to.x, from.z - to.z));
      } else if (path.length > 0) partial += 1;
    }
    const summary = { size, samples: times.length, arrived, partial, p50: pct(times, 50), p95: pct(times, 95), p99: pct(times, 99), meanLengthRatio: +(ratios.reduce((a, b) => a + b, 0) / Math.max(1, ratios.length)).toFixed(3) };
    report[`size-${size}`] = summary;
    console.info(JSON.stringify(summary));
    expect(times.length).toBeGreaterThan(10);
    // Rota parcial não conta como chegada: chegada exige alcançar o destino.
    expect(arrived / times.length).toBeGreaterThan(0.9);
    expect(summary.p99).toBeLessThan(50); // uma busca isolada cabe no orçamento do tick de 50 ms
  }, 60000);

  it('grava o relatório quando BENCH_REPORT está definido', () => {
    if (process.env.BENCH_REPORT) {
      mkdirSync(dirname(process.env.BENCH_REPORT), { recursive: true });
      writeFileSync(process.env.BENCH_REPORT, JSON.stringify(report, null, 2));
    }
    expect(Object.keys(report).length).toBeGreaterThan(0);
  });
});
