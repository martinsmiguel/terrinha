import { describe, expect, it } from 'vitest';
import { BRIDGE, bridgeFoundation, bridgeVersion, checkBridge, completedBridges, onDeck, relocateFromDestroyed, withBridges, type BridgeTerrain } from '../../src/game/bridges';
import type { Building, GameState, Unit } from '../../src/game/model';
import { isAuthorizedPlayerCommand } from '../../src/game/networkCommands';
import { findPath } from '../../src/game/movement/pathfinding';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';

/** Rio vertical em x entre 20 e 28 (largura 8); oceano a x >= 60; ilha única (localidade 'home'). */
const river = (x: number) => x > 20 && x < 28;
const terrain: BridgeTerrain & { isImpassableAt(x: number, z: number): boolean; isOceanAt(x: number, z: number): boolean; isWaterAt(x: number, z: number): boolean } = {
  canStandAt: (_b, x, z) => x > 1 && x < 59 && z > 1 && z < 59 && !river(x),
  surfaceAt: (x) => (river(x) ? { water: 'river', depth: 1.2, cliff: false } : { water: 'none', depth: 0, cliff: false }),
  isOceanAt: (x) => x >= 60,
  isWaterAt: (x) => river(x) || x >= 60,
  isImpassableAt: (x, z) => !(x > 1 && x < 59 && z > 1 && z < 59 && !river(x)),
  getHeightAt: () => 0.4,
  localityOf: (_o, p) => (p.x < 60 ? 'home' : 'other'),
};
const res = { wood: 500, food: 0, gold: 0, stone: 500, planks: 100, pop: 2, maxPop: 20 };
const villager = (id = 'v1', owner = 'player1'): Unit => ({ id, type: 'villager', owner, position: { x: 10, z: 30 }, targetPosition: null, targetEntityId: null, health: 100, maxHealth: 100, attackDamage: 0, state: 'idle' });
const world = (buildings: Building[] = [], units: Unit[] = [villager()]): GameState => ({ units, buildings, resourceNodes: [], mapSize: 100, playerResources: { player1: res } });
const span = { a: { x: 19, z: 30 }, b: { x: 29, z: 30 } };
const done = (health = 800): Building => ({ ...bridgeFoundation('br', 'player1', span), isComplete: true, health, buildProgress: 100 });

describe('validação da ponte', () => {
  it('aceita duas margens da mesma ilha com vão de água doce até 12', () => {
    expect(checkBridge(world(), 'player1', span, ['v1'], terrain).ok).toBe(true);
  });

  it('recusa vão longo, pontas na água, oceano, outra ilha, sem água, declive, posse, material e sobreposição', () => {
    const c = (s: typeof span, state = world(), builders = ['v1'], t: BridgeTerrain = terrain) => checkBridge(state, 'player1', s, builders, t);
    expect(c({ a: { x: 15, z: 30 }, b: { x: 33, z: 30 } })).toMatchObject({ refusal: 'span' });
    expect(c({ a: { x: 24, z: 30 }, b: { x: 29, z: 30 } })).toMatchObject({ refusal: 'ends' });
    expect(c({ a: { x: 54, z: 30 }, b: { x: 62, z: 30 } })).toMatchObject({ refusal: 'ends' });
    // Mar entre duas pontas pisáveis da mesma localidade: nunca há ponte sobre o oceano.
    const sea = { ...terrain, localityOf: () => 'home', canStandAt: (_b: 'human', x: number) => x < 58 || (x > 64 && x < 70) };
    expect(c({ a: { x: 57, z: 30 }, b: { x: 66, z: 30 } }, world(), ['v1'], sea as BridgeTerrain)).toMatchObject({ refusal: 'ocean' });
    const split = { ...terrain, localityOf: (_o: string, p: { x: number; z: number }) => (p.x < 24 ? 'a' : 'b') };
    expect(c(span, world(), ['v1'], split)).toMatchObject({ refusal: 'island' });
    expect(c({ a: { x: 5, z: 30 }, b: { x: 12, z: 30 } })).toMatchObject({ refusal: 'water' });
    expect(c(span, world(), ['v1'], { ...terrain, getHeightAt: (x: number) => (x < 24 ? 0 : 2) })).toMatchObject({ refusal: 'slope' });
    expect(c(span, world([], [villager('v1', 'player2')]))).toMatchObject({ refusal: 'unit' });
    expect(c(span, world(), [])).toMatchObject({ refusal: 'unit' });
    expect(c(span, { ...world(), playerResources: { player1: { ...res, planks: 5 } } })).toMatchObject({ refusal: 'cost' });
    const house: Building = { id: 'h', type: 'house', owner: 'player1', position: { x: 24, z: 30 }, health: 450, maxHealth: 450, isComplete: true, trainingQueue: [] };
    expect(c(span, world([house]))).toMatchObject({ refusal: 'overlap' });
  });

  it('defaults: 150 madeira, 50 pedra, 20 tábuas, 20 s, 800 HP, largura 2,5, vão 12', () => {
    expect(BRIDGE).toMatchObject({ cost: { wood: 150, stone: 50, planks: 20 }, buildSeconds: 20, maxHealth: 800, width: 2.5, maxSpan: 12, deckAboveWater: 0.5 });
  });

  it('o host autoriza só ponte válida e nunca uma ponte pelo comando de construção comum', () => {
    const cmd = { type: 'build_bridge', a: span.a, b: span.b, builderIds: ['v1'] };
    expect(isAuthorizedPlayerCommand(world(), cmd, 'player1', undefined, terrain)).toBe(true);
    expect(isAuthorizedPlayerCommand(world(), { ...cmd, b: { x: 60, z: 30 } }, 'player1', undefined, terrain)).toBe(false);
    expect(isAuthorizedPlayerCommand(world(), { type: 'build', buildingType: 'bridge', owner: 'player1', position: { x: 24, z: 30 } }, 'player1', undefined, terrain)).toBe(false);
  });
});

