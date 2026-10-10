import { HOME, creditAt, debitAt, depotsIn, type LocalityResolver } from './depots';
import { findLandingCells, type NavalMap } from './navalTransport';
import type { GameState, Unit, UnitType } from './model';
import { worldSizeOf } from './model';
import { applyPopDelta } from './population';

/** Dados revisados do transporte colonial e do porão. */
export const COLONIAL_TRANSPORT = {
  passengers: 6,
  cargoCapacity: 200,
  kit: { wood: 150, stone: 50 },
  /** Distância máxima do barco ao posto para carregar. */
  loadRange: 8,
  disembarkSeconds: 0.5,
  disembarkSecondsTalent: 0.25,
} as const;

export const MERCHANT_CARGO = { base: 100, talent: 125 } as const;

export type Cargo = NonNullable<Unit['cargo']>;
const KEYS = ['wood', 'food', 'gold', 'stone', 'planks'] as const;
const emptyCargo = (): Cargo => ({ wood: 0, food: 0, gold: 0, stone: 0, planks: 0 });
export const cargoTotal = (cargo: Partial<Cargo> | undefined): number => KEYS.reduce((sum, key) => sum + (cargo?.[key] ?? 0), 0);

/** Capacidade de carga do porão: 200 no transporte colonial, 100 (125 com talento) no mercante. */
export function cargoCapacity(type: UnitType, talent = false): number {
  if (type === 'colonial_transport') return COLONIAL_TRANSPORT.cargoCapacity;
  if (type === 'trade_boat') return talent ? MERCHANT_CARGO.talent : MERCHANT_CARGO.base;
  return 0;
}

const distance = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

const boatOf = (state: GameState, boatId: string): Unit | null => {
  const boat = state.units.find((unit) => unit.id === boatId);
  return boat && boat.health > 0 ? boat : null;
};

const replaceUnit = (state: GameState, boat: Unit): GameState =>
  ({ ...state, units: state.units.map((unit) => (unit.id === boat.id ? boat : unit)) });

/** Posto próprio vivo (qualquer fase) na localidade e ao alcance do barco: ancora o carregamento. */
function hasAnchorNear(state: GameState, boat: Unit, locality: string, resolve: LocalityResolver): boolean {
  if (locality === HOME) {
    return state.buildings.some((b) => b.owner === boat.owner && b.health > 0 && b.isComplete && (b.type === 'dock' || b.type === 'town_center')
      && distance(b.position, boat.position) <= COLONIAL_TRANSPORT.loadRange);
  }
  return depotsIn(state.buildings, boat.owner, locality, resolve, false).some((b) => distance(b.position, boat.position) <= COLONIAL_TRANSPORT.loadRange);
}

/** Carrega recursos no porão, debitando o estoque do posto uma vez; recusa excesso de capacidade ou saldo, sem efeito parcial. */
export function loadCargo(
  state: GameState, boatId: string, locality: string, cargo: Partial<Cargo>, resolve: LocalityResolver, talent = false
): GameState | null {
  const boat = boatOf(state, boatId);
  if (!boat || !hasAnchorNear(state, boat, locality, resolve)) return null;
  const amount = cargoTotal(cargo);
  if (amount <= 0 || KEYS.some((key) => (cargo[key] ?? 0) < 0)) return null;
  if (cargoTotal(boat.cargo) + (boat.kit ? cargoTotal(COLONIAL_TRANSPORT.kit) : 0) + amount > cargoCapacity(boat.type, talent)) return null;
  const debited = debitAt(state, boat.owner, locality, cargo);
  if (!debited) return null;
  const next = emptyCargo();
  KEYS.forEach((key) => { next[key] = (boat.cargo?.[key] ?? 0) + (cargo[key] ?? 0); });
  return replaceUnit(debited, { ...boat, cargo: next });
}

