import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { generateProceduralTerrain, findNearestOceanCell, type ProceduralMapResult } from '../../src/game/proceduralMap';
import { findPath } from '../../src/game/movement/pathfinding';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';
import { applyEmbarkOrder, disembarkPassengers } from '../../src/game/navalTransport';
import { checkBuildingPlacementValid } from '../../src/game/buildingGhost';
import { BUILDING_CATALOG } from '../../src/game/buildingCatalog';
import { findDockOceanSpawnCell } from '../../src/game/dockPlacement';
import { UNIT_COSTS } from '../../src/game/economy';
import type { Building, GameState, PlayerResources, Unit } from '../../src/game/model';

/**
 * Ensaio de desempenho do arquipélago com terreno real (card #52, fatia BASE).
 * Mede a duração de cada passo de simulação (orçamento: 50 ms, tick de 20 Hz), a latência de uma ordem
 * em massa e o ciclo naval completo. Defina BENCH_REPORT=<arquivo.json> para gravar o relatório.
 */
const TICK_BUDGET_MS = 50;
const SEEDS = [1, 42, 777777];
const report: Record<string, unknown> = {};

const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};
const summarize = (values: number[]) => ({
  samples: values.length,
  p50: +percentile(values, 50).toFixed(3),
  p95: +percentile(values, 95).toFixed(3),
  max: +Math.max(...values).toFixed(3),
});

const resources = (): PlayerResources => ({ wood: 5000, food: 5000, gold: 5000, stone: 5000, planks: 5000, pop: 0, maxPop: 999 });
const stateOf = (units: Unit[], buildings: Building[] = []): GameState => ({
  units, buildings, resourceNodes: [], playerResources: { player1: resources(), player2: resources() },
});
const contextFor = (map: ProceduralMapResult, overrides: Partial<SimulationContext> = {}): SimulationContext => ({
  playerSlot: 'player1',
  mode: 'host',
  map,
  pathCache: new Map(),
  gatherRadiusLimit: 14,
  sustainableForestryEnabled: false,
  buildingDefinitions: Object.fromEntries(Object.entries(BUILDING_CATALOG).map(([type, def]) => [type, { name: def.name, buildTimeSeconds: def.buildTimeSeconds }])),
  random: () => 0.5,
  createId: (() => { let n = 0; return () => `bench-${n += 1}`; })(),
  activeSlots: ['player1', 'player2'],
  ...overrides,
});
const unit = (id: string, owner: string, x: number, z: number, extra: Partial<Unit> = {}): Unit => ({
  id, type: 'villager', owner, position: { x, z }, targetPosition: null, targetEntityId: null,
  health: 100, maxHealth: 100, attackDamage: 5, state: 'idle', ...extra,
});

/** Componentes de terra conectados (grade de 1 unidade), da maior para a menor. */
function landComponents(map: ProceduralMapResult): { x: number; z: number }[][] {
  const size = map.mapSize;
  const seen = new Set<number>();
  const components: { x: number; z: number }[][] = [];
  const walkable = (x: number, z: number) => x >= 1 && z >= 1 && x < size - 1 && z < size - 1 && !map.isImpassableAt(x + 0.5, z + 0.5);
  for (let x = 1; x < size - 1; x += 1) {
    for (let z = 1; z < size - 1; z += 1) {
      if (seen.has(x * size + z) || !walkable(x, z)) continue;
      const stack = [[x, z]];
      const cells: { x: number; z: number }[] = [];
      seen.add(x * size + z);
      while (stack.length) {
        const [cx, cz] = stack.pop()!;
        cells.push({ x: cx + 0.5, z: cz + 0.5 });
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, nz = cz + dz, key = nx * size + nz;
          if (!seen.has(key) && walkable(nx, nz)) { seen.add(key); stack.push([nx, nz]); }
        }
      }
      components.push(cells);
    }
  }
  return components.sort((a, b) => b.length - a.length);
}

function movementScenario(map: ProceduralMapResult, unitCount: number, unreachableShare: number) {
  const components = landComponents(map);
  const main = components[0];
  const other = components[1] ?? main;
  const units = Array.from({ length: unitCount }, (_, i) => {
    const start = main[(i * 37) % main.length];
    const reachable = i / unitCount >= unreachableShare;
    const goalPool = reachable ? main : other;
    let goal = goalPool[(i * 101 + 17) % goalPool.length];
    for (let k = 1; reachable && Math.hypot(goal.x - start.x, goal.z - start.z) < 12 && k < 20; k += 1) goal = goalPool[(i * 101 + 17 + k * 53) % goalPool.length];
    return unit(`u${i}`, i % 2 ? 'player2' : 'player1', start.x, start.z, { state: 'moving', targetPosition: goal });
  });
  return units;
}

