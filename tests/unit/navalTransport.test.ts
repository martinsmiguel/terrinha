import { describe, expect, it } from 'vitest';
import { generateProceduralTerrain, findNearestOceanCell, type ProceduralMapResult } from '../../src/game/proceduralMap';
import { findPath } from '../../src/game/movement/pathfinding';
import {
  applyEmbarkOrder,
  boardArrivedPassengers,
  boatCapacity,
  disembarkPassengers,
  findLandingCells,
} from '../../src/game/navalTransport';
import { isAuthorizedPlayerCommand, isValidNetworkCommand } from '../../src/game/networkCommands';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';
import { BOAT_CAPACITY, MAP_SIZE, type GameState, type Unit } from '../../src/game/engine';

const SIZE = 60;

const playerResources = () => ({
  wood: 100,
  food: 100,
  gold: 50,
  stone: 0,
  planks: 0,
  pop: 2,
  maxPop: 15,
});

const createState = (overrides: Partial<GameState> = {}): GameState => ({
  units: [],
  buildings: [],
  resourceNodes: [],
  playerResources: { player1: playerResources(), player2: playerResources() },
  ...overrides,
});

const createUnit = (overrides: Partial<Unit> = {}): Unit => ({
  id: 'unit-1',
  type: 'villager',
  owner: 'player1',
  position: { x: 10, z: 10 },
  targetPosition: null,
  targetEntityId: null,
  health: 100,
  maxHealth: 100,
  attackDamage: 5,
  state: 'idle',
  ...overrides,
});

const createBoat = (overrides: Partial<Unit> = {}): Unit =>
  createUnit({
    id: 'boat-1',
    type: 'trade_boat',
    position: { x: 20, z: 20 },
    health: 220,
    maxHealth: 220,
    passengers: [],
    ...overrides,
  });

const villagers = (count: number, origin = { x: 21, z: 20 }): Unit[] =>
  Array.from({ length: count }, (_, index) =>
    createUnit({ id: `villager-${index}`, position: { x: origin.x + index * 0.1, z: origin.z } })
  );

const context = (overrides: Partial<SimulationContext> = {}): SimulationContext => ({
  playerSlot: 'player1',
  mode: 'host',
  gatherRadiusLimit: 14,
  sustainableForestryEnabled: false,
  buildingDefinitions: {},
  random: () => 0.9,
  createId: () => 'trained-unit',
  ...overrides,
});

const mapCache = new Map<number, ProceduralMapResult>();
function getMap(seed: number): ProceduralMapResult {
  let map = mapCache.get(seed);
  if (!map) {
    map = generateProceduralTerrain(SIZE, seed);
    mapCache.set(seed, map);
  }
  return map;
}

describe('capacidade de transporte', () => {
  it('deduplica IDs locais e recusa payload duplicado na rede', () => {
    const state = createState({ units: [createBoat(), ...villagers(1)] });
    const result = applyEmbarkOrder(state, ['villager-0', 'villager-0'], 'boat-1');
    expect(result.boarded).toEqual(['villager-0']);
    expect(result.state.units.find((u) => u.id === 'boat-1')?.passengers).toHaveLength(1);
    expect(isValidNetworkCommand({ type: 'embark', unitIds: ['villager-0', 'villager-0'], boatId: 'boat-1' })).toBe(false);
  });

  it('remove da população barco afundado e todos os passageiros uma única vez', () => {
    const state = createState({
      units: [createBoat({ health: 0, passengers: villagers(2) })],
      playerResources: { player1: { ...playerResources(), pop: 3 } },
    });
    const result = tickGameState(state, context());
    expect(result.state.units).toHaveLength(0);
    expect(result.state.playerResources.player1.pop).toBe(0);
    expect(tickGameState(result.state, context()).state.playerResources.player1.pop).toBe(0);
  });

  it('não embarca tropas inimigas mesmo numa chamada local', () => {
    const state = createState({ units: [createBoat(), createUnit({ id: 'enemy', owner: 'player2' })] });
    expect(applyEmbarkOrder(state, ['enemy'], 'boat-1').boarded).toEqual([]);
  });
  it('define 2 no barco de pesca, 4 no mercante e 0 na guerra', () => {
    expect(BOAT_CAPACITY.fishing_boat).toBe(2);
    expect(BOAT_CAPACITY.trade_boat).toBe(4);
    expect(BOAT_CAPACITY.warship).toBe(0);
    expect(boatCapacity('villager')).toBe(0);
  });

  it('embarca somente ate a capacidade livre e marca o excedente como pendente', () => {
    const state = createState({
      units: [createBoat(), ...villagers(6)],
    });

    const result = applyEmbarkOrder(state, villagers(6).map((unit) => unit.id), 'boat-1');

    expect(result.boarded).toHaveLength(4);
    expect(result.pending).toHaveLength(2);
    const boat = result.state.units.find((unit) => unit.id === 'boat-1');
    expect(boat?.passengers).toHaveLength(4);
    expect(result.state.units.filter((unit) => unit.type === 'villager')).toHaveLength(2);
  });

  it('barco de guerra nunca embarca nem aceita ordem de aproximacao', () => {
    const warship = createBoat({ id: 'warship-1', type: 'warship', passengers: [] });
    const state = createState({ units: [warship, ...villagers(2)] });

    const result = applyEmbarkOrder(state, ['villager-0', 'villager-1'], 'warship-1');

    expect(result.boarded).toHaveLength(0);
    expect(result.pending).toHaveLength(0);
    expect(result.state.units.find((unit) => unit.id === 'villager-0')?.embarkTargetId).toBeUndefined();
  });

  it('barco lotado mantem novas ordens pendentes ate haver espaco', () => {
    const boat = createBoat({
      passengers: [
        createUnit({ id: 'p1' }),
        createUnit({ id: 'p2' }),
        createUnit({ id: 'p3' }),
        createUnit({ id: 'p4' }),
      ],
    });
    const state = createState({ units: [boat, ...villagers(1)] });

    const result = applyEmbarkOrder(state, ['villager-0'], 'boat-1');

    expect(result.boarded).toHaveLength(0);
    expect(result.pending).toEqual(['villager-0']);
    const pending = result.state.units.find((unit) => unit.id === 'villager-0');
    expect(pending?.embarkTargetId).toBe('boat-1');
    expect(pending?.targetPosition).toEqual({ x: 20, z: 20 });
  });
});

