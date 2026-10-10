import { describe, expect, it } from 'vitest';
import { newMastery, creditAll } from '../../src/game/mastery';
import type { GameState, Unit } from '../../src/game/model';
import { BLESSING, RELIC_REACH, RESTORE_COST, SEASON_SECONDS, applyRelicAction, blessingMultiplier, checkRelicAction, generateRelics, runeSources, seasonFarmFactor, seasonOf, tickBuffs } from '../../src/game/mysticism';
import { isAuthorizedPlayerCommand } from '../../src/game/networkCommands';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';
import { isVisibleTo, updateOwnerVision } from '../../src/game/visionAuthority';

const islands = [0, 1, 2, 3, 4, 5].map((index) => ({ index, center: { x: 50 + index * 60, z: 50 }, baseRadius: 20 }));
const villager = (x: number, z: number, owner = 'player1'): Unit => ({ id: `v-${owner}`, type: 'villager', owner, position: { x, z }, targetPosition: null, targetEntityId: null, health: 100, maxHealth: 100, attackDamage: 0, state: 'idle' });
const res = { wood: 100, food: 0, gold: 0, stone: 100, planks: 0, pop: 1, maxPop: 9 };
const relics = generateRelics(islands);
const plant = relics.find((r) => r.id === 'plant-0')!;
const monument = relics.find((r) => r.id === 'monument-0')!;
const world = (units: Unit[]): GameState => ({ units, buildings: [], resourceNodes: [], mapSize: 400, relics, playerResources: { player1: res, player2: res } });

describe('geração', () => {
  it('uma planta e um monumento em ruínas por ilha, natais e neutras, de forma determinística', () => {
    expect(relics).toHaveLength(12);
    expect(relics.filter((r) => r.kind === 'plant').every((r) => r.state === 'available')).toBe(true);
    expect(relics.filter((r) => r.kind === 'monument').every((r) => r.state === 'ruined')).toBe(true);
    expect(new Set(relics.map((r) => r.island))).toEqual(new Set([0, 1, 2, 3, 4, 5]));
    expect(generateRelics(islands)).toEqual(relics);
  });
});

describe('colher e restaurar, validados no host', () => {
  const near = (r: { position: { x: number; z: number } }) => villager(r.position.x + 1, r.position.z);

  it('valida entidade, estado, aldeão, alcance, custo e conhecimento', () => {
    expect(checkRelicAction(world([near(plant)]), 'player1', 'harvest', 'v-player1', 'nada')).toMatchObject({ refusal: 'unknown' });
    expect(checkRelicAction(world([near(plant)]), 'player1', 'restore', 'v-player1', plant.id)).toMatchObject({ refusal: 'state' });
    expect(checkRelicAction(world([near(plant)]), 'player2', 'harvest', 'v-player1', plant.id)).toMatchObject({ refusal: 'unit' }); // aldeão alheio
    expect(checkRelicAction(world([villager(plant.position.x + RELIC_REACH + 1, plant.position.z)]), 'player1', 'harvest', 'v-player1', plant.id)).toMatchObject({ refusal: 'reach' });
    expect(checkRelicAction(world([near(plant)]), 'player1', 'harvest', 'v-player1', plant.id, () => false)).toMatchObject({ refusal: 'known' });
    const poor = { ...world([near(monument)]), playerResources: { player1: { ...res, stone: 0 }, player2: res } };
    expect(checkRelicAction(poor, 'player1', 'restore', 'v-player1', monument.id)).toMatchObject({ refusal: 'cost' });
    expect(checkRelicAction(world([near(plant)]), 'player1', 'harvest', 'v-player1', plant.id).ok).toBe(true);
  });

  it('colher dá a bênção uma única vez; repetir ou colher de novo não cria efeito nem XP extra', () => {
    const state = world([near(plant)]);
    const first = applyRelicAction(state, 'player1', 'harvest', 'v-player1', plant.id);
    expect(first.check.ok).toBe(true);
    expect(first.xp).toEqual({ kind: 'plant', key: plant.id });
    expect(first.state.buffs?.player1?.blessing).toBe(BLESSING.seconds);
    expect(first.state.relics!.find((r) => r.id === plant.id)).toMatchObject({ state: 'harvested', owner: 'player1' });
    const second = applyRelicAction(first.state, 'player1', 'harvest', 'v-player1', plant.id);
    expect(second.check.refusal).toBe('state');
    expect(second.state).toBe(first.state);
    expect(second.xp).toBeUndefined();
    let mastery = creditAll(undefined, [{ owner: 'player1', event: first.xp! }]);
    mastery = creditAll(mastery, [{ owner: 'player1', event: first.xp! }]);
    expect(mastery!.player1.xp.exploration).toBe(25); // 25 uma vez só
  });

  it('restaurar cobra o custo uma vez, vira runa com visão 14 e não repete', () => {
    const state = world([near(monument)]);
    const done = applyRelicAction(state, 'player1', 'restore', 'v-player1', monument.id);
    expect(done.state.playerResources.player1).toMatchObject({ wood: res.wood - RESTORE_COST.wood, stone: res.stone - RESTORE_COST.stone });
    expect(done.state.relics!.find((r) => r.id === monument.id)).toMatchObject({ state: 'restored', owner: 'player1' });
    expect(applyRelicAction(done.state, 'player1', 'restore', 'v-player1', monument.id).state).toBe(done.state);
    expect(runeSources(done.state.relics, 'player1')).toEqual([{ x: monument.position.x, z: monument.position.z, radius: 14 }]);
    expect(runeSources(done.state.relics, 'player2')).toEqual([]);
    const vision = updateOwnerVision(undefined, { ...done.state, units: [] }, ['player1', 'player2'], 400);
    expect(isVisibleTo(vision, 'player1', monument.position.x + 12, monument.position.z)).toBe(true);
    expect(isVisibleTo(vision, 'player2', monument.position.x + 12, monument.position.z)).toBe(false);
  });

  it('alvo oculto não é aceito pelo host e a recusa não altera o estado', () => {
    const state = world([near(plant)]);
    const hidden = updateOwnerVision(undefined, { ...state, units: [] }, ['player1'], 400); // nada explorado
    expect(isAuthorizedPlayerCommand(state, { type: 'harvest_plant', unitId: 'v-player1', relicId: plant.id }, 'player1', hidden)).toBe(false);
    const seen = updateOwnerVision(undefined, state, ['player1'], 400);
    expect(isAuthorizedPlayerCommand(state, { type: 'harvest_plant', unitId: 'v-player1', relicId: plant.id }, 'player1', seen)).toBe(true);
    expect(applyRelicAction(state, 'player1', 'harvest', 'v-player1', plant.id, () => false).state).toBe(state);
  });
});

