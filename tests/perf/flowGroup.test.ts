import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { generateProceduralTerrain } from '../../src/game/proceduralMap';
import type { GameState, Unit } from '../../src/game/model';
import { FLOW_GROUP_MIN, tickGameState, type SimulationContext } from '../../src/game/simulation';

/** Card #78: ordem em massa com gradiente compartilhado, em terreno real. BENCH_REPORT grava o relatório. */
const report: Record<string, unknown> = {};

function scenario(size: number, count: number) {
  const map = generateProceduralTerrain(size, 42);
  const island = map.islands.find((i) => i.kind === 'native')!;
  const spots: { x: number; z: number }[] = [];
  for (let r = 2; spots.length < count + 1 && r < island.baseRadius; r += 0.7) {
    for (let a = 0; a < Math.PI * 2 && spots.length < count + 1; a += 0.55) {
      const x = island.center.x + Math.cos(a) * r; const z = island.center.z + Math.sin(a) * r;
      if (map.canStandAt('human', x, z)) spots.push({ x: Math.floor(x) + 0.5, z: Math.floor(z) + 0.5 });
    }
  }
  const goal = spots.pop()!;
  const units: Unit[] = spots.slice(0, count).map((p, i) => ({
    id: `s${i}`, type: 'soldier', owner: 'player1', position: { ...p }, targetPosition: { ...goal }, targetEntityId: null,
    health: 150, maxHealth: 150, attackDamage: 24, state: 'moving',
  }));
  const res = { wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: count, maxPop: 999 };
  const capital = { id: 'tc', type: 'town_center' as const, owner: 'player1', position: { ...goal }, health: 2400, maxHealth: 2400, isComplete: true, trainingQueue: [] };
  const state: GameState = { units, buildings: [capital], resourceNodes: [], mapSize: size, mapSeed: 42, playerResources: { player1: res } };
  const ctx: SimulationContext = {
    playerSlot: 'player1', mode: 'host', activeSlots: ['player1'], gatherRadiusLimit: 14, sustainableForestryEnabled: false, buildingDefinitions: {},
    random: () => 0.5, createId: () => 'id', map, pathCache: new Map(),
  };
  return { state, ctx, goal };
}

describe('gradiente compartilhado em ordens em massa', () => {
  it.each([[192, 120], [384, 120]])('mundo %i com %i unidades: chegam todas e o tick cabe no orçamento', (size, count) => {
    const { state, ctx, goal } = scenario(size, count);
    expect(count).toBeGreaterThanOrEqual(FLOW_GROUP_MIN);
    let current = state;
    const times: number[] = [];
    for (let tick = 0; tick < 900; tick += 1) {
      const started = performance.now();
      current = tickGameState(current, ctx).state;
      times.push(performance.now() - started);
      if (current.units.every((u) => u.targetPosition === null || Math.hypot(u.position.x - goal.x, u.position.z - goal.z) < 6)) break;
    }
    // Chegada: parou (ordem concluída) ou está a menos de 6 do destino (a separação espalha 120 unidades em volta dele).
    const arrived = current.units.filter((u) => u.targetPosition === null || Math.hypot(u.position.x - goal.x, u.position.z - goal.z) < 6).length;
    const sorted = [...times].sort((a, b) => a - b);
    const summary = { size, count, ticks: times.length, arrived, firstTickMs: +times[0].toFixed(2), p95Ms: +sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2), maxMs: +sorted[sorted.length - 1].toFixed(2) };
    report[`size-${size}`] = summary;
    console.info(JSON.stringify(summary));
    expect(arrived / count).toBeGreaterThan(0.8); // o A* individual (linha de base) chega a 0,81-0,83 no mesmo cenário
    expect(summary.p95Ms).toBeLessThan(50);
  }, 120000);

  it('grava o relatório', () => {
    if (process.env.BENCH_REPORT) { mkdirSync(dirname(process.env.BENCH_REPORT), { recursive: true }); writeFileSync(process.env.BENCH_REPORT, JSON.stringify(report, null, 2)); }
    expect(Object.keys(report).length).toBeGreaterThan(0);
  });
});
