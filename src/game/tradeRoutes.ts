import { cargoCapacity, cargoTotal, type Cargo } from './colonialTransport';
import { HOME, creditAt, debitAt, depotsIn, stockAt, type LocalityResolver } from './depots';
import type { Building, GameState, Unit } from './model';

export type RouteResource = 'wood' | 'food' | 'gold' | 'stone' | 'planks';
export type RoutePhase = 'load_a' | 'travel_b' | 'unload_b' | 'load_b' | 'travel_a' | 'unload_a';

export const ROUTE_LOAD_SECONDS = 1;
export const ROUTE_UNLOAD_SECONDS = 1;
/** Distância do barco ao ponto de atracação para a chegada valer. */
export const ROUTE_ARRIVAL_RANGE = 2;

export interface RoutePort {
  /** Cais próprio e concluído onde o barco carrega e descarrega. */
  buildingId: string;
  /** Ponto de água atracável junto ao cais; é para onde o barco navega. */
  berth: { x: number; z: number };
}

export interface RouteLeg { resource: RouteResource; amount: number }

export interface TradeRoute {
  a: RoutePort;
  b: RoutePort;
  /** Perna A→B e perna B→A; `null` é retorno vazio. */
  outbound: RouteLeg;
  back: RouteLeg | null;
  /** Carregar parcial é uma escolha explícita; sem ela o barco espera o estoque completo. */
  partial: boolean;
  phase: RoutePhase;
  timer: number;
  status: 'running' | 'waiting' | 'blocked';
  reason?: string;
}

export interface RouteConfig { a: RoutePort; b: RoutePort; outbound: RouteLeg; back: RouteLeg | null; partial?: boolean }

const KEYS: readonly RouteResource[] = ['wood', 'food', 'gold', 'stone', 'planks'];
const dist = (p: { x: number; z: number }, q: { x: number; z: number }): number => Math.hypot(p.x - q.x, p.z - q.z);

const routeOf = (unit: Unit): TradeRoute | undefined => unit.route;
const withRoute = (unit: Unit, route: TradeRoute | undefined): Unit => {
  const { route: _old, ...rest } = unit;
  return route ? { ...rest, route } : rest;
};
const replace = (state: GameState, unit: Unit): GameState => ({ ...state, units: state.units.map((u) => (u.id === unit.id ? unit : u)) });

function validPort(state: GameState, owner: string, port: RoutePort): Building | null {
  const dock = state.buildings.find((b) => b.id === port.buildingId);
  return dock && dock.type === 'dock' && dock.owner === owner && dock.isComplete && dock.health > 0 ? dock : null;
}

const cargoOf = (unit: Unit): Cargo => ({ wood: 0, food: 0, gold: 0, stone: 0, planks: 0, ...unit.cargo });
const legCargo = (leg: RouteLeg, amount: number): Partial<Cargo> => ({ [leg.resource]: amount });

/** Motivos pelos quais o mercante não pode seguir esta rota; vazio quando é válida. Não altera nada. */
export function routeProblems(state: GameState, boatId: string, config: RouteConfig, talent = false): string[] {
  const boat = state.units.find((u) => u.id === boatId);
  const problems: string[] = [];
  if (!boat || boat.health <= 0 || boat.type !== 'trade_boat') return ['Só o barco mercante segue rotas.'];
  if ((boat.passengers?.length ?? 0) > 0) problems.push('Há passageiros a bordo: descarregue-os antes de iniciar a rota.');
  if (config.a.buildingId === config.b.buildingId) problems.push('Os dois portos precisam ser diferentes.');
  if (!validPort(state, boat.owner, config.a) || !validPort(state, boat.owner, config.b)) problems.push('Os dois portos devem ser cais próprios e concluídos.');
  const capacity = cargoCapacity(boat.type, talent);
  for (const leg of [config.outbound, config.back]) {
    if (!leg) continue;
    if (!KEYS.includes(leg.resource) || !Number.isInteger(leg.amount) || leg.amount <= 0) problems.push('Quantidade ou recurso da perna inválido.');
    else if (leg.amount > capacity) problems.push(`A perna de ${leg.amount} passa da capacidade do porão (${capacity}).`);
  }
  if (cargoTotal(boat.cargo) > 0) problems.push('O porão precisa estar vazio para iniciar a rota.');
  return problems;
}