describe('arquipélago em mapa procedural real: movimento em massa', () => {
  const rows: Record<string, unknown>[] = [];
  for (const unitCount of [120, 240]) {
    it.each(SEEDS)(`${unitCount} unidades, seed %i: tick dentro do orçamento de ${TICK_BUDGET_MS} ms`, (seed) => {
      const map = generateProceduralTerrain(60, seed);
      const ctx = contextFor(map);
      // Partida realista: cada lado tem a capital em pé; sem ela a regra de eliminação limparia as ordens.
      const capital = (owner: string, spawn: { x: number; z: number }): Building => ({
        id: `capital-${owner}`, type: 'town_center', owner, position: { ...spawn }, health: 2400, maxHealth: 2400, isComplete: true, trainingQueue: [],
      });
      let state = stateOf(movementScenario(map, unitCount, 0.2), [capital('player1', map.player1Spawn), capital('player2', map.player2Spawn)]);
      const tickMs: number[] = [];
      let commandLatencyMs = 0;
      let movingAtTick20 = 0;
      for (let tick = 0; tick < 200; tick += 1) {
        const startedAt = performance.now();
        state = tickGameState(state, ctx).state;
        const elapsed = performance.now() - startedAt;
        if (tick === 0) commandLatencyMs = elapsed; // ordem em massa: todos os caminhos calculados neste tick
        tickMs.push(elapsed);
        if (tick === 19) movingAtTick20 = state.units.filter((u) => u.state === 'moving').length;
      }
      rows.push({ unitCount, seed, commandLatencyMs: +commandLatencyMs.toFixed(3), tick: summarize(tickMs), movingAtTick20 });
      expect(movingAtTick20).toBeGreaterThan(unitCount * 0.5); // o cenário não pode degenerar em unidades ociosas
      expect(percentile(tickMs, 95)).toBeLessThan(TICK_BUDGET_MS);
      expect(commandLatencyMs).toBeLessThan(TICK_BUDGET_MS * 4);
    });
  }
  it('registra o relatório de movimento', () => { report.movement = rows; });
});

describe('tamanhos de mapa no gerador e no A*', () => {
  const rows: Record<string, unknown>[] = [];
  it.each([60, 90, 120])('mapa %ix%i: gera, posiciona os quatro pontos de chegada e acha caminho', (size) => {
    const startedAt = performance.now();
    const map = generateProceduralTerrain(size, 42);
    const generationMs = performance.now() - startedAt;
    expect(map.mapSize).toBe(size);
    for (const spawn of [map.player1Spawn, map.player2Spawn, map.player3Spawn, map.player4Spawn]) {
      expect(spawn.x).toBeGreaterThan(0); expect(spawn.x).toBeLessThan(size);
      expect(spawn.z).toBeGreaterThan(0); expect(spawn.z).toBeLessThan(size);
    }
    const aStarMs: number[] = [];
    const components = landComponents(map);
    const main = components[0];
    for (let i = 0; i < 20; i += 1) {
      const from = main[(i * 131) % main.length], to = main[(i * 211 + 97) % main.length];
      const startedPath = performance.now();
      findPath(from, to, (x, z) => map.isImpassableAt(x, z), { mapSize: size, maxExpanded: 2400 });
      aStarMs.push(performance.now() - startedPath);
    }
    rows.push({ size, generationMs: +generationMs.toFixed(1), aStarMs: summarize(aStarMs) });
  }, 60000);
  it('registra o relatório de tamanhos', () => {
    report.mapSizes = rows;
    report.supportedSize = 'O produto suporta 60x60: MAP_SIZE, a validação de rede (limite 60) e o grid de névoa são fixos em 60. O gerador e o A* aceitam 90 e 120, mas o tick completo só é validado em 60.';
  });
});