describe('ordens de embarque e desembarque na rede', () => {
  it('valida a forma dos comandos embark e disembark', () => {
    expect(isValidNetworkCommand({ type: 'embark', unitIds: ['u1', 'u2'], boatId: 'b1' })).toBe(true);
    expect(isValidNetworkCommand({ type: 'embark', unitIds: [], boatId: 'b1' })).toBe(false);
    expect(isValidNetworkCommand({ type: 'embark', unitIds: ['u1'] })).toBe(false);
    expect(isValidNetworkCommand({ type: 'disembark', boatId: 'b1' })).toBe(true);
    expect(isValidNetworkCommand({ type: 'disembark' })).toBe(false);
  });

  it('autoriza embarque apenas com barco e unidades proprias', () => {
    const state = createState({
      units: [createBoat(), createUnit({ id: 'villager-0' }), createUnit({ id: 'boat-2', type: 'fishing_boat' })],
    });

    expect(
      isAuthorizedPlayerCommand(state, { type: 'embark', unitIds: ['villager-0'], boatId: 'boat-1' }, 'player1')
    ).toBe(true);
    expect(
      isAuthorizedPlayerCommand(state, { type: 'embark', unitIds: ['villager-0'], boatId: 'boat-2' }, 'player2')
    ).toBe(false);
    expect(
      isAuthorizedPlayerCommand(state, { type: 'embark', unitIds: ['boat-2'], boatId: 'boat-1' }, 'player1')
    ).toBe(false);
    expect(
      isAuthorizedPlayerCommand(state, { type: 'disembark', boatId: 'boat-1' }, 'player1')
    ).toBe(false);
  });

  it('desembarque exige passageiros a bordo', () => {
    const empty = createState({ units: [createBoat()] });
    const loaded = createState({ units: [createBoat({ passengers: [createUnit({ id: 'p1' })] })] });

    expect(isAuthorizedPlayerCommand(empty, { type: 'disembark', boatId: 'boat-1' }, 'player1')).toBe(false);
    expect(isAuthorizedPlayerCommand(loaded, { type: 'disembark', boatId: 'boat-1' }, 'player1')).toBe(true);
  });

  it('ordem de aproximacao e embarcada automaticamente ao entrar no raio', () => {
    const far = createUnit({ id: 'far', position: { x: 40, z: 40 }, embarkTargetId: 'boat-1' });
    const near = createUnit({ id: 'near', position: { x: 22, z: 20 }, embarkTargetId: 'boat-1' });
    const result = boardArrivedPassengers([createBoat(), far, near]);

    expect(result.find((unit) => unit.id === 'near')).toBeUndefined();
    expect(result.find((unit) => unit.id === 'boat-1')?.passengers?.map((unit) => unit.id)).toEqual(['near']);
    const remaining = result.find((unit) => unit.id === 'far');
    expect(remaining?.embarkTargetId).toBe('boat-1');
  });

  it('limpa a ordem de aproximacao se o barco foi destruido', () => {
    const orphan = createUnit({ id: 'far', position: { x: 40, z: 40 }, embarkTargetId: 'boat-x' });
    const result = boardArrivedPassengers([orphan]);
    expect(result[0].embarkTargetId).toBeUndefined();
  });
});

