import { describe, expect, it } from 'vitest';
import { isAuthorizedPlayerCommand, isValidJoinRequest, isValidNetworkCommand, roomJoinError, soloMatchSlots } from '../../src/game/networkCommands';
import { BUILDING_CATALOG } from '../../src/game/buildingCatalog';
import { createTechState } from '../../src/game/tech';
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

  it('rejects attack orders forged for civilian boats', () => {
    const boat = { ...state.units[0], id: 'civil-boat', type: 'trade_boat' as const };
    expect(isAuthorizedPlayerCommand({ ...state, units: [...state.units, boat] },
      { type: 'attack', unitId: boat.id, targetId: 'soldier-2' }, 'player1')).toBe(false);
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
    const towerCost = BUILDING_CATALOG.tower.cost;
    const richEnough: GameState = {
      ...state,
      playerResources: {
        ...state.playerResources,
        player1: {
          ...state.playerResources.player1,
          wood: towerCost.wood,
          stone: towerCost.stone ?? 0,
          planks: towerCost.planks ?? 0,
        },
      },
    };

    const tower = { type: 'build', buildingType: 'tower', owner: 'player1', position: { x: 20, z: 20 } };
    expect(isAuthorizedPlayerCommand(richEnough, tower, 'player1')).toBe(true);

    const poorState: GameState = {
      ...richEnough,
      playerResources: {
        ...richEnough.playerResources,
        player1: { ...richEnough.playerResources.player1, stone: 0 },
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

describe('repair and demolish commands', () => {
  const damagedState: GameState = {
    ...state,
    buildings: [
      ...state.buildings,
      {
        id: 'house-1', type: 'house', owner: 'player1', position: { x: 15, z: 15 },
        health: 60, maxHealth: 120, isComplete: true, trainingQueue: [],
      },
      {
        id: 'house-2', type: 'house', owner: 'player2', position: { x: 40, z: 40 },
        health: 60, maxHealth: 120, isComplete: true, trainingQueue: [],
      },
    ],
  };

  it('rejects malformed repair and demolish payloads', () => {
    expect(isValidNetworkCommand({ type: 'repair', unitId: 'villager-1' })).toBe(false);
    expect(isValidNetworkCommand({ type: 'demolish' })).toBe(false);
    expect(isValidNetworkCommand({ type: 'demolish', buildingId: 'house-1', unitId: 'villager-1' })).toBe(false);
  });

  it('lets an own villager repair a damaged own building only', () => {
    const repairOwn = { type: 'repair', unitId: 'villager-1', buildingId: 'house-1' };
    expect(isAuthorizedPlayerCommand(damagedState, repairOwn, 'player1')).toBe(true);
    expect(isAuthorizedPlayerCommand(damagedState, repairOwn, 'player2')).toBe(false);
    expect(isAuthorizedPlayerCommand(damagedState, { type: 'repair', unitId: 'villager-1', buildingId: 'house-2' }, 'player1')).toBe(false);
    expect(isAuthorizedPlayerCommand(damagedState, { type: 'repair', unitId: 'soldier-2', buildingId: 'house-2' }, 'player2')).toBe(false);
    expect(isAuthorizedPlayerCommand(damagedState, { type: 'repair', unitId: 'villager-1', buildingId: 'missing-house' }, 'player1')).toBe(false);
  });

  it('refuses repairing a building that is already at full health', () => {
    expect(isAuthorizedPlayerCommand(damagedState, { type: 'repair', unitId: 'villager-1', buildingId: 'town-center-1' }, 'player1')).toBe(false);
  });

  it('validates ownership on demolish and protects the town center', () => {
    expect(isAuthorizedPlayerCommand(damagedState, { type: 'demolish', buildingId: 'house-1' }, 'player1')).toBe(true);
    expect(isAuthorizedPlayerCommand(damagedState, { type: 'demolish', buildingId: 'house-2' }, 'player1')).toBe(false);
    expect(isAuthorizedPlayerCommand(damagedState, { type: 'demolish', buildingId: 'town-center-1' }, 'player1')).toBe(false);
  });
});

describe('cavalry training', () => {
  const barracksState: GameState = {
    ...state,
    buildings: [{
      id: 'barracks-1', type: 'barracks', owner: 'player1', position: { x: 8, z: 8 },
      health: 800, maxHealth: 800, isComplete: true, trainingQueue: [],
    }],
  };

  it('accepts cavalry orders at the barracks and rejects them elsewhere', () => {
    const cavalry = { type: 'train', buildingId: 'barracks-1', unitType: 'cavalry' as const };
    expect(isValidNetworkCommand(cavalry)).toBe(true);
    expect(isAuthorizedPlayerCommand(barracksState, cavalry, 'player1')).toBe(true);
    expect(isAuthorizedPlayerCommand(barracksState, { ...cavalry, buildingId: 'town-center-1' }, 'player1')).toBe(false);
    expect(isAuthorizedPlayerCommand(barracksState, cavalry, 'player2')).toBe(false);
  });

  it('charges cavalry the 60 food + 80 gold upkeep of gold', () => {
    const noGold = {
      ...barracksState,
      playerResources: { ...barracksState.playerResources, player1: { ...barracksState.playerResources.player1, gold: 79 } },
    };
    expect(isAuthorizedPlayerCommand(noGold, { type: 'train', buildingId: 'barracks-1', unitType: 'cavalry' }, 'player1')).toBe(false);
  });
});

describe('soloMatchSlots', () => {
  it('puts the human first and fills the rest with AI slots up to the chosen size', () => {
    expect(soloMatchSlots('player1', 2)).toEqual(['player1', 'player2']);
    expect(soloMatchSlots('player1', 4)).toEqual(['player1', 'player2', 'player3', 'player4']);
    expect(soloMatchSlots('player3', 3)).toEqual(['player3', 'player1', 'player2']);
    expect(soloMatchSlots('player4', 2)).toEqual(['player4', 'player1']);
  });
});

describe('research commands', () => {
  const withTechs: GameState = {
    ...state,
    techs: { player1: createTechState(), player2: createTechState() },
  };

  it('validates research payloads', () => {
    expect(isValidNetworkCommand({ type: 'research', id: 'irrigation' })).toBe(true);
    expect(isValidNetworkCommand({ type: 'research' })).toBe(false);
    expect(isValidNetworkCommand({ type: 'research', id: '' })).toBe(false);
    expect(isValidNetworkCommand({ type: 'research', id: 'irrigation', unexpected: 1 })).toBe(false);
  });

  it('authorizes only affordable research of the current era', () => {
    expect(isAuthorizedPlayerCommand(withTechs, { type: 'research', id: 'irrigation' }, 'player1')).toBe(true);
    expect(isAuthorizedPlayerCommand(withTechs, { type: 'research', id: 'cartography' }, 'player1')).toBe(false);
    expect(isAuthorizedPlayerCommand(withTechs, { type: 'research', id: 'nope' }, 'player1')).toBe(false);
    expect(
      isAuthorizedPlayerCommand({ ...withTechs, techs: undefined }, { type: 'research', id: 'irrigation' }, 'player1')
    ).toBe(false);
  });

  it('rejects research the player cannot pay for', () => {
    const broke: GameState = {
      ...withTechs,
      playerResources: {
        ...withTechs.playerResources,
        player1: { ...withTechs.playerResources.player1, wood: 0, gold: 0 },
      },
    };
    expect(isAuthorizedPlayerCommand(broke, { type: 'research', id: 'irrigation' }, 'player1')).toBe(false);
  });
});

describe('naval combat', () => {
  const navalState: GameState = {
    ...state,
    playerResources: {
      ...state.playerResources,
      player1: { ...state.playerResources.player1, planks: 100 },
    },
    units: [
      ...state.units,
      {
        id: 'warship-1', type: 'warship', owner: 'player1', position: { x: 30, z: 30 },
        targetPosition: null, targetEntityId: null, health: 300, maxHealth: 300, attackDamage: 24, state: 'idle',
      },
      {
        id: 'trade-2', type: 'trade_boat', owner: 'player2', position: { x: 32, z: 30 },
        targetPosition: null, targetEntityId: null, health: 220, maxHealth: 220, attackDamage: 5, state: 'idle',
      },
    ],
    buildings: [
      ...state.buildings,
      {
        id: 'dock-1', type: 'dock', owner: 'player1', position: { x: 30, z: 34 },
        health: 900, maxHealth: 900, isComplete: true, trainingQueue: [],
      },
      {
        id: 'barracks-1', type: 'barracks', owner: 'player1', position: { x: 8, z: 8 },
        health: 800, maxHealth: 800, isComplete: true, trainingQueue: [],
      },
    ],
  };

  it('trains warships only at the dock', () => {
    const cmd = { type: 'train', buildingId: 'dock-1', unitType: 'warship' as const };
    expect(isValidNetworkCommand(cmd)).toBe(true);
    expect(isAuthorizedPlayerCommand(navalState, cmd, 'player1')).toBe(true);
    expect(isAuthorizedPlayerCommand(navalState, { ...cmd, buildingId: 'barracks-1' }, 'player1')).toBe(false);
    expect(isAuthorizedPlayerCommand(navalState, { ...cmd, buildingId: 'town-center-1' }, 'player1')).toBe(false);
    expect(isAuthorizedPlayerCommand(navalState, cmd, 'player2')).toBe(false);
  });

  it('charges the 120 wood + 80 gold + 40 planks warship cost', () => {
    const cmd = { type: 'train', buildingId: 'dock-1', unitType: 'warship' as const };
    const noPlanks = {
      ...navalState,
      playerResources: {
        ...navalState.playerResources,
        player1: { ...navalState.playerResources.player1, planks: 39 },
      },
    };
    expect(isAuthorizedPlayerCommand(noPlanks, cmd, 'player1')).toBe(false);

    const noGold = {
      ...navalState,
      playerResources: {
        ...navalState.playerResources,
        player1: { ...navalState.playerResources.player1, gold: 79 },
      },
    };
    expect(isAuthorizedPlayerCommand(noGold, cmd, 'player1')).toBe(false);
  });

  it('lets warships fight enemy boats and nothing else', () => {
    expect(
      isAuthorizedPlayerCommand(navalState, { type: 'attack', unitId: 'warship-1', targetId: 'trade-2' }, 'player1')
    ).toBe(true);
    expect(
      isAuthorizedPlayerCommand(navalState, { type: 'attack', unitId: 'warship-1', targetId: 'soldier-2' }, 'player1')
    ).toBe(false);
    expect(
      isAuthorizedPlayerCommand(navalState, { type: 'attack', unitId: 'warship-1', targetId: 'town-center-1' }, 'player1')
    ).toBe(false);
    // Tropas de terra podem atirar em barcos da margem
    expect(
      isAuthorizedPlayerCommand(navalState, { type: 'attack', unitId: 'soldier-2', targetId: 'warship-1' }, 'player2')
    ).toBe(true);
  });
});

describe('gathering settings and market commands', () => {
  it('validates gathering settings against the real resources of the world', () => {
    expect(
      isAuthorizedPlayerCommand(state, { type: 'set_resource_mode', resourceId: 'tree-1', mode: 'sustainable' }, 'player1')
    ).toBe(true);
    expect(
      isAuthorizedPlayerCommand(state, { type: 'set_resource_mode', resourceId: 'missing', mode: 'clear_cut' }, 'player1')
    ).toBe(false);
    expect(
      isAuthorizedPlayerCommand(state, { type: 'set_grove_mode', treeIds: ['tree-1'], mode: 'sustainable' }, 'player1')
    ).toBe(true);
    expect(
      isAuthorizedPlayerCommand(state, { type: 'set_grove_mode', treeIds: ['missing'], mode: 'sustainable' }, 'player1')
    ).toBe(false);
    expect(
      isAuthorizedPlayerCommand(state, { type: 'set_colony_forestry', enabled: true }, 'player2')
    ).toBe(true);
    expect(
      isAuthorizedPlayerCommand(state, { type: 'remove_resource', resourceId: 'tree-1' }, 'player1')
    ).toBe(true);
    expect(
      isAuthorizedPlayerCommand(state, { type: 'remove_resource', resourceId: 'missing' }, 'player1')
    ).toBe(false);
  });

  it('validates market trade payloads before they reach the host', () => {
    expect(isValidNetworkCommand({ type: 'trade', resource: 'wood', action: 'buy', amount: 50 })).toBe(true);
    expect(isValidNetworkCommand({ type: 'trade', resource: 'planks', action: 'buy', amount: 50 })).toBe(false);
    expect(isValidNetworkCommand({ type: 'trade', resource: 'wood', action: 'swap', amount: 50 })).toBe(false);
    expect(isValidNetworkCommand({ type: 'trade', resource: 'wood', action: 'buy', amount: 0 })).toBe(false);
    expect(isValidNetworkCommand({ type: 'trade', resource: 'wood', action: 'buy', amount: 2.5 })).toBe(false);
  });

  it('authorizes only trades the player can actually pay for', () => {
    expect(
      isAuthorizedPlayerCommand(state, { type: 'trade', resource: 'wood', action: 'buy', amount: 10 }, 'player1')
    ).toBe(true);
    expect(
      isAuthorizedPlayerCommand(state, { type: 'trade', resource: 'wood', action: 'sell', amount: 10 }, 'player1')
    ).toBe(true);
    expect(
      isAuthorizedPlayerCommand(state, { type: 'trade', resource: 'wood', action: 'buy', amount: 10 }, 'player2')
    ).toBe(false);
    expect(
      isAuthorizedPlayerCommand(state, { type: 'trade', resource: 'wood', action: 'sell', amount: 10 }, 'player2')
    ).toBe(false);
  });

  it('rejects build orders against another player unit', () => {
    expect(
      isAuthorizedPlayerCommand(state, { type: 'build_order', unitId: 'villager-1', targetId: 'town-center-1' }, 'player1')
    ).toBe(true);
    expect(
      isAuthorizedPlayerCommand(state, { type: 'build_order', unitId: 'villager-1', targetId: 'town-center-1' }, 'player2')
    ).toBe(false);
  });
});
