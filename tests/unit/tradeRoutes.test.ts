import { describe, expect, it } from 'vitest';
import { HOME, stockAt, type LocalityResolver } from '../../src/game/depots';
import type { Building, GameState, Unit } from '../../src/game/model';
import { isAuthorizedPlayerCommand } from '../../src/game/networkCommands';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';
import { assignRoute, cancelRoute, redirectRoute, routeProblems, stepRoute, type RouteConfig } from '../../src/game/tradeRoutes';

/** x < 100: natal; o resto: ilha colonial "1". */
const localityOf: LocalityResolver = (_owner, position) => (position.x < 100 ? HOME : '1');
const rich = { wood: 1000, food: 1000, gold: 1000, stone: 1000, planks: 1000, pop: 5, maxPop: 30 };
const dock = (id: string, x: number, overrides: Partial<Building> = {}): Building => ({
  id, type: 'dock', owner: 'player1', position: { x, z: 20 }, health: 700, maxHealth: 700, isComplete: true, trainingQueue: [], ...overrides,
});
const outpost: Building = { id: 'post', type: 'outpost', owner: 'player1', position: { x: 150, z: 30 }, health: 900, maxHealth: 900, isComplete: true, trainingQueue: [] };
const boat = (overrides: Partial<Unit> = {}): Unit => ({
  id: 'boat', type: 'trade_boat', owner: 'player1', position: { x: 28, z: 20 }, targetPosition: null, targetEntityId: null,
  health: 220, maxHealth: 220, attackDamage: 0, state: 'idle', ...overrides,
});
const A = { buildingId: 'dockA', berth: { x: 28, z: 20 } };
const B = { buildingId: 'dockB', berth: { x: 148, z: 20 } };
const config = (overrides: Partial<RouteConfig> = {}): RouteConfig => ({
  a: A, b: B, outbound: { resource: 'wood', amount: 100 }, back: { resource: 'stone', amount: 60 }, ...overrides,
});
const world = (overrides: Partial<GameState> = {}): GameState => ({
  units: [boat()], buildings: [dock('dockA', 30), dock('dockB', 150), outpost], resourceNodes: [], mapSize: 192,
  playerResources: { player1: rich, player2: rich },
  localStocks: { player1: { '1': { wood: 0, food: 0, gold: 0, stone: 200, planks: 0 } } },
  ...overrides,
});
const total = (state: GameState, key: 'wood' | 'stone'): number =>
  state.playerResources.player1[key] + (state.localStocks?.player1?.['1']?.[key] ?? 0) + state.units.reduce((sum, unit) => sum + (unit.cargo?.[key] ?? 0), 0);
const phase = (state: GameState): string | undefined => state.units.find((u) => u.id === 'boat')?.route?.phase;
const teleport = (state: GameState, position: { x: number; z: number }): GameState =>
  ({ ...state, units: state.units.map((u) => (u.id === 'boat' ? { ...u, position, targetPosition: null } : u)) });
const run = (state: GameState, seconds: number): GameState => {
  let current = state;
  for (let i = 0; i < Math.round(seconds / 0.05); i += 1) current = stepRoute(current, 'boat', 0.05, localityOf);
  return current;
};

