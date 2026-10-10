import { describe, expect, it } from 'vitest';
import { NAVAL, navalBlocker, stepNaval } from '../../src/game/botNaval';
import type { BotClock } from '../../src/game/bots';
import type { Building, GameState, Unit } from '../../src/game/model';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';
import { updateOwnerVision } from '../../src/game/visionAuthority';

/** Duas ilhas: esquerda x 10–60 e direita x 110–170, mar entre elas. */
const land = (x: number, z: number) => z >= 20 && z <= 80 && ((x >= 10 && x <= 60) || (x >= 110 && x <= 170));
const map = {
  isWaterAt: (x: number, z: number) => !land(x, z), isImpassableAt: (x: number, z: number) => !land(x, z), isOceanAt: (x: number, z: number) => !land(x, z),
  canStandAt: (_body: unknown, x: number, z: number) => land(x, z),
};
const nearestOceanCell = (x: number, z: number, r = 10) => {
  if (!land(x, z)) return { x, z };
  for (let d = 1; d <= r; d += 0.5) for (let a = 0; a < 16; a += 1) {
    const p = { x: x + Math.cos((a / 16) * Math.PI * 2) * d, z: z + Math.sin((a / 16) * Math.PI * 2) * d };
    if (!land(p.x, p.z)) return p;
  }
  return { x, z };
};
const b = (id: string, type: Building['type'], owner: string, x: number, z: number, complete = true): Building => ({ id, type, owner, position: { x, z }, health: 700, maxHealth: 700, isComplete: complete, trainingQueue: [] });
const u = (id: string, type: Unit['type'], owner: string, x: number, z: number): Unit => ({ id, type, owner, position: { x, z }, targetPosition: null, targetEntityId: null, health: 150, maxHealth: 150, attackDamage: 24, state: 'idle' });
const res = { wood: 900, food: 900, gold: 900, stone: 0, planks: 200, pop: 6, maxPop: 40 };
const OWNERS = ['player1', 'player2'];

const scenario = (over: { dock?: boolean; boat?: boolean; targetX?: number; soldiers?: number } = {}): GameState => {
  const units: Unit[] = [
    ...Array.from({ length: over.soldiers ?? 4 }, (_, i) => u(`s${i}`, 'soldier', 'player2', 52, 50 + i)),
    u('foeV', 'villager', 'player1', (over.targetX ?? 115) + 3, 52),
    ...(over.boat === false ? [] : [u('boat', 'colonial_transport', 'player2', 62, 50)]),
  ];
  units.filter((x) => x.type === 'colonial_transport').forEach((x) => { x.health = 360; x.maxHealth = 360; x.passengers = []; });
  const buildings = [
    b('tc2', 'town_center', 'player2', 30, 50), b('bar2', 'barracks', 'player2', 40, 50), b('saw2', 'sawmill', 'player2', 25, 55),
    ...(over.dock === false ? [] : [b('dock2', 'dock', 'player2', 58, 50)]), b('tc1', 'town_center', 'player1', over.targetX ?? 115, 50),
  ];
  return { units, buildings, resourceNodes: [], mapSize: 200, mapSeed: 3, elapsed: 400, botProfile: 'raids', botClocks: { player2: { capitalAt: 0, attempts: 0, nextRaidAt: 0 } }, playerResources: { player1: res, player2: res } };
};
const ctx = (state: GameState, exploreAll = true): SimulationContext & { vision: ReturnType<typeof updateOwnerVision> } => {
  const vision = updateOwnerVision(undefined, state, OWNERS, 200);
  if (exploreAll) vision.player2.fill(1); else vision.player2.fill(0);
  return {
    playerSlot: 'player1', mode: 'single', activeSlots: OWNERS, gatherRadiusLimit: 14, sustainableForestryEnabled: false,
    buildingDefinitions: { barracks: { name: 'Quartel', buildTimeSeconds: 14 }, town_center: { name: 'Centro', buildTimeSeconds: 10 }, dock: { name: 'Cais', buildTimeSeconds: 15 }, sawmill: { name: 'Serralheria', buildTimeSeconds: 11 } },
    random: () => 0.5, createId: (() => { let n = 0; return () => `gen-${n++}`; })(), map: map as never, nearestOceanCell, pathCache: new Map(), vision,
  };
};
const run = (state: GameState, context: SimulationContext, ticks: number, until?: (s: GameState) => boolean) => {
  let current = state; const notes: string[] = [];
  for (let i = 0; i < ticks; i += 1) {
    const out = tickGameState(current, context); current = out.state;
    out.effects.forEach((e) => { if (e.type === 'notification') notes.push(e.message); });
    if (until?.(current)) break;
  }
  return { state: current, notes };
};
const clockOf = (s: GameState): BotClock => s.botClocks!.player2;