describe('ciclo naval completo sem cheats', () => {
  it('constrói o cais, treina o barco, embarca, viaja e desembarca em outra ilha dentro do orçamento', () => {
    const map = generateProceduralTerrain(60, 42);
    const home = landComponents(map)[0];
    const toHere = (x: number, z: number) => x >= 4 && z >= 4 && x <= 56 && z <= 56;
    // Sítio de cais: terra válida para 'dock' com oceano navegável por perto.
    const site = home.find((cell) => toHere(cell.x, cell.z) && checkBuildingPlacementValid('dock', cell.x, cell.z, [], [], 60, map.isWaterAt, map.isCliffAt, map.getHeightAt, map.isOceanAt).isValid);
    expect(site, 'sem sítio de cais no mapa de teste').toBeTruthy();

    const dock: Building = { id: 'dock-1', type: 'dock', owner: 'player1', position: { x: site!.x, z: site!.z }, health: 50, maxHealth: BUILDING_CATALOG.dock.maxHealth, isComplete: false, buildProgress: 0, trainingQueue: [] };
    const builder = unit('builder', 'player1', site!.x + 1.2, site!.z, { state: 'building', targetEntityId: 'dock-1' });
    const crew = [unit('crew-1', 'player1', site!.x + 1.5, site!.z + 0.5), unit('crew-2', 'player1', site!.x + 1.7, site!.z - 0.5)];
    let state = stateOf([builder, ...crew], [dock]);
    const ctx = contextFor(map, { activeSlots: ['player1'] });
    const phases: Record<string, { ticks: number; tick: ReturnType<typeof summarize> }> = {};
    const runUntil = (name: string, done: () => boolean, maxTicks: number) => {
      const times: number[] = [];
      let ticks = 0;
      while (!done() && ticks < maxTicks) {
        const startedAt = performance.now();
        state = tickGameState(state, ctx).state;
        times.push(performance.now() - startedAt);
        ticks += 1;
      }
      phases[name] = { ticks, tick: summarize(times.length ? times : [0]) };
      expect(done(), `fase "${name}" não terminou em ${maxTicks} passos`).toBe(true);
    };

    runUntil('construcao-do-cais', () => state.buildings.find((b) => b.id === 'dock-1')!.isComplete, 4000);

    // Treino pela fila do cais, pagando o custo como o jogo paga.
    const cost = UNIT_COSTS.trade_boat;
    const paid = { ...state.playerResources.player1 };
    for (const [key, value] of Object.entries(cost)) (paid as unknown as Record<string, number>)[key] -= value ?? 0;
    state = {
      ...state,
      playerResources: { ...state.playerResources, player1: paid },
      buildings: state.buildings.map((b) => (b.id === 'dock-1' ? { ...b, trainingQueue: [{ unitType: 'trade_boat', progress: 0 }] } : b)),
    };
    const oceanSpawn = findDockOceanSpawnCell(map.isOceanAt, site!.x, site!.z, site!.x, site!.z);
    expect(oceanSpawn, 'cais sem oceano na janela de nascimento').toBeTruthy();
    runUntil('treino-do-barco', () => state.units.some((u) => u.type === 'trade_boat'), 4000);

    const boat = () => state.units.find((u) => u.type === 'trade_boat')!;
    state = applyEmbarkOrder(state, crew.map((u) => u.id), boat().id, 0).state; // ordem de aproximação, sem teletransporte
    runUntil('embarque', () => (boat().passengers?.length ?? 0) === 2, 2000);

    // Destino: costa de outra ilha (a chegada do jogador 2).
    const target = findNearestOceanCell(map, map.player2Spawn.x, map.player2Spawn.z, 12);
    state = { ...state, units: state.units.map((u) => (u.id === boat().id ? { ...u, targetPosition: target, state: 'moving' } : u)) };
    runUntil('viagem', () => boat().state === 'idle', 4000);

    const landed = disembarkPassengers(state, boat().id, map);
    state = landed.state;
    expect(landed.placed).toHaveLength(2);
    for (const placed of landed.placed) expect(map.isImpassableAt(placed.position.x, placed.position.z)).toBe(false);
    const component = (x: number, z: number) => landComponents(map).findIndex((cells) => cells.some((c) => Math.hypot(c.x - x, c.z - z) < 0.8));
    expect(component(landed.placed[0].position.x, landed.placed[0].position.z)).not.toBe(component(site!.x, site!.z));

    const allTicks = Object.values(phases).flatMap((phase) => [phase.tick.p95]);
    report.navalCycle = { seed: 42, phases, worstPhaseP95Ms: Math.max(...allTicks), landed: landed.placed.length };
    for (const phase of Object.values(phases)) expect(phase.tick.p95).toBeLessThan(TICK_BUDGET_MS);
  }, 120000);
});

describe('relatório', () => {
  it('grava o relatório quando BENCH_REPORT está definido', () => {
    report.environment = {
      node: process.version, platform: process.platform, arch: process.arch,
      cpu: cpus()[0]?.model, cores: cpus().length, memoryGb: Math.round(totalmem() / 2 ** 30),
      tickBudgetMs: TICK_BUDGET_MS, seeds: SEEDS,
    };
    const target = process.env.BENCH_REPORT;
    if (!target) return;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  });
});
