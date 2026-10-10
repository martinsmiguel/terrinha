import { describe, expect, it } from 'vitest';
import { HOME, type LocalityResolver } from '../../src/game/depots';
import type { Building, GameState, Unit } from '../../src/game/model';
import { isAuthorizedPlayerCommand } from '../../src/game/networkCommands';
import {
  assignRoute, cancelRoute, findBerth, pauseRoute, redirectRoute, resumeRoute, routeAlerts, routeView, stepRoute, type RouteConfig, type TradeRoute,
} from '../../src/game/tradeRoutes';

const localityOf: LocalityResolver = (_owner, position) => (position.x < 100 ? HOME : '1');
const rich = { wood: 1000, food: 1000, gold: 1000, stone: 1000, planks: 1000, pop: 5, maxPop: 30 };
const dock = (id: string, x: number, owner = 'player1'): Building => ({
  id, type: 'dock', owner, position: { x, z: 20 }, health: 700, maxHealth: 700, isComplete: true, trainingQueue: [],
});
const post: Building = { id: 'post', type: 'outpost', owner: 'player1', position: { x: 150, z: 30 }, health: 900, maxHealth: 900, isComplete: true, trainingQueue: [] };
const boat = (overrides: Partial<Unit> = {}): Unit => ({
  id: 'boat', type: 'trade_boat', owner: 'player1', position: { x: 28, z: 20 }, targetPosition: null, targetEntityId: null,
  health: 220, maxHealth: 220, attackDamage: 0, state: 'idle', ...overrides,
});
const A = { buildingId: 'dockA', berth: { x: 28, z: 20 } };
const B = { buildingId: 'dockB', berth: { x: 148, z: 20 } };
const C = { buildingId: 'dockC', berth: { x: 158, z: 20 } };
const config: RouteConfig = { a: A, b: B, outbound: { resource: 'wood', amount: 100 }, back: { resource: 'stone', amount: 60 } };
const world = (overrides: Partial<GameState> = {}): GameState => ({
  units: [boat()], buildings: [dock('dockA', 30), dock('dockB', 150), dock('dockC', 160), post], resourceNodes: [], mapSize: 192,
  playerResources: { player1: rich, player2: rich },
  localStocks: { player1: { '1': { wood: 0, food: 0, gold: 0, stone: 200, planks: 0 } } },
  ...overrides,
});
const run = (state: GameState, seconds: number): GameState => {
  let current = state;
  for (let i = 0; i < Math.round(seconds / 0.05); i += 1) current = stepRoute(current, 'boat', 0.05, localityOf);
  return current;
};
const teleport = (state: GameState, position: { x: number; z: number }): GameState =>
  ({ ...state, units: state.units.map((u) => (u.id === 'boat' ? { ...u, position, targetPosition: null } : u)) });
const route = (state: GameState): TradeRoute | undefined => state.units.find((u) => u.id === 'boat')?.route;
const cargoWood = (state: GameState): number => state.units.find((u) => u.id === 'boat')?.cargo?.wood ?? 0;

describe('oito estados legíveis', () => {
  const base: TradeRoute = { ...config, partial: false, phase: 'load_a', timer: 1, status: 'running' };
  it('mapeia fase e status para carregando, viajando, descarregando, retornando, esperando, bloqueada, pausada e perdida', () => {
    expect(routeView({ ...base, phase: 'load_a' }).label).toBe('Carregando');
    expect(routeView({ ...base, phase: 'load_b' }).label).toBe('Carregando');
    expect(routeView({ ...base, phase: 'travel_b' }).label).toBe('Viajando');
    expect(routeView({ ...base, phase: 'unload_b' }).label).toBe('Descarregando');
    expect(routeView({ ...base, phase: 'travel_a' }).label).toBe('Retornando');
    expect(routeView({ ...base, status: 'waiting', reason: 'Esperando estoque: faltam 20 de wood.' })).toMatchObject({ label: 'Esperando', reason: expect.stringContaining('faltam 20') });
    expect(routeView({ ...base, status: 'blocked', cause: 'unreachable', reason: 'Rota impossível.' })).toMatchObject({ label: 'Bloqueada', reason: 'Rota impossível.' });
    expect(routeView({ ...base, status: 'blocked', cause: 'lost', reason: 'Porto perdido.' })).toMatchObject({ label: 'Perdida', tone: 'alert' });
    expect(routeView({ ...base, paused: true }).label).toBe('Pausada');
  });

  it('o motor produz Esperando, Perdida e Pausada com motivo conhecido', () => {
    const poor = world({ playerResources: { player1: { ...rich, wood: 10 }, player2: rich } });
    expect(routeView(route(run(assignRoute(poor, 'boat', config).state, 1.5))!)).toMatchObject({ label: 'Esperando' });
    let state = run(assignRoute(world(), 'boat', config).state, 1.2);
    state = { ...state, buildings: state.buildings.map((b) => (b.id === 'dockB' ? { ...b, health: 0 } : b)) };
    state = run(state, 0.1);
    expect(routeView(route(state)!)).toMatchObject({ label: 'Perdida', reason: expect.stringMatching(/perdido/i) });
    const paused = pauseRoute(assignRoute(world(), 'boat', config).state, 'boat');
    expect(routeView(route(paused)!)).toMatchObject({ label: 'Pausada' });
  });
});