/** Inicia a rota no porto A. Recusa com os motivos, sem alterar o estado. */
export function assignRoute(state: GameState, boatId: string, config: RouteConfig, talent = false): { state: GameState; problems: string[] } {
  const problems = routeProblems(state, boatId, config, talent);
  if (problems.length > 0) return { state, problems };
  const boat = state.units.find((u) => u.id === boatId)!;
  const route: TradeRoute = { ...config, partial: Boolean(config.partial), phase: 'load_a', timer: ROUTE_LOAD_SECONDS, status: 'running' };
  return { state: replace(state, { ...withRoute(boat, route), targetPosition: { ...config.a.berth }, targetEntityId: null, state: 'moving' }), problems: [] };
}

/** Cancelar interrompe a rota e preserva o porão onde o barco está; nada é devolvido nem perdido. */
export function cancelRoute(state: GameState, boatId: string): GameState {
  const boat = state.units.find((u) => u.id === boatId);
  if (!boat || !routeOf(boat)) return state;
  return replace(state, { ...withRoute(boat, undefined), targetPosition: null, state: 'idle' });
}

/** Redireciona um porto que se perdeu (ou qualquer um) para outro cais próprio, mantendo as pernas e o porão. */
export function redirectRoute(state: GameState, boatId: string, end: 'a' | 'b', port: RoutePort): { state: GameState; problems: string[] } {
  const boat = state.units.find((u) => u.id === boatId);
  const route = boat && routeOf(boat);
  if (!boat || !route) return { state, problems: ['O barco não tem rota.'] };
  const next = { ...route, [end]: port } as TradeRoute;
  if (next.a.buildingId === next.b.buildingId || !validPort(state, boat.owner, port)) return { state, problems: ['O novo porto precisa ser um cais próprio, concluído e diferente do outro.'] };
  const target = next.phase === 'travel_b' || next.phase === 'load_b' ? next.b.berth : next.a.berth;
  return { state: replace(state, { ...withRoute(boat, { ...next, status: 'running', reason: undefined }), targetPosition: { ...target }, state: 'moving' }), problems: [] };
}

const portStock = (state: GameState, owner: string, port: RoutePort, resolve: LocalityResolver): { locality: string; building: Building } | null => {
  const building = validPort(state, owner, port);
  return building ? { locality: resolve(owner, building.position), building } : null;
};

/**
 * Um passo de rota (dt em segundos). Máquina: carregar A → viajar B → descarregar B → carregar B → viajar A →
 * descarregar A. Estoque e porão só trocam de mãos uma vez por transição, e a entrega exige chegada válida.
 */
