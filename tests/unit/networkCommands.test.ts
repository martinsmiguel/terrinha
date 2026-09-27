import { describe, expect, it } from 'vitest';
import { isAuthorizedPlayerCommand, isValidJoinRequest, isValidNetworkCommand, roomJoinError } from '../../src/game/networkCommands';
import type { GameState } from '../../src/game/engine';

const state: GameState = {
  units: [
    {
      id: 'villager-1', type: 'villager', owner: 'player1', position: { x: 10, z: 10 },
      targetPosition: null, targetEntityId: null, health: 50, maxHealth: 50, attackDamage: 2, state: 'idle',
    },
    {
      id: 'soldier-2', type: 'soldier', owner: 'player2', position: { x: 12, z: 10 },
      targetPosition: null, targetEntityId: null, health: 100, maxHealth: 100, attackDamage: 10, state: 'idle',
    },
  ],
  buildings: [{
    id: 'town-center-1', type: 'town_center', owner: 'player1', position: { x: 8, z: 8 },
    health: 2400, maxHealth: 2400, isComplete: true, trainingQueue: [],
  }],
  resourceNodes: [{ id: 'tree-1', type: 'tree', position: { x: 11, z: 10 }, remaining: 100 }],
  playerResources: {
    player1: { wood: 300, food: 300, gold: 100, stone: 0, planks: 0, pop: 1, maxPop: 15 },
    player2: { wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: 1, maxPop: 15 },
    player3: { wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: 0, maxPop: 10 },
    player4: { wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: 0, maxPop: 10 },
  },
};

