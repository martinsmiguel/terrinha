import { describe, expect, it } from 'vitest';
import { HOME, stockAt, type LocalityResolver } from '../../src/game/depots';
import { itemsWithTag } from '../../src/game/items';
import { newMastery, type MasteryId } from '../../src/game/mastery';
import type { Building, GameState, PlayerResources, Unit } from '../../src/game/model';
import { isAuthorizedPlayerCommand, isValidNetworkCommand } from '../../src/game/networkCommands';
import {
  STONE_TOOL_GATHER_BONUS, activeRecipe, canSetRecipe, describeRecipe, recipeLock, runStations, setRecipe,
} from '../../src/game/production';
import { RECIPE_DEFS, charcoalFromFirewood, firewoodFromWood, stoneToolFromHandle, toolHandleFromWood } from '../../src/game/recipes';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';
import { createTechState, type Era } from '../../src/game/tech';

const res: PlayerResources = { wood: 1000, food: 1000, gold: 1000, stone: 1000, planks: 0, pop: 1, maxPop: 10 };
const station = (type: Building['type'], recipeId?: string, overrides: Partial<Building> = {}): Building => ({
  id: `${type}-${recipeId ?? 'padrão'}`, type, owner: 'player1', position: { x: 20, z: 20 }, health: 800, maxHealth: 800, isComplete: true,
  trainingQueue: [], ...(recipeId ? { recipeId } : {}), ...overrides,
});
const owner = (era: Era = 'pedra', crafts: Partial<Record<MasteryId, number>> = {}) => ({
  techs: { player1: { ...createTechState(), era } },
  mastery: { player1: { ...newMastery(), level: { ...newMastery().level, ...crafts } } },
});
const steps = (bag: PlayerResources, stations: Building[], state: ReturnType<typeof owner>, n: number) => {
  let next = bag;
  for (let i = 0; i < n; i += 1) next = runStations(next, stations, 'player1', state).bag;
  return next;
};

describe('cadeia piloto da madeira (#178)', () => {
  it('lenha e carvão são combustíveis; cabo e ferramenta da Pedra; carvão do Bronze', () => {
    expect(itemsWithTag('combustível').map((item) => item.id).sort()).toEqual(['charcoal', 'firewood']);
    expect(itemsWithTag('ferramenta').map((item) => item.id)).toEqual(['stone_tool']);
    expect(RECIPE_DEFS.map((recipe) => recipe.id)).toEqual(['planks-from-wood', 'firewood-from-wood', 'tool-handle-from-wood', 'charcoal-from-firewood', 'stone-tool']);
    expect(describeRecipe(toolHandleFromWood)).toBe('10 Madeira → 2 Cabo de ferramenta / 5 s');
  });

  it('a serralheria faz tábuas por padrão; o Centro só produz depois de escolhida a receita', () => {
    expect(activeRecipe(station('sawmill'))?.id).toBe('planks-from-wood');
    expect(activeRecipe(station('town_center'))).toBeUndefined();
    expect(activeRecipe(station('town_center', 'stone-tool'))?.id).toBe('stone-tool');
    expect(activeRecipe(station('sawmill', 'stone-tool'))).toBeUndefined(); // receita de outra estação: parada
  });

  it('madeira → lenha → carvão, e madeira → cabo → ferramenta de pedra, nas construções do ofício', () => {
    const bronze = owner('bronze', { carpintaria: 2 });
    const firewood = steps(res, [station('sawmill', firewoodFromWood.id)], bronze, 100);
    expect(firewood.firewood).toBeCloseTo(10);
    expect(firewood.wood).toBeCloseTo(990);
    const charcoal = steps(firewood, [station('sawmill', charcoalFromFirewood.id)], bronze, 100);
    expect(charcoal.charcoal).toBeCloseTo(5);
    expect(charcoal.firewood).toBeCloseTo(0);

    const handles = steps(res, [station('sawmill', toolHandleFromWood.id)], bronze, 100);
    expect(handles.tool_handle).toBeCloseTo(2);
    const tools = steps(handles, [station('town_center', stoneToolFromHandle.id)], bronze, 100);
    expect(tools.stone_tool).toBeCloseTo(1);
    expect(tools.tool_handle).toBeCloseTo(1);
    expect(tools.stone).toBeCloseTo(995);
  });

  it('a produção treina o ofício da receita', () => {
    const run = runStations(res, [station('town_center', stoneToolFromHandle.id)], 'player1', owner());
    expect(run.produced).toEqual([]); // sem cabo, nada
    const made = runStations({ ...res, tool_handle: 1 }, [station('town_center', stoneToolFromHandle.id)], 'player1', owner());
    expect(made.produced).toEqual([{ craft: 'cantaria', recipe: 'stone-tool', item: 'stone_tool', amount: expect.closeTo(0.01) }]);
  });

  it('CONTROLE NEGATIVO: carvão na Pedra, cabo com Carpintaria 1 e receita de outra estação não produzem nem são aceitos', () => {
    expect(recipeLock(owner('pedra', { carpintaria: 2 }), 'player1', charcoalFromFirewood)).toBe('Era do Bronze');
    expect(recipeLock(owner(), 'player1', toolHandleFromWood)).toBe('Carpintaria 1/2');
    const blocked = steps({ ...res, firewood: 10 }, [station('sawmill', charcoalFromFirewood.id)], owner('pedra', { carpintaria: 2 }), 50);
    expect(blocked.charcoal ?? 0).toBe(0);
    expect(blocked.firewood).toBe(10);

    const state: GameState = { units: [], buildings: [station('sawmill'), station('house')], resourceNodes: [], playerResources: { player1: res }, ...owner() };
    expect(canSetRecipe(state, 'player1', 'sawmill-padrão', 'firewood-from-wood').ok).toBe(true);
    expect(canSetRecipe(state, 'player1', 'sawmill-padrão', 'tool-handle-from-wood')).toEqual({ ok: false, reason: 'Receita bloqueada: falta Carpintaria 1/2.' });
    expect(canSetRecipe(state, 'player1', 'sawmill-padrão', 'stone-tool').ok).toBe(false);
    expect(canSetRecipe(state, 'player1', 'house-padrão', 'firewood-from-wood').ok).toBe(false);
    expect(canSetRecipe(state, 'player2', 'sawmill-padrão', 'firewood-from-wood').ok).toBe(false); // construção alheia
    expect(setRecipe(state, 'player1', 'sawmill-padrão', 'tool-handle-from-wood')).toBe(state);

    const cmd = { type: 'set_recipe', buildingId: 'sawmill-padrão', recipeId: 'firewood-from-wood' };
    expect(isValidNetworkCommand(cmd)).toBe(true);
    expect(isValidNetworkCommand({ ...cmd, extra: 1 })).toBe(false);
    expect(isAuthorizedPlayerCommand(state, cmd, 'player1')).toBe(true);
    expect(isAuthorizedPlayerCommand(state, { ...cmd, recipeId: 'charcoal-from-firewood' }, 'player1')).toBe(false);
  });
});

