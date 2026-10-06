
import { BOAT_CAPACITY, isBoatUnit, MAP_SIZE, type Building, type GameState, type Unit, type UnitType } from './model';
import { BUILDING_CATALOG } from './buildingCatalog';

export const EMBARK_RANGE = 6;

export const DISEMBARK_RADIUS_CELLS = 6;

export interface NavalMap {
  isWaterAt(x: number, z: number): boolean;
  isImpassableAt(x: number, z: number): boolean;
}

export function boatCapacity(type: UnitType): number {
  return BOAT_CAPACITY[type];
}

function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function toPassenger(unit: Unit): Unit {
  return {
    ...unit,
    targetPosition: null,
    targetEntityId: null,
    state: 'idle',
    embarkTargetId: undefined,
  };
}

export interface EmbarkResult {
  state: GameState;
    boarded: string[];
    pending: string[];
}

export function applyEmbarkOrder(
  state: GameState,
  unitIds: string[],
  boatId: string,
  range: number = EMBARK_RANGE
): EmbarkResult {
  const boat = state.units.find((unit) => unit.id === boatId);
  if (!boat || boat.health <= 0 || !isBoatUnit(boat.type)) return { state, boarded: [], pending: [] };
  if (boatCapacity(boat.type) === 0) return { state, boarded: [], pending: [] };

  const passengers = [...(boat.passengers ?? [])];
  const boarded: string[] = [];
  const pending: string[] = [];
  const boardedSet = new Set<string>();

  for (const unitId of new Set(unitIds)) {
    const unit = state.units.find((candidate) => candidate.id === unitId);
    if (!unit || unit.health <= 0 || unit.owner !== boat.owner || isBoatUnit(unit.type) || unit.id === boatId || passengers.some((p) => p.id === unit.id)) continue;
    if (passengers.length >= boatCapacity(boat.type)) break;
    if (distance(unit.position, boat.position) <= range) {
      passengers.push(toPassenger(unit));
      boardedSet.add(unit.id);
      boarded.push(unit.id);
    }
  }

  const pendingSet = new Set<string>();
  for (const unitId of new Set(unitIds)) {
    if (boardedSet.has(unitId)) continue;
    const unit = state.units.find((candidate) => candidate.id === unitId);
    if (!unit || unit.health <= 0 || unit.owner !== boat.owner || isBoatUnit(unit.type) || unit.id === boatId || passengers.some((p) => p.id === unit.id)) continue;
    pendingSet.add(unit.id);
    pending.push(unit.id);
  }

  const units = state.units
    .filter((unit) => !boardedSet.has(unit.id))
    .map((unit) => {
      if (unit.id === boatId) {
        return { ...unit, passengers };
      }
      if (pendingSet.has(unit.id)) {
        return {
          ...unit,
          embarkTargetId: boatId,
          targetPosition: { x: boat.position.x, z: boat.position.z },
          targetEntityId: null,
          state: 'moving' as const,
        };
      }
      return unit;
    });

  return { state: { ...state, units }, boarded, pending };
}

export function boardArrivedPassengers(units: Unit[], range: number = EMBARK_RANGE): Unit[] {
  const boats = new Map<string, Unit>();
  units.forEach((unit) => {
    if (isBoatUnit(unit.type)) boats.set(unit.id, unit);
  });
  if (!units.some((unit) => unit.embarkTargetId)) return units;

  const boardByBoat = new Map<string, Unit[]>();
  const boarded = new Set<string>();

  for (const unit of units) {
    if (!unit.embarkTargetId || isBoatUnit(unit.type)) continue;
    const boat = boats.get(unit.embarkTargetId);
    if (!boat || boat.health <= 0 || unit.health <= 0 || unit.owner !== boat.owner) continue;
    if (!boardByBoat.has(boat.id)) boardByBoat.set(boat.id, [...(boat.passengers ?? [])]);
    const list = boardByBoat.get(boat.id) as Unit[];
    if (list.length >= boatCapacity(boat.type) || list.some((p) => p.id === unit.id)) continue;
    if (distance(unit.position, boat.position) <= range) {
      list.push(toPassenger(unit));
      boarded.add(unit.id);
    }
  }

  const clearsOrphans = units.some((unit) => unit.embarkTargetId && !boats.has(unit.embarkTargetId));
  if (boarded.size === 0 && !clearsOrphans) return units;

  return units
    .filter((unit) => !boarded.has(unit.id))
    .map((unit) => {
      if (isBoatUnit(unit.type)) {
        const passengers = boardByBoat.get(unit.id);
        return passengers ? { ...unit, passengers } : unit;
      }
      if (unit.embarkTargetId && !boats.has(unit.embarkTargetId)) {
        return { ...unit, embarkTargetId: undefined };
      }
      return unit;
    });
}