describe('caminho naval ao redor de ilhas', () => {
  it('leva um barco de uma ilha a outra contornando apenas por oceano', () => {
    const map = getMap(24680);
    const from = findNearestOceanCell(map, map.islands[0].spawn.x, map.islands[0].spawn.z);
    const to = findNearestOceanCell(map, map.islands[1].spawn.x, map.islands[1].spawn.z);
    expect(from).not.toBeNull();
    expect(to).not.toBeNull();

    const path = findPath(
      from as { x: number; z: number },
      to as { x: number; z: number },
      (x, z) => !map.isOceanAt(x, z),
      { mapSize: MAP_SIZE, maxExpanded: 2400 }
    );

    expect(path.length).toBeGreaterThan(0);
    expect(path.every((point) => map.isOceanAt(point.x, point.z))).toBe(true);
    const end = path[path.length - 1];
    expect(Math.hypot(end.x - (to as { x: number; z: number }).x, end.z - (to as { x: number; z: number }).z)).toBeLessThan(3);
  });
});

describe('desembarque em terreno valido', () => {
  it('coloca os passageiros em terra firme livre ao redor do barco', () => {
    const map = getMap(24680);
    const coast = findNearestOceanCell(map, map.islands[0].spawn.x, map.islands[0].spawn.z);
    expect(coast).not.toBeNull();
    const boat = createBoat({
      position: coast as { x: number; z: number },
      passengers: [createUnit({ id: 'p1' }), createUnit({ id: 'p2' })],
    });
    const state = createState({ units: [boat] });

    const result = disembarkPassengers(state, 'boat-1', map);

    expect(result.placed).toHaveLength(2);
    expect(result.remaining).toBe(0);
    for (const unit of result.placed) {
      expect(map.isWaterAt(unit.position.x, unit.position.z)).toBe(false);
      expect(map.isImpassableAt(unit.position.x, unit.position.z)).toBe(false);
      expect(unit.state).toBe('idle');
    }
    expect(result.state.units.filter((unit) => unit.type === 'villager')).toHaveLength(2);
    expect(result.state.units.find((unit) => unit.id === 'boat-1')?.passengers).toHaveLength(0);
  });

  it('nunca posiciona unidades dentro de edificios', () => {
    const map = getMap(24680);
    const coast = findNearestOceanCell(map, map.islands[0].spawn.x, map.islands[0].spawn.z) as { x: number; z: number };
    const units = [createBoat({ position: coast })];
    const withoutBuilding = findLandingCells(map, [], units, coast, 4);
    expect(withoutBuilding.length).toBeGreaterThan(0);

    const blocked = withoutBuilding[0];
    const building = {
      id: 'house-1',
      type: 'house' as const,
      owner: 'player1' as const,
      position: blocked,
      health: 100,
      maxHealth: 100,
      isComplete: true,
      trainingQueue: [],
    };
    const cells = findLandingCells(map, [building], units, coast, 4);

    expect(cells.some((cell) => cell.x === blocked.x && cell.z === blocked.z)).toBe(false);
  });

  it('nao ha terreno livre quando o barco esta no alto-mar', () => {
    const map = getMap(24680);
    let midOcean: { x: number; z: number } | null = null;
    for (let z = 2; z < SIZE - 2 && !midOcean; z++) {
      for (let x = 2; x < SIZE - 2; x++) {
        if (!map.isOceanAt(x + 0.5, z + 0.5)) continue;
        const land = findLandingCells(map, [], [], { x: x + 0.5, z: z + 0.5 }, 1);
        if (land.length === 0) {
          midOcean = { x: x + 0.5, z: z + 0.5 };
          break;
        }
      }
    }
    expect(midOcean).not.toBeNull();

    const boat = createBoat({ position: midOcean as { x: number; z: number }, passengers: [createUnit({ id: 'p1' })] });
    const state = createState({ units: [boat] });
    const result = disembarkPassengers(state, 'boat-1', map);

    expect(result.placed).toHaveLength(0);
    expect(result.remaining).toBe(1);
    expect(result.state.units.find((unit) => unit.id === 'boat-1')?.passengers).toHaveLength(1);
  });
});