export function stepRoute(
  state: GameState, boatId: string, dt: number, resolve: LocalityResolver, canReach: (from: { x: number; z: number }, to: { x: number; z: number }) => boolean = () => true
): GameState {
  const boat = state.units.find((u) => u.id === boatId);
  const route = boat && routeOf(boat);
  if (!boat || !route || boat.health <= 0) return state;
  const block = (reason: string): GameState => replace(state, { ...withRoute(boat, { ...route, status: 'blocked', reason }), targetPosition: null, state: 'idle' });

  if ((boat.passengers?.length ?? 0) > 0) return block('Há passageiros a bordo.');
  const atA = route.phase === 'load_a' || route.phase === 'unload_a';
  const loading = route.phase === 'load_a' || route.phase === 'load_b';
  const unloading = route.phase === 'unload_a' || route.phase === 'unload_b';
  const traveling = route.phase === 'travel_a' || route.phase === 'travel_b';
  const port = atA ? route.a : route.b;
  const dest = route.phase === 'travel_b' ? route.b : route.a;

  if (traveling) {
    const found = portStock(state, boat.owner, dest, resolve);
    if (!found) return block('Porto de destino perdido: redirecione a rota.');
    // A alcançabilidade só é consultada quando o movimento parou (sem alvo): evita busca de caminho a cada tick.
    if (!boat.targetPosition && dist(boat.position, dest.berth) > ROUTE_ARRIVAL_RANGE && !canReach(boat.position, dest.berth)) return block('Rota impossível até o porto de destino.');
    if (dist(boat.position, dest.berth) > ROUTE_ARRIVAL_RANGE) {
      const moving: Unit = boat.targetPosition ? boat : { ...boat, targetPosition: { ...dest.berth }, state: 'moving' };
      return replace(state, withRoute(moving, { ...route, status: 'running', reason: undefined }));
    }
    const arrived = route.phase === 'travel_b' ? 'unload_b' : 'unload_a';
    return replace(state, { ...withRoute(boat, { ...route, phase: arrived, timer: ROUTE_UNLOAD_SECONDS, status: 'running', reason: undefined }), targetPosition: null, state: 'idle' });
  }

  const found = portStock(state, boat.owner, port, resolve);
  if (!found) return block('Porto perdido: redirecione a rota ou cancele (o porão fica a bordo).');
  if (dist(boat.position, port.berth) > ROUTE_ARRIVAL_RANGE) {
    return replace(state, { ...withRoute(boat, { ...route, status: 'running' }), targetPosition: { ...port.berth }, state: 'moving' });
  }
  const remaining = route.timer - dt;
  if (remaining > 0) return replace(state, withRoute(boat, { ...route, timer: remaining, status: 'running', reason: undefined }));

  const next = (phase: RoutePhase, extra: Partial<TradeRoute> = {}): TradeRoute => ({ ...route, phase, timer: ROUTE_LOAD_SECONDS, status: 'running', reason: undefined, ...extra });
  const travelTo = (r: TradeRoute, b: RoutePort): GameState => replace(state, { ...withRoute(boat, r), targetPosition: { ...b.berth }, state: 'moving' });

  if (loading) {
    const leg = route.phase === 'load_a' ? route.outbound : route.back;
    if (!leg) return travelTo(next('travel_a'), route.a); // retorno vazio
    const onBoard = cargoTotal(boat.cargo);
    const stock = stockAt(state, boat.owner, found.locality)[leg.resource];
    const take = Math.min(leg.amount, stock, cargoCapacity(boat.type) - onBoard);
    if (take < leg.amount && !route.partial) {
      // Espera o estoque completo; nada é debitado.
      return replace(state, withRoute(boat, { ...route, timer: 0, status: 'waiting', reason: `Esperando estoque: faltam ${leg.amount - take} de ${leg.resource}.` }));
    }
    if (take <= 0) return replace(state, withRoute(boat, { ...route, timer: 0, status: 'waiting', reason: 'Esperando estoque.' }));
    const debited = debitAt(state, boat.owner, found.locality, legCargo(leg, take));
    if (!debited) return state;
    const cargo = cargoOf(boat);
    cargo[leg.resource] += take;
    const loaded: Unit = { ...boat, cargo };
    const nextPhase = route.phase === 'load_a' ? 'travel_b' : 'travel_a';
    const dst = route.phase === 'load_a' ? route.b : route.a;
    return replace(debited, { ...withRoute(loaded, next(nextPhase)), targetPosition: { ...dst.berth }, state: 'moving' });
  }

  if (unloading) {
    const hasDepot = found.locality === HOME || depotsIn(state.buildings, boat.owner, found.locality, resolve, true).length > 0;
    if (!hasDepot) return block('A ilha do porto não tem posto concluído para receber a carga.');
    const load = boat.cargo ?? { wood: 0, food: 0, gold: 0, stone: 0, planks: 0 };
    const credited = creditAt(state, boat.owner, found.locality, load, true);
    const emptied: Unit = { ...boat, cargo: undefined };
    if (route.phase === 'unload_b') return replace(credited, withRoute(emptied, next('load_b')));
    return replace(credited, withRoute(emptied, next('load_a')));
  }
  return state;
}