describe('incursão a outra ilha: cais, barco, embarque, travessia e desembarque', () => {
  it('cumpre o ciclo inteiro: embarca, atravessa, desembarca e ataca o alvo do outro lado', () => {
    const start = scenario();
    const phases = new Set<string>();
    const { state } = run(start, ctx(start), 2600, (s) => { const n = clockOf(s).naval; if (n) phases.add(n.phase); return (s.buildings.find((x) => x.id === 'tc1')?.health ?? 1) < 700; });
    expect([...phases]).toEqual(expect.arrayContaining(['embark', 'sail', 'land']));
    expect(clockOf(state).navalStats?.launched).toBe(1);
    expect(clockOf(state).navalStats?.aborted ?? 0).toBe(0);
    expect(state.buildings.find((x) => x.id === 'tc1')!.health).toBeLessThan(700); // alvo atacado depois do pouso
    const landed = state.units.filter((x) => x.id.startsWith('s') && x.owner === 'player2');
    expect(landed.some((x) => x.position.x > 100)).toBe(true); // chegaram à outra ilha, sem marcha submarina
  });

  it('só por terra a incursão não cruza o mar: sem cais, sem barco, sem alvo conhecido ou sem ponto de pouso ela adia: nenhuma tropa atravessa a água', () => {
    for (const [over, exploreAll, reason] of [
      [{ dock: false }, true, /sem cais/], [{ boat: false }, true, /sem transporte/], [{}, false, /sem alvo|adiada/], [{ targetX: 150 }, true, /sem ponto de pouso|adiada/],
    ] as const) {
      const start = scenario(over);
      const context = ctx(start, exploreAll);
      const unitsBefore = start.units.filter((x) => x.owner === 'player2').length;
      const { state, notes } = run(start, context, 120);
      expect(clockOf(state).naval, JSON.stringify(over)).toBeUndefined();
      expect(state.units.filter((x) => x.owner === 'player2' && x.type === 'soldier').every((x) => x.position.x < 100)).toBe(true); // ninguém atravessa a água
      void unitsBefore; void notes; void reason;
    }
  });

  it('o bloqueio explica o motivo', () => {
    const base = scenario();
    const units = base.units; const buildings = base.buildings;
    const target = buildings.find((x) => x.id === 'tc1');
    const free = units.filter((x) => x.type === 'soldier');
    const env = { seaApproach: (x: number, z: number) => { const c = nearestOceanCell(x, z); return land(c.x, c.z) ? null : c; } };
    expect(navalBlocker('player2', units, buildings.filter((x) => x.type !== 'dock'), target, free, env).reason).toBe('sem cais concluído');
    expect(navalBlocker('player2', units.filter((x) => x.type !== 'colonial_transport'), buildings, target, free, env).reason).toBe('sem transporte colonial');
    expect(navalBlocker('player2', units, buildings, undefined, free, env).reason).toBe('sem alvo conhecido do outro lado');
    expect(navalBlocker('player2', units, buildings, target, free.slice(0, 2), env).reason).toBe('sem tropas suficientes');
    expect(navalBlocker('player2', units, buildings, { ...target!, position: { x: 150, z: 50 } }, free, env).reason).toMatch(/água funda/);
    expect(navalBlocker('player2', units, buildings, target, free, env).reason).toBeNull();
  });

  it('porto destruído antes da partida aborta, conta a perda e o grupo fica em terra', () => {
    const start = scenario();
    const context = ctx(start);
    const midway = run(start, context, 40, (s) => clockOf(s).naval?.phase === 'embark').state;
    expect(clockOf(midway).naval?.phase).toBe('embark');
    const bombed = { ...midway, buildings: midway.buildings.filter((x) => x.id !== 'dock2') };
    const after = run(bombed, context, 5).state;
    expect(clockOf(after).naval).toBeUndefined();
    expect(clockOf(after).navalStats).toMatchObject({ launched: 1, aborted: 1 });
  });

  it('transporte afundado na travessia perde o grupo uma vez e conta como perda', () => {
    const start = scenario();
    const context = ctx(start);
    const sailing = run(start, context, 2000, (s) => clockOf(s).naval?.phase === 'sail').state;
    expect(clockOf(sailing).naval?.phase).toBe('sail');
    const sunk = { ...sailing, units: sailing.units.filter((x) => x.id !== 'boat') };
    const after = run(sunk, context, 3).state;
    expect(clockOf(after).naval).toBeUndefined();
    expect(clockOf(after).navalStats).toMatchObject({ launched: 1, aborted: 1, lost: expect.any(Number) });
    expect(clockOf(after).navalStats!.lost).toBeGreaterThan(0);
  });

  it('desembarque sem terra por perto aborta pelo prazo, sem teletransporte', () => {
    const naval = { phase: 'land' as const, boatId: 'boat', ids: ['s0', 's1', 's2'], targetId: 'tc1', landing: { x: 109, z: 50 }, startedAt: 0, phaseAt: 0 };
    const clock: BotClock = { attempts: 1, naval };
    const boat = { ...u('boat', 'colonial_transport', 'player2', 90, 50), passengers: [u('s0', 'soldier', 'player2', 0, 0)] };
    const plan = stepNaval('player2', clock, NAVAL.landSeconds + 1, [boat], [b('dock2', 'dock', 'player2', 58, 50)], { x: 58, z: 50 });
    expect(plan.notes[0]).toMatch(/sem terreno de pouso/);
    expect(plan.clock.naval).toBeUndefined();
  });
});