/** Embarca o kit de colonização (uma vez por transporte colonial), debitando o posto uma só vez. */
export function loadKit(state: GameState, boatId: string, locality: string, resolve: LocalityResolver): GameState | null {
  const boat = boatOf(state, boatId);
  if (!boat || boat.type !== 'colonial_transport' || boat.kit || !hasAnchorNear(state, boat, locality, resolve)) return null;
  if (cargoTotal(boat.cargo) + cargoTotal(COLONIAL_TRANSPORT.kit) > COLONIAL_TRANSPORT.cargoCapacity) return null;
  const debited = debitAt(state, boat.owner, locality, COLONIAL_TRANSPORT.kit);
  return debited ? replaceUnit(debited, { ...boat, kit: true }) : null;
}

export interface DisembarkStep { state: GameState; released: Unit | null; blocked: boolean }

/**
 * Passo de desembarque: um passageiro a cada 0,5 s (0,25 s com talento), só onde há terreno de pouso válido.
 * Sem terreno, mantém passageiros e carga e marca `blocked`.
 */
export function disembarkStep(state: GameState, boatId: string, map: NavalMap, dtSeconds: number, talent = false): DisembarkStep {
  const boat = boatOf(state, boatId);
  const passengers = boat?.passengers ?? [];
  if (!boat || passengers.length === 0) return { state, released: null, blocked: false };
  const cooldown = (boat.disembarkCooldown ?? 0) - dtSeconds;
  if (cooldown > 0) return { state: replaceUnit(state, { ...boat, disembarkCooldown: cooldown }), released: null, blocked: false };
  const [cell] = findLandingCells(map, state.buildings, state.units, boat.position, 1, worldSizeOf(state));
  if (!cell) return { state, released: null, blocked: true };
  const [first, ...rest] = passengers;
  const released: Unit = { ...first, position: { x: cell.x, z: cell.z }, targetPosition: null, targetEntityId: null, state: 'idle', embarkTargetId: undefined };
  const interval = talent ? COLONIAL_TRANSPORT.disembarkSecondsTalent : COLONIAL_TRANSPORT.disembarkSeconds;
  const updatedBoat: Unit = { ...boat, passengers: rest, disembarkCooldown: rest.length > 0 ? interval : undefined };
  return { state: { ...replaceUnit(state, updatedBoat), units: [...replaceUnit(state, updatedBoat).units, released] }, released, blocked: false };
}

/**
 * Entrega carga e kit ao estoque da localidade onde o barco está, uma única vez: exige posto próprio vivo ao alcance
 * (em obras vale, como depósito provisório). Sem apoio, a carga fica a bordo.
 */
export function deliverCargo(state: GameState, boatId: string, locality: string, resolve: LocalityResolver): GameState {
  const boat = boatOf(state, boatId);
  if (!boat || (cargoTotal(boat.cargo) === 0 && !boat.kit) || !hasAnchorNear(state, boat, locality, resolve)) return state;
  const payload: Partial<Cargo> = { ...(boat.cargo ?? {}) };
  if (boat.kit) {
    payload.wood = (payload.wood ?? 0) + COLONIAL_TRANSPORT.kit.wood;
    payload.stone = (payload.stone ?? 0) + COLONIAL_TRANSPORT.kit.stone;
  }
  const credited = creditAt(state, boat.owner, locality, payload, true);
  const { cargo: _cargo, kit: _kit, ...rest } = boat;
  return replaceUnit(credited, rest as Unit);
}

/** Afundamento: casco, carga, kit e passageiros somem e a população é baixada uma única vez; repetir não faz nada. */
export function sinkTransport(state: GameState, boatId: string): GameState {
  const boat = state.units.find((unit) => unit.id === boatId);
  if (!boat) return state;
  const lostPop = 1 + (boat.passengers?.length ?? 0);
  return {
    ...state,
    units: state.units.filter((unit) => unit.id !== boatId),
    playerResources: applyPopDelta(state.playerResources, boat.owner, -lostPop),
  };
}