describe('pausar, cancelar e redirecionar não mexem na carga em trânsito', () => {
  const traveling = () => run(assignRoute(world(), 'boat', config).state, 1.2);

  it('pausar para o barco com o porão intacto e retomar continua da mesma fase', () => {
    const state = traveling();
    const paused = pauseRoute(state, 'boat');
    expect(paused.units[0].targetPosition).toBeNull();
    expect(cargoWood(paused)).toBe(100);
    const frozen = run(teleport(paused, B.berth), 5);
    expect(route(frozen)!.phase).toBe('travel_b'); // pausada: nem chegada nem entrega
    expect(frozen.localStocks!.player1['1'].wood).toBe(0);
    expect(pauseRoute(paused, 'boat')).toBe(paused);
    const resumed = resumeRoute(paused, 'boat');
    expect(route(resumed)!.paused).toBe(false);
    expect(resumeRoute(resumed, 'boat')).toBe(resumed);
    expect(cargoWood(resumed)).toBe(100);
  });

  it('redirecionar mantém o porão e a entrega acontece uma única vez no novo porto', () => {
    let state = traveling();
    state = { ...state, buildings: state.buildings.map((b) => (b.id === 'dockB' ? { ...b, health: 0 } : b)) };
    state = run(state, 0.1);
    const redirected = redirectRoute(state, 'boat', 'b', C).state;
    expect(cargoWood(redirected)).toBe(100);
    let arrived = run(teleport(redirected, C.berth), 0.2);
    arrived = run(arrived, 1.3);
    expect(arrived.localStocks!.player1['1'].wood).toBe(100); // uma entrega
    expect(cargoWood(arrived)).toBe(0);
    expect(arrived.playerResources.player1.wood).toBe(900); // nada devolvido à origem
    const again = run(arrived, 0.2);
    expect(again.localStocks!.player1['1'].wood).toBe(100);
  });

  it('cancelar não devolve a carga em trânsito à origem nem a entrega', () => {
    const state = traveling();
    const cancelled = cancelRoute(state, 'boat');
    expect(cargoWood(cancelled)).toBe(100);
    expect(cancelled.playerResources.player1.wood).toBe(900);
    expect(cancelled.localStocks!.player1['1'].wood).toBe(0);
  });

  it('redirecionar com a rota pausada mantém o barco parado', () => {
    const paused = pauseRoute(traveling(), 'boat');
    const redirected = redirectRoute(paused, 'boat', 'b', C).state;
    expect(redirected.units[0].targetPosition).toBeNull();
    expect(route(redirected)!.paused).toBe(true);
  });
});

describe('alertas', () => {
  it('só listam rotas do próprio jogador, com o foco no próprio barco; inimigos e rotas normais ficam de fora', () => {
    const blocked: TradeRoute = { ...config, partial: false, phase: 'travel_b', timer: 0, status: 'blocked', cause: 'lost', reason: 'Porto perdido.' };
    const units: Unit[] = [
      boat({ route: blocked, position: { x: 77, z: 33 } }),
      boat({ id: 'ok', route: { ...blocked, status: 'running', cause: undefined, reason: undefined } }),
      boat({ id: 'foe', owner: 'player2', route: blocked, position: { x: 5, z: 5 } }),
      boat({ id: 'dead', health: 0, route: blocked }),
    ];
    const alerts = routeAlerts(units, 'player1');
    expect(alerts).toEqual([{ boatId: 'boat', view: expect.objectContaining({ label: 'Perdida' }), focus: { x: 77, z: 33 } }]);
  });
});

describe('comandos reais autorizados', () => {
  const command = { type: 'set_route', boatId: 'boat', a: A, b: B, outbound: { resource: 'wood', amount: 100 }, back: { resource: 'stone', amount: 60 } };
  it('configura as duas pernas e o host autoriza; pausa e retomada só no estado certo', () => {
    const state = world();
    expect(isAuthorizedPlayerCommand(state, command, 'player1')).toBe(true);
    expect(isAuthorizedPlayerCommand(state, { ...command, back: { resource: 'stone', amount: 500 } }, 'player1')).toBe(false);
    const started = assignRoute(state, 'boat', config).state;
    expect(isAuthorizedPlayerCommand(started, { type: 'pause_route', boatId: 'boat' }, 'player1')).toBe(true);
    expect(isAuthorizedPlayerCommand(started, { type: 'resume_route', boatId: 'boat' }, 'player1')).toBe(false);
    const paused = pauseRoute(started, 'boat');
    expect(isAuthorizedPlayerCommand(paused, { type: 'resume_route', boatId: 'boat' }, 'player1')).toBe(true);
    expect(isAuthorizedPlayerCommand(paused, { type: 'pause_route', boatId: 'boat' }, 'player1')).toBe(false);
    expect(isAuthorizedPlayerCommand(started, { type: 'pause_route', boatId: 'boat' }, 'player2')).toBe(false);
  });
});

describe('ponto de atracação', () => {
  it('escolhe a célula navegável mais próxima do cais, de forma determinística, ou nada', () => {
    const isNavigable = (x: number) => x >= 33;
    const berth = findBerth({ x: 30, z: 20 }, isNavigable)!;
    expect(berth.x).toBeGreaterThanOrEqual(33);
    expect(findBerth({ x: 30, z: 20 }, isNavigable)).toEqual(berth);
    expect(findBerth({ x: 30, z: 20 }, () => false)).toBeNull();
  });
});