describe('network command validation', () => {
  it('accepts a well-formed room request and rejects invalid slots and oversized names', () => {
    expect(isValidJoinRequest({ roomId: 'SALA_12', playerName: 'Ana', playerSlot: 'player2', isHost: false })).toBe(true);
    expect(isValidJoinRequest({ roomId: 'SALA 12', playerName: 'Ana', playerSlot: 'player2', isHost: false })).toBe(false);
    expect(isValidJoinRequest({ roomId: 'SALA12', playerName: 'A'.repeat(33), playerSlot: 'player2', isHost: false })).toBe(false);
    expect(isValidJoinRequest({ roomId: 'SALA12', playerName: 'Ana', playerSlot: 'player9', isHost: false })).toBe(false);
  });

  it('admits one host and unique player slots, with a four-player room limit', () => {
    const host = { roomId: 'SALA12', playerName: 'Ana', playerSlot: 'player1', isHost: true } as const;
    const client = { roomId: 'SALA12', playerName: 'Bia', playerSlot: 'player2', isHost: false } as const;
    expect(roomJoinError(host, [])).toBeNull();
    expect(roomJoinError(client, [])).toContain('Não há uma partida');
    expect(roomJoinError(host, [{ playerSlot: 'player1', isHost: true }])).toContain('já tem um anfitrião');
    expect(roomJoinError(client, [{ playerSlot: 'player1', isHost: true }])).toBeNull();
    expect(roomJoinError({ ...client, playerSlot: 'player1' }, [{ playerSlot: 'player1', isHost: true }])).toContain('já foi escolhida');
    expect(roomJoinError(client, [
      { playerSlot: 'player1', isHost: true },
      { playerSlot: 'player2' },
      { playerSlot: 'player3' },
      { playerSlot: 'player4' },
    ])).toContain('limite de quatro');
  });

  it('rejects unknown commands, invalid coordinates and unbounded work limits', () => {
    expect(isValidNetworkCommand({ type: 'teleport', unitId: 'villager-1', target: { x: 1, z: 1 } })).toBe(false);
    expect(isValidNetworkCommand({ type: 'move', unitId: 'villager-1', target: { x: Number.NaN, z: 1 } })).toBe(false);
    expect(isValidNetworkCommand({ type: 'set_work_zone', unitIds: ['villager-1'], radiusLimit: Infinity })).toBe(false);
    expect(isValidNetworkCommand({ type: 'move', unitId: 'villager-1', target: { x: 1, z: 1 }, unexpected: 'payload' })).toBe(false);
    expect(isValidNetworkCommand({ type: 'move', unitId: 'villager-1', target: { x: 1, z: 1 }, playerSlot: 'player9' })).toBe(false);
  });

  it('accepts owned-unit orders and rejects orders against another player unit', () => {
    expect(isAuthorizedPlayerCommand(state, { type: 'move', unitId: 'villager-1', target: { x: 20, z: 20 } }, 'player1')).toBe(true);
    expect(isAuthorizedPlayerCommand(state, { type: 'move', unitId: 'soldier-2', target: { x: 20, z: 20 } }, 'player1')).toBe(false);
  });

  it('only allows attacks against an enemy and gathering from a valid resource', () => {
    expect(isAuthorizedPlayerCommand(state, { type: 'attack', unitId: 'villager-1', targetId: 'soldier-2' }, 'player1')).toBe(true);
    expect(isAuthorizedPlayerCommand(state, { type: 'attack', unitId: 'villager-1', targetId: 'town-center-1' }, 'player1')).toBe(false);
    expect(isAuthorizedPlayerCommand(state, { type: 'gather', unitId: 'villager-1', targetId: 'tree-1' }, 'player1')).toBe(true);
    expect(isAuthorizedPlayerCommand(state, { type: 'gather', unitId: 'villager-1', targetId: 'missing-node' }, 'player1')).toBe(false);
  });

  it('rejects building orders with a forged owner or insufficient resources', () => {
    const command = { type: 'build', buildingType: 'house', owner: 'player1', position: { x: 20, z: 20 } };
    expect(isAuthorizedPlayerCommand(state, command, 'player1')).toBe(true);
    expect(isAuthorizedPlayerCommand(state, { ...command, owner: 'player2' }, 'player1')).toBe(false);

    const poorState = {
      ...state,
      playerResources: { ...state.playerResources, player1: { ...state.playerResources.player1, wood: 0 } },
    };
    expect(isAuthorizedPlayerCommand(poorState, command, 'player1')).toBe(false);
  });

  it('checks catalog resources and rejects town-center construction commands', () => {
    const tower = { type: 'build', buildingType: 'tower', owner: 'player1', position: { x: 20, z: 20 } };
    expect(isAuthorizedPlayerCommand(state, tower, 'player1')).toBe(true);

    const poorState = {
      ...state,
      playerResources: {
        ...state.playerResources,
        player1: { ...state.playerResources.player1, gold: 0 },
      },
    };
    expect(isAuthorizedPlayerCommand(poorState, tower, 'player1')).toBe(false);
    expect(isValidNetworkCommand({ ...tower, buildingType: 'town_center' })).toBe(false);
  });

  it('requires a completed owned building, queue capacity, population and resources to train', () => {
    const barracksState: GameState = {
      ...state,
      buildings: [{
        id: 'barracks-1', type: 'barracks', owner: 'player1', position: { x: 8, z: 8 },
        health: 800, maxHealth: 800, isComplete: true, trainingQueue: [],
      }],
    };
    expect(isAuthorizedPlayerCommand(barracksState, { type: 'train', buildingId: 'barracks-1', unitType: 'soldier' }, 'player1')).toBe(true);
    expect(isAuthorizedPlayerCommand(barracksState, { type: 'train', buildingId: 'town-center-1', unitType: 'soldier' }, 'player1')).toBe(false);

    const poorState = {
      ...barracksState,
      playerResources: { ...barracksState.playerResources, player1: { ...barracksState.playerResources.player1, food: 0 } },
    };
    expect(isAuthorizedPlayerCommand(poorState, { type: 'train', buildingId: 'barracks-1', unitType: 'soldier' }, 'player1')).toBe(false);

    const fullQueue = {
      ...barracksState,
      buildings: barracksState.buildings.map((building) => ({
        ...building,
        trainingQueue: Array.from({ length: 5 }, () => ({ unitType: 'soldier' as const, progress: 0 })),
      })),
    };
    expect(isAuthorizedPlayerCommand(fullQueue, { type: 'train', buildingId: 'barracks-1', unitType: 'soldier' }, 'player1')).toBe(false);

    const foreignBuilding = {
      ...barracksState,
      buildings: barracksState.buildings.map((building) => ({ ...building, owner: 'player2' })),
      playerResources: {
        ...barracksState.playerResources,
        player2: { ...barracksState.playerResources.player2, food: 200, gold: 100 },
      },
    };
    expect(isAuthorizedPlayerCommand(foreignBuilding, { type: 'train', buildingId: 'barracks-1', unitType: 'soldier' }, 'player1')).toBe(false);
  });
});
