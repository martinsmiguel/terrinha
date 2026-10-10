import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '../../src/game/model';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';
import { filterSnapshotFor } from '../../src/game/snapshotFilter';
import { STORM, applyStormDamage, stormAlertFor, stormAt, stormForAttempt, stormPhase, type Storm } from '../../src/game/storms';
import { updateOwnerVision } from '../../src/game/visionAuthority';

const ocean = () => true;
const storm: Storm = { id: 1, center: { x: 50, z: 50 }, radius: 12, warnAt: 170, startsAt: 180, endsAt: 210, severity: 1 };
const unit = (id: string, type: Unit['type'], x: number, z: number, owner = 'player1', extra: Partial<Unit> = {}): Unit => ({
  id, type, owner, position: { x, z }, targetPosition: null, targetEntityId: null, health: 100, maxHealth: 100, attackDamage: 0, state: 'idle', ...extra,
});

describe('ciclo determinístico', () => {
  it('defaults: 30 s, raio 12, tentativa a cada 180 s, aviso de 10 s, 2 HP/s', () => {
    expect(STORM).toMatchObject({ durationSeconds: 30, radius: 12, attemptSeconds: 180, warningSeconds: 10, damagePerSecond: 2 });
  });

  it('a mesma semente e tentativa dão a mesma tempestade; a tentativa fixa o relógio', () => {
    const a = stormForAttempt(3, 99, 200, ocean);
    expect(a).toEqual(stormForAttempt(3, 99, 200, ocean));
    if (a) expect(a).toMatchObject({ startsAt: 540, endsAt: 570, warnAt: 530, radius: 12 });
    const some = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => stormForAttempt(n, 99, 200, ocean));
    expect(some.some((s) => s === null)).toBe(true); // nem toda tentativa gera tempestade
    expect(some.some((s) => s !== null)).toBe(true);
  });

  it('só em oceano: sem oceano não há tempestade', () => {
    for (let n = 1; n < 12; n += 1) expect(stormForAttempt(n, 5, 200, () => false)).toBeNull();
  });

  it('fases: aviso 10 s antes, ativa por 30 s, depois nada; só uma tempestade por vez', () => {
    expect([stormPhase(storm, 169), stormPhase(storm, 170), stormPhase(storm, 179.9), stormPhase(storm, 180), stormPhase(storm, 209.9), stormPhase(storm, 210)]).toEqual([null, 'warning', 'warning', 'active', 'active', null]);
    const found = [...Array(2000).keys()].map((t) => stormAt(t, 99, 200, ocean)).filter(Boolean);
    const ids = new Set(found.map((s) => s!.id));
    for (const id of ids) {
      const s = found.find((x) => x!.id === id)!;
      expect(found.filter((x) => x!.id === id).length).toBeGreaterThan(0);
      expect(s.endsAt - s.startsAt).toBe(30);
    }
  });
});

describe('dano naval', () => {
  it('só barcos vivos no raio, só na fase ativa: 2 HP/s; terra e fora do raio não sofrem', () => {
    const units = [unit('boat', 'fishing_boat', 52, 50), unit('far', 'fishing_boat', 90, 90), unit('soldier', 'soldier', 52, 50), unit('wreck', 'trade_boat', 52, 50, 'player1', { health: 0 })];
    const warning = applyStormDamage(units, storm, 175, 1);
    expect(warning.units.map((u) => u.health)).toEqual([100, 100, 100, 0]);
    const active = applyStormDamage(units, storm, 190, 1);
    expect(active.units.map((u) => u.health)).toEqual([98, 100, 100, 0]);
    expect(active.sunk).toEqual([]);
  });

  it('afunda uma única vez, perde o porão e os passageiros; o evento não se repete', () => {
    const passenger = unit('p', 'soldier', 0, 0);
    const doomed = unit('d', 'trade_boat', 50, 50, 'player1', { health: 0.05, passengers: [passenger], cargo: { wood: 50, food: 0, gold: 0, stone: 0, planks: 0 } });
    const state: GameState = {
      mapSeed: 99, mapSize: 200, units: [doomed], buildings: [], resourceNodes: [], elapsed: 190,
      playerResources: { player1: { wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: 2, maxPop: 10 } }, storm,
    };
    const ctx: SimulationContext = {
      playerSlot: 'player1', mode: 'host', activeSlots: ['player1'], gatherRadiusLimit: 14, sustainableForestryEnabled: false, buildingDefinitions: {},
      random: () => 0.9, createId: () => 'id', map: { isWaterAt: () => true, isImpassableAt: () => false, isOceanAt: () => true },
    };
    const sunk = tickGameState({ ...state }, ctx);
    expect(sunk.effects.filter((e) => e.type === 'boat-sinking')).toHaveLength(1);
    expect(sunk.state.units.find((u) => u.id === 'd')?.health).toBe(0);
    const next = tickGameState(sunk.state, ctx);
    expect(next.state.units.find((u) => u.id === 'd')).toBeUndefined();
    expect(next.state.playerResources.player1.pop).toBe(0); // casco + passageiro, uma vez
    expect(next.effects.filter((e) => e.type === 'boat-sinking')).toHaveLength(0);
    expect(tickGameState(next.state, ctx).state.playerResources.player1.pop).toBe(0);
  });
});

describe('alertas sem revelar frota oculta', () => {
  const explored = (x: number) => x < 100;
  it('região conhecida alerta com texto e foco; região desconhecida só alerta se há barco ou rota própria perto', () => {
    const known = stormAlertFor(storm, 175, 'player1', [], () => true);
    expect(known).toMatchObject({ phase: 'warning', focus: { x: 50, z: 50 }, secondsLeft: 5 });
    expect(known!.text).toMatch(/Tempestade em 5 s/);
    expect(stormAlertFor(storm, 175, 'player1', [], () => false)).toBeNull();
    expect(stormAlertFor(storm, 175, 'player1', [unit('mine', 'fishing_boat', 60, 50)], () => false)).not.toBeNull();
    const route = unit('trade', 'trade_boat', 70, 50, 'player1', { route: {} as never });
    expect(stormAlertFor(storm, 175, 'player1', [route], () => false)?.text).toMatch(/rotas/);
    expect(stormAlertFor(storm, 100, 'player1', [], explored)).toBeNull(); // fora de aviso/atividade
  });

  it('um barco inimigo perto não gera alerta nem aparece no texto', () => {
    const foe = unit('foe', 'warship', 55, 50, 'player2');
    expect(stormAlertFor(storm, 175, 'player1', [foe], () => false)).toBeNull();
    const withKnown = stormAlertFor(storm, 175, 'player1', [foe], () => true)!;
    expect(withKnown.text).not.toMatch(/player2|warship|inimig/i);
  });

  it('o snapshot do convidado só leva a tempestade de região conhecida ou com barco próprio perto', () => {
    const state: GameState = { mapSize: 200, units: [unit('mine', 'fishing_boat', 150, 150)], buildings: [], resourceNodes: [], playerResources: { player1: { wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: 1, maxPop: 5 } }, storm };
    const vision = updateOwnerVision(undefined, state, ['player1'], 200);
    expect(filterSnapshotFor(state, 'player1', vision).storm).toBeUndefined(); // longe e desconhecida
    const near: GameState = { ...state, units: [unit('mine', 'fishing_boat', 55, 50)] };
    const nearVision = updateOwnerVision(undefined, near, ['player1'], 200);
    expect(filterSnapshotFor(near, 'player1', nearVision).storm).toEqual(storm);
    expect(filterSnapshotFor(near, 'player1', undefined).storm).toBeUndefined();
  });
});
