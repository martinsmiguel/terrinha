import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '../../src/game/model';
import { MAP_SIZE, worldSizeOf } from '../../src/game/model';
import { findLandingCells, disembarkPassengers } from '../../src/game/navalTransport';
import { isAuthorizedPlayerCommand, isValidNetworkCommand } from '../../src/game/networkCommands';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';

const resources = { wood: 100, food: 100, gold: 100, stone: 0, planks: 0, pop: 1, maxPop: 15 };
const unit = (overrides: Partial<Unit> = {}): Unit => ({
  id: 'u1', type: 'villager', owner: 'player1', position: { x: 100, z: 100 }, targetPosition: null, targetEntityId: null,
  health: 100, maxHealth: 100, attackDamage: 5, state: 'idle', ...overrides,
});
const state = (overrides: Partial<GameState> = {}): GameState => ({
  units: [], buildings: [], resourceNodes: [], playerResources: { player1: resources, player2: resources }, ...overrides,
});
const context = (map: SimulationContext['map']): SimulationContext => ({
  playerSlot: 'player1', mode: 'host', map, pathCache: new Map(), gatherRadiusLimit: 14, sustainableForestryEnabled: false,
  buildingDefinitions: {}, random: () => 0.5, createId: () => 'x', activeSlots: ['player1'],
});

describe('dimensão do mundo na sessão', () => {
  it('usa o tamanho da sessão e cai no padrão de 60 sem ele', () => {
    expect(worldSizeOf({})).toBe(MAP_SIZE);
    expect(worldSizeOf({ mapSize: 192 })).toBe(192);
  });

  it('comandos aceitam posições até o limite do mundo da sessão e recusam além dele', () => {
    const move = { type: 'move', unitId: 'u1', target: { x: 150, z: 150 } };
    expect(isValidNetworkCommand(move)).toBe(false);
    expect(isValidNetworkCommand(move, 192)).toBe(true);
    expect(isValidNetworkCommand({ ...move, target: { x: 193, z: 10 } }, 192)).toBe(false);
    expect(isValidNetworkCommand({ type: 'move', unitId: 'u1', target: { x: 60, z: 60 } })).toBe(true);
  });

  it('a autorização lê o tamanho do estado da partida', () => {
    const move = { type: 'move', unitId: 'u1', target: { x: 150, z: 150 } };
    expect(isAuthorizedPlayerCommand(state({ units: [unit()] }), move, 'player1')).toBe(false);
    expect(isAuthorizedPlayerCommand(state({ units: [unit()], mapSize: 192 }), move, 'player1')).toBe(true);
  });

  it('a rota contorna uma muralha num mundo de 192, fora do alcance do grid de 60', () => {
    const wall = (x: number, z: number) => x >= 110 && x < 112 && z < 125;
    const map = { isWaterAt: () => false, isImpassableAt: wall, isOceanAt: () => false };
    let current = state({ units: [unit({ state: 'moving', targetPosition: { x: 125, z: 100 } })], mapSize: 192 });
    const ctx = context(map);
    for (let tick = 0; tick < 1200 && current.units[0].state === 'moving'; tick += 1) current = tickGameState(current, ctx).state;
    expect(current.units[0].state).toBe('idle');
    expect(Math.hypot(current.units[0].position.x - 125, current.units[0].position.z - 100)).toBeLessThan(0.5);
  });

  it('o desembarque procura terra no mundo da sessão, não só até 60', () => {
    const land = { isWaterAt: () => false, isImpassableAt: () => false };
    const origin = { x: 100, z: 100 };
    expect(findLandingCells(land, [], [], origin, 2)).toEqual([]);
    expect(findLandingCells(land, [], [], origin, 2, 192)).toHaveLength(2);
    const boat = unit({ id: 'b', type: 'trade_boat', passengers: [unit({ id: 'p1' }), unit({ id: 'p2' })] });
    const result = disembarkPassengers(state({ units: [boat], mapSize: 192 }), 'b', land);
    expect(result.placed).toHaveLength(2);
    expect(disembarkPassengers(state({ units: [boat] }), 'b', land).placed).toHaveLength(0);
  });
});
