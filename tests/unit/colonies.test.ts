import { describe, expect, it } from 'vitest';
import { BUILDING_CATALOG } from '../../src/game/buildingCatalog';
import { OUTPOST, activeOutposts, healUnitsInTerritory, outpostCovering, outpostSpacingReason } from '../../src/game/colonies';
import { lifePhase } from '../../src/game/foundation';
import { isAuthorizedPlayerCommand } from '../../src/game/networkCommands';
import type { Building, GameState, Unit } from '../../src/game/model';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';
import { updateOwnerVision } from '../../src/game/visionAuthority';

const building = (overrides: Partial<Building> = {}): Building => ({
  id: 'b', type: 'outpost', owner: 'player1', position: { x: 50, z: 50 }, health: 900, maxHealth: 900, isComplete: true, trainingQueue: [], ...overrides,
});
const unit = (overrides: Partial<Unit> = {}): Unit => ({
  id: 'u', type: 'soldier', owner: 'player1', position: { x: 50, z: 55 }, targetPosition: null, targetEntityId: null,
  health: 50, maxHealth: 100, attackDamage: 5, state: 'idle', ...overrides,
});
const resources = { wood: 500, food: 0, gold: 0, stone: 200, planks: 0, pop: 1, maxPop: 10 };
const ctx = (overrides: Partial<SimulationContext> = {}): SimulationContext => ({
  playerSlot: 'player1', mode: 'host', activeSlots: ['player1', 'player2'], gatherRadiusLimit: 14, sustainableForestryEnabled: false,
  buildingDefinitions: {}, random: () => 0.9, createId: () => 'id', ...overrides,
});

describe('dados do posto avançado', () => {
  it('150 madeira e 50 pedra, 20 s, 900 HP e raio 18 (dados revisados) no catálogo e em OUTPOST', () => {
    expect(BUILDING_CATALOG.outpost).toMatchObject({ cost: { wood: 150, stone: 50 }, buildTimeSeconds: 20, maxHealth: 900 });
    expect(OUTPOST).toMatchObject({ cost: { wood: 150, stone: 50 }, buildSeconds: 20, maxHealth: 900, radius: 18, minSpacing: 24 });
  });
});

describe('espaçamento e múltiplos postos', () => {
  it('permite vários postos regionais, inclusive na natal, a partir de 24 de distância', () => {
    const capital = building({ id: 'c', type: 'town_center', position: { x: 10, z: 10 } });
    expect(outpostSpacingReason({ x: 10 + 23, z: 10 }, 'player1', [capital])).not.toBeNull();
    expect(outpostSpacingReason({ x: 10 + 24, z: 10 }, 'player1', [capital])).toBeNull();
    const first = building({ id: 'o1', position: { x: 34, z: 10 } });
    expect(outpostSpacingReason({ x: 34, z: 33 }, 'player1', [capital, first])).not.toBeNull();
    expect(outpostSpacingReason({ x: 34, z: 34 }, 'player1', [capital, first])).toBeNull();
  });

  it('postos de outro jogador não contam para o espaçamento', () => {
    expect(outpostSpacingReason({ x: 50, z: 50 }, 'player1', [building({ owner: 'player2' })])).toBeNull();
  });

  it('posto em obras não dá território nem cura', () => {
    const buildings = [building({ isComplete: false, health: 90 })];
    expect(activeOutposts(buildings)).toHaveLength(0);
    expect(outpostCovering({ x: 50, z: 52 }, 'player1', buildings)).toBeNull();
    expect(healUnitsInTerritory([unit()], buildings)).toEqual([unit()]);
  });
});

describe('cura terrestre', () => {
  it('cura 2 HP por segundo (0,1 por tick) dentro do raio, sem passar de maxHealth', () => {
    let units: readonly Unit[] = [unit()];
    for (let tick = 0; tick < 20; tick += 1) units = healUnitsInTerritory(units, [building()]);
    expect(units[0].health).toBeCloseTo(52, 5);
    const nearlyFull = healUnitsInTerritory([unit({ health: 99.95 })], [building()]);
    expect(nearlyFull[0].health).toBe(100);
  });

  it('dois postos cobrindo a mesma unidade não somam', () => {
    const buildings = [building({ id: 'o1', position: { x: 50, z: 50 } }), building({ id: 'o2', position: { x: 50, z: 60 } })];
    expect(healUnitsInTerritory([unit()], buildings)[0].health).toBeCloseTo(50.1, 5);
  });

  it('não cura fora do raio, unidade alheia, barco nem unidade morta (não revive)', () => {
    const outside = unit({ id: 'far', position: { x: 50 + OUTPOST.radius + 1, z: 50 } });
    const foreign = unit({ id: 'foe', owner: 'player2' });
    const boat = unit({ id: 'boat', type: 'fishing_boat' });
    const dead = unit({ id: 'dead', health: 0 });
    const result = healUnitsInTerritory([outside, foreign, boat, dead], [building()]);
    expect(result.map((candidate) => candidate.health)).toEqual([50, 50, 50, 0]);
  });

  it('a simulação cura enquanto o posto vive e para quando ele é destruído', () => {
    const state: GameState = { units: [unit()], buildings: [building()], resourceNodes: [], playerResources: { player1: resources, player2: resources } };
    const healed = tickGameState(state, ctx()).state;
    expect(healed.units[0].health).toBeGreaterThan(50);
    const destroyed = tickGameState({ ...state, buildings: [building({ health: 0 })] }, ctx()).state;
    expect(destroyed.units[0].health).toBe(50);
  });
});

describe('sem vida extra', () => {
  it('posto não impede a eliminação de quem perdeu carroça e capital', () => {
    expect(lifePhase('player1', [building()], [])).toBe('eliminated');
  });
});

describe('autorização de fundar posto', () => {
  const state: GameState = {
    mapSize: 192,
    units: [unit({ id: 'v', type: 'villager', position: { x: 50, z: 70 } })],
    buildings: [building({ id: 'c', type: 'town_center', position: { x: 50, z: 50 } })],
    resourceNodes: [], playerResources: { player1: resources, player2: resources },
  };
  const vision = updateOwnerVision(undefined, state, ['player1', 'player2'], 192);
  const command = (x: number, z: number) => ({ type: 'build' as const, buildingType: 'outpost' as const, owner: 'player1' as const, position: { x, z }, builderIds: ['v'] });
  const stand = { canStandAt: (_body: string, x: number) => x < 150 };

  it('aceita solo conhecido e transitável a 24 ou mais da capital e recusa perto demais', () => {
    expect(isAuthorizedPlayerCommand(state, command(50, 50 + 24), 'player1', vision, stand as never)).toBe(true);
    expect(isAuthorizedPlayerCommand(state, command(50, 50 + 10), 'player1', vision, stand as never)).toBe(false);
  });

  it('recusa solo intransitável, sem material ou em solo não explorado', () => {
    expect(isAuthorizedPlayerCommand(state, command(160, 50), 'player1', vision, { canStandAt: () => false } as never)).toBe(false);
    const poor = { ...state, playerResources: { ...state.playerResources, player1: { ...resources, stone: 10 } } };
    expect(isAuthorizedPlayerCommand(poor, command(50, 74), 'player1', vision, stand as never)).toBe(false);
    expect(isAuthorizedPlayerCommand(state, command(180, 180), 'player1', vision, stand as never)).toBe(false);
  });
});