describe('só concluída abre passagem', () => {
  const blockedFor = (t: typeof terrain) => (x: number, z: number) => !t.canStandAt('human', x, z);

  it('em obras não abre deck; concluída abre para corpos terrestres, e nunca para barcos', () => {
    const building = { ...done(), isComplete: false };
    expect(completedBridges([building])).toHaveLength(0);
    expect(withBridges(terrain, [building])).toBe(terrain);
    const open = withBridges(terrain, [done()]);
    expect(open.canStandAt('human', 24, 30)).toBe(true);
    expect(open.canStandAt('mount', 24, 30)).toBe(true);
    expect(open.canStandAt('human', 24, 40)).toBe(false); // fora do deck
    expect(open.surfaceAt(24, 30)).toEqual({ water: 'none', depth: 0, cliff: false });
    expect(open.isOceanAt(24, 30)).toBe(false);
    expect(onDeck({ x: 24, z: 31.2 }, [done()])).toBe(true);
    expect(onDeck({ x: 24, z: 31.4 }, [done()])).toBe(false); // largura 2,5 (±1,25)
  });

  it('o A* só cruza o rio com a ponte concluída; sem ela, dá a volta ou fica sem rota', () => {
    const from = { x: 10.5, z: 30.5 }; const to = { x: 40.5, z: 30.5 };
    expect(findPath(from, to, blockedFor(terrain), { mapSize: 100 })).toEqual([]); // rio de ponta a ponta no cenário
    const bridged = withBridges(terrain, [done()]);
    const path = findPath(from, to, blockedFor(bridged), { mapSize: 100 });
    expect(path.length).toBeGreaterThan(0);
    expect(path.some((p) => river(p.x))).toBe(true); // atravessa o rio pelo deck
  });
});

describe('destruição', () => {
  const ctx = (): SimulationContext => ({
    playerSlot: 'player1', mode: 'host', activeSlots: ['player1'], gatherRadiusLimit: 14, sustainableForestryEnabled: false, buildingDefinitions: {},
    random: () => 0.9, createId: () => 'id', pathCache: new Map(),
    map: { isWaterAt: terrain.isWaterAt, isImpassableAt: terrain.isImpassableAt, isOceanAt: terrain.isOceanAt, canStandAt: terrain.canStandAt, surfaceAt: terrain.surfaceAt } as never,
  });

  it('a versão muda com o conjunto de pontes: invalida rota em cache e campos de fluxo', () => {
    expect(bridgeVersion([])).toBe(0);
    expect(bridgeVersion([done()])).not.toBe(0);
    expect(bridgeVersion([done(0)])).toBe(0); // destruída
  });

  it('quem estava no deck volta à margem mais próxima do próprio lado, uma vez, sem saltar de margem', () => {
    const onBridge = { ...villager('a'), position: { x: 22, z: 30 } };
    const other = { ...villager('b'), position: { x: 26, z: 30 } };
    const away = { ...villager('c'), position: { x: 10, z: 10 } };
    const { units, moved } = relocateFromDestroyed([onBridge, other, away], [done()]);
    expect(moved).toBe(2);
    expect(units[0].position).toEqual(span.a); // lado oeste
    expect(units[1].position).toEqual(span.b); // lado leste
    expect(units[2].position).toEqual({ x: 10, z: 10 });
  });

  it('no tick: ponte concluída deixa passar; ao ser destruída em combate, os ocupantes voltam e o aviso sai uma vez', () => {
    const walker = { ...villager('w'), position: { x: 23, z: 30 }, state: 'moving' as const, targetPosition: { x: 40, z: 30 } };
    const stepped = tickGameState(world([done()], [walker]), ctx()).state.units[0];
    expect(stepped.position.x).toBeGreaterThan(23); // anda pelo deck
    const attacker: Unit = { ...villager('foe', 'player2'), type: 'soldier', position: { x: 24, z: 31 }, attackDamage: 24, state: 'attacking', targetEntityId: 'br' };
    const fragile = { ...done(5) };
    const result = tickGameState({ ...world([fragile], [{ ...walker, state: 'idle' as const, targetPosition: null, position: { x: 26, z: 30 } }, attacker]), playerResources: { player1: res, player2: res } }, { ...ctx(), activeSlots: ['player1', 'player2'] });
    const back = result.state.units.find((u) => u.id === 'w')!;
    expect(back.position).toEqual(span.b); // estava mais perto da margem leste
    expect(result.effects.filter((e) => e.type === 'notification' && /Ponte destruída/.test(e.message))).toHaveLength(1);
  });
});