describe('ciclo completo A→B→A', () => {
  it('carrega A, viaja a B, descarrega, carrega B, volta e descarrega, conservando o total', () => {
    let state = assignRoute(world(), 'boat', config()).state;
    expect(phase(state)).toBe('load_a');
    const wood = total(state, 'wood');
    const stone = total(state, 'stone');
    state = run(state, 1.2);
    expect(phase(state)).toBe('travel_b');
    expect(state.units[0].cargo!.wood).toBe(100);
    expect(state.playerResources.player1.wood).toBe(900);
    expect(total(state, 'wood')).toBe(wood);
    state = teleport(state, B.berth);
    state = run(state, 0.1);
    expect(phase(state)).toBe('unload_b');
    state = run(state, 1.2);
    expect(phase(state)).toBe('load_b');
    expect(state.localStocks!.player1['1'].wood).toBe(100); // entregue uma vez
    expect(state.units[0].cargo).toBeUndefined();
    state = run(state, 1.2);
    expect(phase(state)).toBe('travel_a');
    expect(state.units[0].cargo!.stone).toBe(60);
    state = teleport(state, A.berth);
    state = run(state, 0.1);
    state = run(state, 1.2);
    expect(phase(state)).toBe('load_a');
    expect(state.playerResources.player1.stone).toBe(1060);
    expect(total(state, 'wood')).toBe(wood);
    expect(total(state, 'stone')).toBe(stone);
  });

  it('retorno vazio: sem perna de volta o barco volta sem carga', () => {
    let state = assignRoute(world(), 'boat', config({ back: null })).state;
    state = teleport(run(state, 1.2), B.berth);
    state = run(run(state, 0.1), 1.2);
    expect(phase(state)).toBe('load_b');
    state = run(state, 1.2);
    expect(phase(state)).toBe('travel_a');
    expect(state.units[0].cargo).toBeUndefined();
  });

  it('a entrega só acontece depois da chegada válida: longe do porto B nada é descarregado', () => {
    let state = assignRoute(world(), 'boat', config()).state;
    state = run(state, 1.2);
    state = run(state, 5); // continua em viagem, ainda em A
    expect(phase(state)).toBe('travel_b');
    expect(state.localStocks!.player1['1'].wood).toBe(0);
    expect(state.units[0].cargo!.wood).toBe(100);
  });
});

describe('validação e capacidade', () => {
  it('passageiros, capacidade e portos inválidos impedem a rota, com motivos', () => {
    expect(routeProblems(world({ units: [boat({ passengers: [boat({ id: 'p', type: 'villager' as never })] })] }), 'boat', config()).join(' ')).toMatch(/passageiros/);
    expect(routeProblems(world(), 'boat', config({ outbound: { resource: 'wood', amount: 101 } })).join(' ')).toMatch(/capacidade/);
    expect(routeProblems(world(), 'boat', config({ outbound: { resource: 'wood', amount: 125 } }), true)).toEqual([]);
    expect(routeProblems(world(), 'boat', config({ b: A })).join(' ')).toMatch(/diferentes/);
    expect(routeProblems(world({ buildings: [dock('dockA', 30), dock('dockB', 150, { isComplete: false })] }), 'boat', config()).join(' ')).toMatch(/cais próprios/);
    expect(routeProblems(world({ units: [boat({ type: 'fishing_boat' })] }), 'boat', config()).join(' ')).toMatch(/mercante/);
  });

  it('sem estoque o barco espera; com carregamento parcial explícito leva o que há', () => {
    const poor = world({ playerResources: { player1: { ...rich, wood: 30 }, player2: rich } });
    const waiting = run(assignRoute(poor, 'boat', config()).state, 1.5);
    expect(phase(waiting)).toBe('load_a');
    expect(waiting.units[0].route!.status).toBe('waiting');
    expect(waiting.units[0].cargo).toBeUndefined();
    expect(waiting.playerResources.player1.wood).toBe(30);
    const partial = run(assignRoute(poor, 'boat', config({ partial: true })).state, 1.5);
    expect(phase(partial)).toBe('travel_b');
    expect(partial.units[0].cargo!.wood).toBe(30);
    expect(partial.playerResources.player1.wood).toBe(0);
  });

  it('o mercante não rende ouro passivo', () => {
    const state = world();
    const context: SimulationContext = {
      playerSlot: 'player1', mode: 'host', activeSlots: ['player1'], gatherRadiusLimit: 14, sustainableForestryEnabled: false,
      buildingDefinitions: {}, random: () => 0.9, createId: () => 'id',
    };
    let current = state;
    for (let i = 0; i < 200; i += 1) current = tickGameState(current, context).state;
    expect(current.playerResources.player1.gold).toBe(1000);
  });
});