describe('tick embarca unidades que chegaram perto do barco', () => {
  it('transfere a unidade para os passageiros no passo de simulacao', () => {
    const boat = createBoat({ position: { x: 20, z: 20 } });
    const unit = createUnit({
      id: 'walker',
      position: { x: 22, z: 20 },
      targetPosition: { x: 20, z: 20 },
      targetEntityId: null,
      state: 'moving',
      embarkTargetId: 'boat-1',
    });
    const state = createState({ units: [boat, unit] });

    const result = tickGameState(state, context());

    expect(result.state.units.find((candidate) => candidate.id === 'walker')).toBeUndefined();
    const updatedBoat = result.state.units.find((candidate) => candidate.id === 'boat-1');
    expect(updatedBoat?.passengers?.map((passenger) => passenger.id)).toEqual(['walker']);
  });
});


describe('regressões de integridade naval #49', () => {
  it('repetir embarque em outro barco não duplica a unidade nem altera a população', () => {
    const initial = createState({ units: [createBoat(), createBoat({ id: 'boat-2' }), ...villagers(1)] });
    const first = applyEmbarkOrder(initial, ['villager-0'], 'boat-1').state;
    const repeated = applyEmbarkOrder(first, ['villager-0'], 'boat-2').state;
    expect(repeated.units.flatMap((u) => u.passengers ?? []).map((u) => u.id)).toEqual(['villager-0']);
    expect(repeated.units.some((u) => u.id === 'villager-0')).toBe(false);
    expect(repeated.playerResources).toEqual(initial.playerResources);
    expect(initial.units).toHaveLength(3);
    expect(initial.units[0].passengers).toEqual([]);
  });

  it('ordens repetidas pendentes respeitam capacidade quando chegam no tick', () => {
    const walkers = villagers(6, { x: 40, z: 40 });
    const initial = createState({ units: [createBoat(), ...walkers] });
    const ids = walkers.map((u) => u.id);
    const ordered = applyEmbarkOrder(initial, [...ids, ...ids], 'boat-1');
    expect(ordered.pending).toEqual(ids);
    const arrived = ordered.state.units.map((u) => u.type === 'villager'
      ? { ...u, position: { x: 21, z: 20 } } : u);
    const result = boardArrivedPassengers(arrived);
    const loaded = result.find((u) => u.id === 'boat-1')!;
    expect(loaded.passengers).toHaveLength(4);
    expect(new Set(loaded.passengers!.map((u) => u.id)).size).toBe(4);
    expect(result.filter((u) => u.type === 'villager')).toHaveLength(2);
    expect(boardArrivedPassengers(result)).toEqual(result);
  });

  it('embarque e desembarque sobrevivem a snapshot JSON sem criar passageiros', () => {
    const initial = createState({ units: [createBoat(), ...villagers(2)] });
    const loaded = applyEmbarkOrder(initial, ['villager-0', 'villager-1'], 'boat-1').state;
    const snapshot: GameState = JSON.parse(JSON.stringify(loaded));
    const land = { isWaterAt: () => false, isImpassableAt: () => false };
    const unloaded = disembarkPassengers(snapshot, 'boat-1', land);
    expect(unloaded.placed.map((u) => u.id)).toEqual(['villager-0', 'villager-1']);
    expect(new Set(unloaded.state.units.map((u) => u.id)).size).toBe(3);
    expect(unloaded.state.playerResources).toEqual(initial.playerResources);
    expect(disembarkPassengers(unloaded.state, 'boat-1', land).placed).toEqual([]);
    expect(snapshot.units[0].passengers).toHaveLength(2);
  });

  it('afundamentos simultâneos debitam cada proprietário e preservam os sobreviventes', () => {
    const initial = createState({
      units: [
        createBoat({ health: 0, passengers: villagers(2) }),
        createBoat({ id: 'enemy-boat', owner: 'player2', health: 0 }),
        createUnit({ id: 'survivor' }),
      ],
      playerResources: {
        player1: { ...playerResources(), pop: 4 },
        player2: { ...playerResources(), pop: 1 },
      },
    });
    const snapshot: GameState = JSON.parse(JSON.stringify(tickGameState(initial, context()).state));
    expect(snapshot.units.map((u) => u.id)).toEqual(['survivor']);
    expect(snapshot.playerResources.player1.pop).toBe(1);
    expect(snapshot.playerResources.player2.pop).toBe(0);
    expect(tickGameState(snapshot, context()).state.playerResources).toEqual(snapshot.playerResources);
    expect(initial.playerResources.player1.pop).toBe(4);
    expect(initial.units[0].passengers).toHaveLength(2);
  });

  it('afundamento nunca torna população negativa mesmo com contador menor que a carga', () => {
    const initial = createState({ units: [createBoat({ health: 0, passengers: villagers(2) })] });
    const result = tickGameState(initial, context()).state;
    expect(result.units).toEqual([]);
    expect(result.playerResources.player1.pop).toBe(0);
    expect(result.playerResources.player2.pop).toBe(initial.playerResources.player2.pop);
  });
});