function overlapsBuilding(x: number, z: number, buildings: Building[]): boolean {
  return buildings.some((building) => {
    const def = (BUILDING_CATALOG as Partial<Record<string, { footprintWidth: number; footprintDepth: number }>>)[
      building.type
    ];
    const halfW = (def?.footprintWidth ?? 6) / 2 + 0.4;
    const halfD = (def?.footprintDepth ?? 6) / 2 + 0.4;
    return Math.abs(x - building.position.x) < halfW && Math.abs(z - building.position.z) < halfD;
  });
}

export function findLandingCells(
  map: NavalMap,
  buildings: Building[],
  units: Unit[],
  origin: { x: number; z: number },
  need: number
): { x: number; z: number }[] {
  if (need <= 0) return [];
  const originCellX = Math.floor(origin.x);
  const originCellZ = Math.floor(origin.z);
  const candidates: { x: number; z: number; d: number }[] = [];

  for (let dz = -DISEMBARK_RADIUS_CELLS; dz <= DISEMBARK_RADIUS_CELLS; dz++) {
    for (let dx = -DISEMBARK_RADIUS_CELLS; dx <= DISEMBARK_RADIUS_CELLS; dx++) {
      const x = originCellX + dx + 0.5;
      const z = originCellZ + dz + 0.5;
      if (x < 1 || z < 1 || x > MAP_SIZE - 1 || z > MAP_SIZE - 1) continue;
      if (map.isWaterAt(x, z) || map.isImpassableAt(x, z)) continue;
      if (overlapsBuilding(x, z, buildings)) continue;
      if (units.some((unit) => distance(unit.position, { x, z }) < 0.9)) continue;
      candidates.push({ x, z, d: Math.hypot(x - origin.x, z - origin.z) });
    }
  }

  candidates.sort((a, b) => a.d - b.d || a.x - b.x || a.z - b.z);
  return candidates.slice(0, need).map(({ x, z }) => ({ x, z }));
}

export interface DisembarkResult {
  state: GameState;
    placed: Unit[];
    remaining: number;
}

export function disembarkPassengers(state: GameState, boatId: string, map: NavalMap): DisembarkResult {
  const boat = state.units.find((unit) => unit.id === boatId);
  if (!boat || !isBoatUnit(boat.type) || !boat.passengers || boat.passengers.length === 0) {
    return { state, placed: [], remaining: 0 };
  }

  const cells = findLandingCells(map, state.buildings, state.units, boat.position, boat.passengers.length);
  const capacity = Math.min(cells.length, boat.passengers.length);
  const placed = boat.passengers.slice(0, capacity).map((passenger, index) => ({
    ...toPassenger(passenger),
    position: { x: cells[index].x, z: cells[index].z },
  }));
  const remaining = boat.passengers.slice(capacity);

  const units = state.units.map((unit) =>
    unit.id === boatId ? { ...unit, passengers: remaining } : unit
  );
  const nextState: GameState = { ...state, units: [...units, ...placed] };

  return { state: nextState, placed, remaining: remaining.length };
}