describe('cancelar, perder porto e redirecionar', () => {
  it('cancelar preserva o porão onde o barco está', () => {
    const traveling = run(assignRoute(world(), 'boat', config()).state, 1.2);
    const cancelled = cancelRoute(traveling, 'boat');
    expect(cancelled.units[0].route).toBeUndefined();
    expect(cancelled.units[0].cargo!.wood).toBe(100);
    expect(cancelled.units[0].targetPosition).toBeNull();
    expect(total(cancelled, 'wood')).toBe(total(traveling, 'wood'));
    expect(cancelRoute(cancelled, 'boat')).toBe(cancelled);
  });

  it('porto de destino perdido bloqueia, mantém a carga e admite redirecionar para outro cais', () => {
    let state = run(assignRoute(world(), 'boat', config()).state, 1.2);
    const woodBefore = total(state, 'wood');
    state = { ...state, buildings: state.buildings.map((b) => (b.id === 'dockB' ? { ...b, health: 0 } : b)) };
    state = run(state, 0.1);
    expect(state.units[0].route).toMatchObject({ status: 'blocked' });
    expect(state.units[0].route!.reason).toMatch(/perdido/);
    expect(total(state, 'wood')).toBe(woodBefore);
    const newDock = dock('dockC', 160);
    const withDock = { ...state, buildings: [...state.buildings, newDock] };
    const redirected = redirectRoute(withDock, 'boat', 'b', { buildingId: 'dockC', berth: { x: 158, z: 20 } });
    expect(redirected.problems).toEqual([]);
    expect(redirected.state.units[0].route).toMatchObject({ status: 'running' });
    expect(redirected.state.units[0].route!.b.buildingId).toBe('dockC');
    expect(redirected.state.units[0].cargo!.wood).toBe(100); // porão intacto
    expect(redirectRoute(withDock, 'boat', 'b', { buildingId: 'dockA', berth: A.berth }).problems).not.toEqual([]);
  });

  it('rota impossível bloqueia quando o movimento parou e o destino não é alcançável', () => {
    let state = run(assignRoute(world(), 'boat', config()).state, 1.2);
    state = { ...state, units: state.units.map((u) => ({ ...u, targetPosition: null })) };
    const blocked = stepRoute(state, 'boat', 0.05, localityOf, () => false);
    expect(blocked.units[0].route).toMatchObject({ status: 'blocked' });
    expect(blocked.units[0].route!.reason).toMatch(/impossível/);
    expect(blocked.units[0].cargo!.wood).toBe(100);
  });

  it('descarregar numa ilha sem posto concluído bloqueia e preserva a carga (sem entrega duplicada nem perdida)', () => {
    let state = world({ buildings: [dock('dockA', 30), dock('dockB', 150)] });
    state = run(assignRoute(state, 'boat', config()).state, 1.2);
    state = run(teleport(state, B.berth), 1.3);
    expect(state.units[0].route).toMatchObject({ status: 'blocked' });
    expect(state.units[0].cargo!.wood).toBe(100);
    expect(state.localStocks!.player1['1'].wood).toBe(0);
  });
});

describe('autorização no host', () => {
  const command = { type: 'set_route', boatId: 'boat', a: A, b: B, outbound: { resource: 'wood', amount: 100 }, back: null };
  it('aceita o dono com portos válidos e recusa terceiros, capacidade excedida e cancelamento sem rota', () => {
    const state = world();
    expect(isAuthorizedPlayerCommand(state, command, 'player1')).toBe(true);
    expect(isAuthorizedPlayerCommand(state, command, 'player2')).toBe(false);
    expect(isAuthorizedPlayerCommand(state, { ...command, outbound: { resource: 'wood', amount: 500 } }, 'player1')).toBe(false);
    expect(isAuthorizedPlayerCommand(state, { type: 'cancel_route', boatId: 'boat' }, 'player1')).toBe(false);
    const started = assignRoute(state, 'boat', config()).state;
    expect(isAuthorizedPlayerCommand(started, { type: 'cancel_route', boatId: 'boat' }, 'player1')).toBe(true);
    expect(isAuthorizedPlayerCommand(state, { ...command, outbound: { resource: 'ouro', amount: 5 } }, 'player1')).toBe(false);
  });
});

describe('estoque do porto lido do estoque local', () => {
  it('a perna que parte da colônia debita o estoque da ilha, não a metrópole', () => {
    const state = world({ units: [boat({ position: B.berth })] });
    const started = assignRoute(state, 'boat', config({ a: B, b: A, outbound: { resource: 'stone', amount: 80 }, back: null })).state;
    const loaded = run(started, 1.2);
    expect(stockAt(loaded, 'player1', '1').stone).toBe(120);
    expect(loaded.playerResources.player1.stone).toBe(1000);
    expect(loaded.units[0].cargo!.stone).toBe(80);
  });
});