describe('produção na simulação', () => {
  const localityOf: LocalityResolver = (_owner, position) => (position.x < 100 ? HOME : '1');
  const ctx: SimulationContext = {
    playerSlot: 'player1', mode: 'host', activeSlots: ['player1'], gatherRadiusLimit: 999, sustainableForestryEnabled: false,
    buildingDefinitions: {}, random: () => 0.5, createId: () => 'id',
    map: { isWaterAt: () => false, isImpassableAt: () => false, isOceanAt: () => false, localityOf },
  };
  const run = (state: GameState, n: number) => { let s = state; for (let i = 0; i < n; i += 1) s = tickGameState(s, ctx).state; return s; };

  it('cada ilha produz com o próprio estoque: lenha na metrópole, lenha na colônia, sem misturar', () => {
    const home = station('sawmill', 'firewood-from-wood');
    const colony = station('sawmill', 'firewood-from-wood', { id: 'colonial', position: { x: 150, z: 20 } });
    const post = station('outpost', undefined, { id: 'post', position: { x: 160, z: 20 } });
    const state: GameState = {
      units: [], buildings: [home, colony, post], resourceNodes: [], mapSize: 192,
      playerResources: { player1: { ...res } }, localStocks: { player1: { '1': { wood: 5, food: 0, gold: 0, stone: 0, planks: 0 } } }, ...owner(),
    };
    const after = run(state, 100);
    expect(after.playerResources.player1.firewood).toBeCloseTo(10);
    expect(stockAt(after, 'player1', '1').firewood).toBeCloseTo(5); // só tinha 5 de madeira na ilha
    expect(stockAt(after, 'player1', '1').wood).toBeCloseTo(0);
    expect(after.playerResources.player1.wood).toBeCloseTo(990);
  });

  it('ferramenta de pedra: o aldeão coleta 20% mais e a ferramenta se gasta', () => {
    const tree = { id: 't', type: 'tree' as const, position: { x: 10, z: 10 }, remaining: 5000 };
    const villager: Unit = {
      id: 'v', type: 'villager', owner: 'player1', position: { x: 10, z: 10 }, targetPosition: null, targetEntityId: 't', health: 100, maxHealth: 100,
      attackDamage: 3, state: 'gathering', gatherRadiusLimit: 999,
    };
    const world = (stone_tool: number): GameState => ({
      units: [villager], buildings: [], resourceNodes: [tree], mapSize: 192, playerResources: { player1: { ...res, stone_tool } }, ...owner(),
    });
    const without = run(world(0), 40).playerResources.player1;
    const withTool = run(world(2), 40).playerResources.player1;
    const gainedWithout = without.wood - res.wood;
    const gainedWith = withTool.wood - res.wood;
    expect(gainedWithout).toBeGreaterThan(0);
    expect(gainedWith / gainedWithout).toBeCloseTo(STONE_TOOL_GATHER_BONUS, 1);
    expect(withTool.stone_tool).toBeLessThan(2);
    expect(withTool.stone_tool).toBeGreaterThan(1.9);
  });
});
