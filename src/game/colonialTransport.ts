import { HOME, creditAt, debitAt, depotsIn, stockAt, type LocalityResolver } from './depots';
import { findLandingCells, type NavalMap } from './navalTransport';
import type { GameState, Unit, UnitType } from './model';
import { BOAT_CAPACITY, worldSizeOf } from './model';
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

/** Nome legível de uma localidade para a interface. */
export const localityLabel = (locality: string): string => (locality === HOME ? 'Metrópole' : `Colônia (ilha ${locality})`);

export interface Hold {
  kind: 'colonial' | 'merchant' | 'other';
  passengers: number;
  passengerCapacity: number;
  cargo: number;
  kitOnBoard: boolean;
  /** Ocupação do porão (carga mais o kit) e sua capacidade. */
  used: number;
  capacity: number;
}

/** Estado real do porão para a interface: passageiros, carga, kit e capacidade (200 colonial, 100/125 mercante). */
export function holdOf(boat: Unit, talent = false): Hold {
  const kit = boat.kit ? cargoTotal(COLONIAL_TRANSPORT.kit) : 0;
  return {
    kind: boat.type === 'colonial_transport' ? 'colonial' : boat.type === 'trade_boat' ? 'merchant' : 'other',
    passengers: boat.passengers?.length ?? 0,
    passengerCapacity: BOAT_CAPACITY[boat.type],
    cargo: cargoTotal(boat.cargo),
    kitOnBoard: Boolean(boat.kit),
    used: cargoTotal(boat.cargo) + kit,
    capacity: cargoCapacity(boat.type, talent),
  };
}

export interface LoadPreview {
  ok: boolean;
  /** Motivos de recusa, em português, para a interface. Vazio quando ok. */
  reasons: string[];
  /** Localidade (estoque) que pagaria o carregamento. */
  origin: string;
}

const NAMES: Record<(typeof KEYS)[number], string> = { wood: 'madeira', food: 'comida', gold: 'ouro', stone: 'pedra', planks: 'tábuas' };

function previewPayload(
  state: GameState, boatId: string, locality: string, payload: Partial<Cargo>, resolve: LocalityResolver, talent: boolean, requireKitBoat: boolean
): LoadPreview {
  const reasons: string[] = [];
  const boat = boatOf(state, boatId);
  if (!boat) return { ok: false, reasons: ['Barco indisponível.'], origin: locality };
  if (requireKitBoat && (boat.type !== 'colonial_transport' || boat.kit)) {
    reasons.push(boat.kit ? 'O kit já está a bordo.' : 'Só o transporte colonial leva o kit.');
  }
  if (!hasAnchorNear(state, boat, locality, resolve)) reasons.push('O barco está longe de um posto ou cais próprio para carregar.');
  const amount = cargoTotal(payload);
  if (amount <= 0 || KEYS.some((key) => (payload[key] ?? 0) < 0)) reasons.push('Quantidade inválida.');
  const hold = holdOf(boat, talent);
  if (hold.capacity === 0) reasons.push('Este barco não tem porão.');
  else if (hold.used + amount > hold.capacity) reasons.push(`Porão cheio: ${hold.used + amount} acima da capacidade de ${hold.capacity}.`);
  const stock = stockAt(state, boat.owner, locality);
  for (const key of KEYS) {
    const missing = (payload[key] ?? 0) - stock[key];
    if (missing > 0) reasons.push(`Falta ${Math.ceil(missing)} de ${NAMES[key]} no estoque de ${localityLabel(locality)}.`);
  }
  return { ok: reasons.length === 0, reasons, origin: locality };
}

/** Pré-visualização do carregamento: não altera nada; a confirmação do host revalida com os mesmos critérios. */
export function previewLoad(state: GameState, boatId: string, locality: string, cargo: Partial<Cargo>, resolve: LocalityResolver, talent = false): LoadPreview {
  return previewPayload(state, boatId, locality, cargo, resolve, talent, false);
}

export function previewKit(state: GameState, boatId: string, locality: string, resolve: LocalityResolver): LoadPreview {
  return previewPayload(state, boatId, locality, COLONIAL_TRANSPORT.kit, resolve, false, true);
}

/** Carrega recursos no porão, debitando o estoque do posto uma vez; recusa por qualquer motivo da prévia, sem efeito parcial. */
export function loadCargo(
  state: GameState, boatId: string, locality: string, cargo: Partial<Cargo>, resolve: LocalityResolver, talent = false
): GameState | null {
  if (!previewLoad(state, boatId, locality, cargo, resolve, talent).ok) return null;
  const boat = boatOf(state, boatId)!;
  const debited = debitAt(state, boat.owner, locality, cargo);
  if (!debited) return null;
  const next = emptyCargo();
  KEYS.forEach((key) => { next[key] = (boat.cargo?.[key] ?? 0) + (cargo[key] ?? 0); });
  return replaceUnit(debited, { ...boat, cargo: next });
}

/** Embarca o kit de colonização (uma vez por transporte colonial), debitando o posto uma só vez. */
export function loadKit(state: GameState, boatId: string, locality: string, resolve: LocalityResolver): GameState | null {
  if (!previewKit(state, boatId, locality, resolve).ok) return null;
  const boat = boatOf(state, boatId)!;
  const debited = debitAt(state, boat.owner, locality, COLONIAL_TRANSPORT.kit);
  return debited ? replaceUnit(debited, { ...boat, kit: true }) : null;
}

export interface DisembarkPreview { ok: boolean; reason?: string; passengers: number; cargo: boolean; destination: string }

/** Prévia do desembarque: explica praia bloqueada ou falta de passageiros, sem alterar o estado. */
export function previewDisembark(state: GameState, boatId: string, map: NavalMap, locality: string): DisembarkPreview {
  const boat = boatOf(state, boatId);
  const passengers = boat?.passengers?.length ?? 0;
  const cargo = Boolean(boat && (cargoTotal(boat.cargo) > 0 || boat.kit));
  const base = { passengers, cargo, destination: localityLabel(locality) };
  if (!boat) return { ...base, ok: false, reason: 'Barco indisponível.' };
  if (passengers === 0 && !cargo) return { ...base, ok: false, reason: 'Não há passageiros nem carga a bordo.' };
  if (passengers > 0 && findLandingCells(map, state.buildings, state.units, boat.position, 1, worldSizeOf(state)).length === 0) {
    return { ...base, ok: false, reason: 'Praia bloqueada: não há terreno livre perto do barco; passageiros e carga ficam a bordo.' };
  }
  return { ...base, ok: true };
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
