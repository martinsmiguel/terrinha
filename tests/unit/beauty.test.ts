import { describe, expect, it } from 'vitest';
import { BEAUTY_CAP, beautyAt, beautyMultiplier, beautySources, beautySummary } from '../../src/game/beauty';
import { placeDecoration } from '../../src/game/decor';
import type { Building, GameState } from '../../src/game/model';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';
import { createTechState } from '../../src/game/tech';

const res = { wood: 500, food: 500, gold: 500, stone: 500, planks: 0, pop: 1, maxPop: 10 };
const building = (type: Building['type'], x: number, z: number, owner = 'player1'): Building => ({ id: `${type}-${x}-${z}`, type, owner, position: { x, z }, health: 500, maxHealth: 500, isComplete: true, trainingQueue: [] });
const world = (extra: Partial<GameState> = {}): GameState => ({
  units: [], buildings: [building('town_center', 10, 10)], resourceNodes: [], mapSize: 100,
  playerResources: { player1: { ...res }, player2: { ...res } }, techs: { player1: { ...createTechState(), era: 'ferro' }, player2: createTechState() }, ...extra,
});
const ctx: SimulationContext = { playerSlot: 'player1', mode: 'host', activeSlots: ['player1'], gatherRadiusLimit: 999, sustainableForestryEnabled: false, buildingDefinitions: {}, random: () => 0.5, createId: () => 'id' };

describe('beleza e contentamento (#206)', () => {
  it('enfeite irradia beleza só no raio e só para o dono', () => {
    const state = placeDecoration(world(), 'player1', { type: 'fountain', position: { x: 50, z: 50 }, rotation: 0 }, 'f1');
    expect(beautyAt(state, 'player1', { x: 55, z: 50 })).toBe(4); // fonte: beleza 4, raio 7
    expect(beautyAt(state, 'player1', { x: 58, z: 50 })).toBe(0);
    expect(beautyAt(state, 'player2', { x: 55, z: 50 })).toBe(0);
  });

  it('o bônus cresce 5% por ponto e para em +25%', () => {
    expect(beautyMultiplier(0)).toBe(1);
    expect(beautyMultiplier(2)).toBeCloseTo(1.1);
    expect(beautyMultiplier(100)).toBeCloseTo(1 + BEAUTY_CAP);
  });

  it('fazenda com beleza por perto produz mais; sem enfeite, o mesmo de antes (controle negativo)', () => {
    const farm = building('farm', 40, 40);
    const plain = world({ buildings: [building('town_center', 10, 10), farm] });
    const pretty = placeDecoration(plain, 'player1', { type: 'fountain', position: { x: 44, z: 40 }, rotation: 0 }, 'f1');
    const food = (state: GameState) => tickGameState(state, ctx).state.playerResources.player1.food - state.playerResources.player1.food;
    expect(food(pretty) / food(plain)).toBeCloseTo(1.2, 5); // fonte = 4 pontos → +20%
  });

  it('casas com beleza ≥ 2 por perto ficam contentes', () => {
    const state = placeDecoration(world({ buildings: [building('town_center', 10, 10), building('house', 30, 30), building('house', 80, 80)] }), 'player1', { type: 'flower_bed', position: { x: 33, z: 30 }, rotation: 0 }, 'c1');
    expect(beautySummary(state, 'player1')).toEqual({ total: 2, contentHouses: 1, houses: 2 });
  });
});

describe('plantar árvores (#207)', () => {
  it('plantar cria uma muda do jogador, paga o custo e não é enfeite fixo', () => {
    const state = placeDecoration(world(), 'player1', { type: 'sapling', position: { x: 60, z: 60 }, rotation: 0 }, 't1');
    expect(state.decorations ?? []).toEqual([]);
    expect(state.resourceNodes).toEqual([expect.objectContaining({ id: 't1', type: 'tree', isRegrowing: true, remaining: 0, plantedBy: 'player1' })]);
    expect(state.playerResources.player1.wood).toBe(495);
    expect(beautySources(state, 'player1')).toEqual([]); // muda ainda não embeleza
  });

  it('a muda cresce até árvore cortável e passa a contar como beleza', () => {
    let state = placeDecoration(world(), 'player1', { type: 'sapling', position: { x: 60, z: 60 }, rotation: 0 }, 't1');
    for (let i = 0; i < 400; i += 1) state = tickGameState(state, ctx).state;
    const tree = state.resourceNodes.find((node) => node.id === 't1')!;
    expect(tree).toMatchObject({ isRegrowing: false, remaining: 150 });
    expect(beautyAt(state, 'player1', { x: 62, z: 60 })).toBe(1);
  });

  it('CONTROLE NEGATIVO: não planta em cima de outra árvore nem sem recurso', () => {
    const planted = placeDecoration(world(), 'player1', { type: 'sapling', position: { x: 60, z: 60 }, rotation: 0 }, 't1');
    expect(placeDecoration(planted, 'player1', { type: 'sapling', position: { x: 60, z: 60 }, rotation: 0 }, 't2')).toBe(planted);
    const poor = world({ playerResources: { player1: { ...res, wood: 0 }, player2: res } });
    expect(placeDecoration(poor, 'player1', { type: 'sapling', position: { x: 60, z: 60 }, rotation: 0 }, 't3')).toBe(poor);
  });
});
