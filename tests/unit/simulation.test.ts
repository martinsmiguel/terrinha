import { describe, expect, it } from 'vitest';
import type { Building, GameState, PlayerResources, Unit } from '../../src/game/engine';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';

const playerResources = (): PlayerResources => ({
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

const createBuilding = (overrides: Partial<Building> = {}): Building => ({
  id: 'building-1',
  type: 'town_center',
  owner: 'player1',
  position: { x: 10, z: 10 },
  health: 500,
  maxHealth: 500,
  isComplete: true,
  trainingQueue: [],
  ...overrides,
});

const context = (overrides: Partial<SimulationContext> = {}): SimulationContext => ({
  playerSlot: 'player1',
  mode: 'host',
  gatherRadiusLimit: 14,
  sustainableForestryEnabled: false,
  buildingDefinitions: {
    house: { name: 'Casa', buildTimeSeconds: 1 },
    town_center: { name: 'Centro da Vila', buildTimeSeconds: 10 },
  },
  random: () => 0.9,
  createId: () => 'trained-unit',
  ...overrides,
});

describe('tickGameState', () => {
  it('moves units toward their target by one simulation step', () => {
    const state = createState({
      units: [createUnit({ targetPosition: { x: 12, z: 10 }, state: 'moving' })],
    });

    const result = tickGameState(state, context());

    expect(result.state.units[0].position).toEqual({ x: 10.16, z: 10 });
    expect(state.units[0].position).toEqual({ x: 10, z: 10 });
  });

  it('gathers resources and removes an exhausted deposit without mutating the input state', () => {
    const state = createState({
      units: [createUnit({ position: { x: 10, z: 10 }, targetEntityId: 'tree-1', state: 'gathering' })],
      resourceNodes: [{ id: 'tree-1', type: 'tree', position: { x: 10.5, z: 10 }, remaining: 0.5 }],
    });

    const result = tickGameState(state, context());

    expect(result.state.playerResources.player1.wood).toBe(100.5);
    expect(result.state.units[0]).toMatchObject({ state: 'idle', targetEntityId: null });
    expect(result.state.resourceNodes).toEqual([]);
    expect(state.playerResources.player1.wood).toBe(100);
    expect(state.resourceNodes[0].remaining).toBe(0.5);
  });

  it('applies combat damage and starts the attacker cooldown', () => {
    const state = createState({
      units: [
        createUnit({ id: 'soldier-1', type: 'soldier', state: 'attacking', targetEntityId: 'enemy-1' }),
        createUnit({ id: 'enemy-1', owner: 'player2', position: { x: 11, z: 10 }, health: 100 }),
      ],
    });

    const result = tickGameState(state, context());

    expect(result.state.units.find((unit) => unit.id === 'enemy-1')?.health).toBe(76);
    expect(result.state.units.find((unit) => unit.id === 'soldier-1')?.attackCooldown).toBe(12);
    expect(result.effects).toContainEqual({ type: 'sound', sound: 'combat-hit', musket: true });
  });

  it('completes unit training, creates a unit, and updates population', () => {
    const state = createState({
      buildings: [createBuilding({ trainingQueue: [{ unitType: 'soldier', progress: 98 }] })],
    });

    const result = tickGameState(state, context());

    expect(result.state.units).toContainEqual(expect.objectContaining({ id: 'trained-unit', type: 'soldier' }));
    expect(result.state.buildings[0].trainingQueue).toEqual([]);
    expect(result.state.playerResources.player1.pop).toBe(3);
    expect(result.effects).toContainEqual({ type: 'sound', sound: 'unit-trained', unitType: 'soldier' });
  });

  it('completes construction, restores building health, and grants house capacity', () => {
    const state = createState({
      units: [createUnit({ state: 'building', targetEntityId: 'house-1' })],
      buildings: [createBuilding({ id: 'house-1', type: 'house', isComplete: false, buildProgress: 99, health: 400, maxHealth: 450 })],
    });

    const result = tickGameState(state, context());

    expect(result.state.buildings[0]).toMatchObject({ isComplete: true, buildProgress: 100, health: 450 });
    expect(result.state.playerResources.player1.maxPop).toBe(20);
    expect(result.state.units[0]).toMatchObject({ state: 'idle', targetEntityId: null });
    expect(result.effects).toContainEqual({ type: 'notification', message: 'Construção Concluída: Casa!', level: 'success' });
  });
});

describe('single-player AI on the archipelago', () => {
  const aiContext = () =>
    context({ mode: 'single', playerSlot: 'player1', activeSlots: ['player1', 'player2'] });

  it('gathers from the nearest tree of its own base, never from another island', () => {
    const state = createState({
      units: [createUnit({ id: 'ai-villager', owner: 'player2', position: { x: 41, z: 41 } })],
      buildings: [
        createBuilding({ id: 'ai-tc', owner: 'player2', position: { x: 40, z: 40 } }),
        createBuilding({ id: 'human-tc', owner: 'player1', position: { x: 10, z: 10 } }),
      ],
      resourceNodes: [
        { id: 'near-tree', type: 'tree', position: { x: 43, z: 41 }, remaining: 100 },
        { id: 'far-tree', type: 'tree', position: { x: 11, z: 11 }, remaining: 100 },
      ],
    });

    const result = tickGameState(state, aiContext());
    const villager = result.state.units.find((unit) => unit.id === 'ai-villager');
    expect(villager?.targetEntityId).toBe('near-tree');
  });

  it('does not order the AI army to march across the ocean to the human base', () => {
    const soldiers = [1, 2, 3].map((index) =>
      createUnit({
        id: `ai-soldier-${index}`,
        type: 'soldier',
        owner: 'player2',
        position: { x: 41 + index, z: 41 },
      })
    );
    const state = createState({
      units: soldiers,
      buildings: [
        createBuilding({ id: 'ai-tc', owner: 'player2', position: { x: 40, z: 40 } }),
        createBuilding({ id: 'human-tc', owner: 'player1', position: { x: 10, z: 10 } }),
      ],
    });

    const result = tickGameState(state, aiContext());
    for (const soldier of result.state.units) {
      expect(soldier.targetPosition).toBeNull();
    }
  });
});

describe('simulation performance', () => {
  it('keeps twenty ticks responsive with a representative number of moving units', () => {
    const units = Array.from({ length: 120 }, (_, index) =>
      createUnit({
        id: `unit-${index}`,
        owner: index % 3 === 0 ? 'player2' : 'player1',
        position: { x: (index % 40) + 0.5, z: Math.floor(index / 40) + 0.5 },
        targetPosition: { x: (index % 40) + 0.5, z: 55.5 },
        state: 'moving',
      })
    );
    let state = createState({ units });
    const tickContext = context();

    const startedAt = performance.now();
    for (let tick = 0; tick < 20; tick++) {
      state = tickGameState(state, tickContext).state;
    }
    const elapsedMs = performance.now() - startedAt;

    expect(state.units).toHaveLength(120);
    expect(elapsedMs).toBeLessThan(2000);
  });
});