describe('efeitos limitados e estações', () => {
  const ctx = (): SimulationContext => ({ playerSlot: 'player1', mode: 'host', activeSlots: ['player1'], gatherRadiusLimit: 14, sustainableForestryEnabled: false, buildingDefinitions: {}, random: () => 0.9, createId: () => 'id' });

  it('a bênção acelera a coleta e acaba sozinha, sem acumular', () => {
    expect(blessingMultiplier({ player1: { blessing: 10 } }, 'player1')).toBeCloseTo(1.2);
    expect(blessingMultiplier({ player1: { blessing: 10 } }, 'player2')).toBe(1);
    expect(tickBuffs({ player1: { blessing: 0.04 } }, 0.05)).toBeUndefined();
    const gather = (buffs?: GameState['buffs']) => {
      const unit: Unit = { ...villager(10, 10), state: 'gathering', targetEntityId: 'n' };
      const state: GameState = { ...world([unit]), buffs, resourceNodes: [{ id: 'n', type: 'tree', position: { x: 10.5, z: 10 }, remaining: 100 }] };
      return tickGameState(state, ctx()).state.playerResources.player1.wood - res.wood;
    };
    expect(gather({ player1: { blessing: 30 } }) / gather()).toBeCloseTo(1.2, 3);
  });

  it('estações de 180 s alternam e não inviabilizam a fazenda', () => {
    expect([seasonOf(0), seasonOf(SEASON_SECONDS - 1), seasonOf(SEASON_SECONDS), seasonOf(2 * SEASON_SECONDS)]).toEqual(['wet', 'wet', 'dry', 'wet']);
    expect(seasonFarmFactor('wet')).toBeGreaterThan(1);
    expect(seasonFarmFactor('dry')).toBeGreaterThanOrEqual(0.9);
    const farm = { id: 'f', type: 'farm' as const, owner: 'player1', position: { x: 5, z: 5 }, health: 400, maxHealth: 400, isComplete: true, trainingQueue: [] };
    const food = (elapsed: number) => tickGameState({ ...world([]), buildings: [farm], elapsed }, ctx()).state.playerResources.player1.food;
    expect(food(SEASON_SECONDS + 1)).toBeGreaterThan(0);
    expect(food(0)).toBeGreaterThan(food(SEASON_SECONDS + 1));
  });

  it('o relógio da partida avança por tick', () => {
    const s = tickGameState({ ...world([]), elapsed: 0 }, ctx()).state;
    expect(s.elapsed).toBeCloseTo(0.05, 5);
  });

  it('a mastery vazia continua intacta sem eventos', () => {
    expect(newMastery().points).toBe(0);
  });
});
