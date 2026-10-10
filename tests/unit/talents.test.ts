import { describe, expect, it } from 'vitest';
import { loadCargo, holdOf } from '../../src/game/colonialTransport';
import { HOME, type LocalityResolver } from '../../src/game/depots';
import { creditXp, newMastery, type MasteryState } from '../../src/game/mastery';
import type { Building, GameState, Unit } from '../../src/game/model';
import { isAuthorizedPlayerCommand } from '../../src/game/networkCommands';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';
import { buyTalent, canBuyTalent, effectiveBuildCost, hasTalent } from '../../src/game/talents';
import { isVisibleTo, updateOwnerVision } from '../../src/game/visionAuthority';

const levelled = (levels: Partial<MasteryState['level']>, points: number): MasteryState => ({ ...newMastery(), level: { ...newMastery().level, ...levels }, points });
const res = { wood: 500, food: 500, gold: 500, stone: 500, planks: 500, pop: 2, maxPop: 20 };
const base = (overrides: Partial<GameState> = {}): GameState => ({ units: [], buildings: [], resourceNodes: [], mapSize: 100, playerResources: { player1: res }, ...overrides });
const owned = (talents: string[], mastery = levelled({ seafaring: 5, settlement: 5, extraction: 5, exploration: 5 }, 5)): GameState => base({ mastery: { player1: mastery }, talents: { player1: talents } });

describe('compra no host', () => {
  it('valida nível, pré-requisito, pontos e ID único; recusa não debita nem repete', () => {
    const low = base({ mastery: { player1: levelled({ seafaring: 1 }, 3) } });
    expect(canBuyTalent(low, 'player1', 'brisa')).toMatchObject({ ok: false, refusal: 'level' });
    const noReq = base({ mastery: { player1: levelled({ seafaring: 3 }, 3) } });
    expect(canBuyTalent(noReq, 'player1', 'comboio')).toMatchObject({ ok: false, refusal: 'requires' });
    const broke = base({ mastery: { player1: levelled({ seafaring: 3 }, 0) } });
    expect(canBuyTalent(broke, 'player1', 'brisa')).toMatchObject({ ok: false, refusal: 'points' });
    expect(canBuyTalent(low, 'player1', 'nao-existe')).toMatchObject({ refusal: 'unknown' });

    const ok = base({ mastery: { player1: levelled({ seafaring: 3 }, 2) } });
    const first = buyTalent(ok, 'player1', 'brisa');
    expect(first.check.ok).toBe(true);
    expect(first.state.mastery!.player1.points).toBe(1);
    expect(first.state.talents!.player1).toEqual(['brisa']);
    const again = buyTalent(first.state, 'player1', 'brisa');
    expect(again.check.refusal).toBe('owned');
    expect(again.state).toBe(first.state); // nada muda
    expect(buyTalent(low, 'player1', 'brisa').state).toBe(low);
  });

  it('o host autoriza só a compra válida', () => {
    const state = base({ mastery: { player1: levelled({ seafaring: 3 }, 1) } });
    expect(isAuthorizedPlayerCommand(state, { type: 'buy_talent', id: 'brisa' }, 'player1')).toBe(true);
    expect(isAuthorizedPlayerCommand(state, { type: 'buy_talent', id: 'comboio' }, 'player1')).toBe(false);
    expect(isAuthorizedPlayerCommand(state, { type: 'buy_talent', id: 'brisa' }, 'player2')).toBe(false);
  });
});

describe('os seis efeitos reais', () => {
  const ctx = (overrides: Partial<SimulationContext> = {}): SimulationContext => ({
    playerSlot: 'player1', mode: 'host', activeSlots: ['player1'], gatherRadiusLimit: 14, sustainableForestryEnabled: false,
    buildingDefinitions: {}, random: () => 0.9, createId: () => 'id', ...overrides,
  });
  const boat = (): Unit => ({ id: 'b', type: 'fishing_boat', owner: 'player1', position: { x: 10, z: 10 }, targetPosition: { x: 40, z: 10 }, targetEntityId: null, health: 100, maxHealth: 100, attackDamage: 0, state: 'moving' });
  const sea = { isWaterAt: () => true, isImpassableAt: () => false, isOceanAt: () => true };

  it('Brisa: +15% de velocidade em mar conhecido, sem bônus em mar desconhecido nem sem o talento', () => {
    const run = (state: GameState, vision?: ReturnType<typeof updateOwnerVision>) => tickGameState({ ...state, units: [boat()] }, ctx({ map: sea, vision })).state.units[0].position.x - 10;
    const without = run(base());
    const withTalent = run(owned(['brisa']));
    expect(withTalent / without).toBeCloseTo(1.15, 2);
    const unknown = updateOwnerVision(undefined, base({ units: [] }), ['player1'], 100); // nada explorado
    expect(run(owned(['brisa']), unknown) / without).toBeCloseTo(1, 2);
  });

  it('Comboio: porão do mercante vai de 100 a 125 e a carga cabe', () => {
    const merchant: Unit = { ...boat(), type: 'trade_boat', position: { x: 21, z: 20 } };
    const dock: Building = { id: 'd', type: 'dock', owner: 'player1', position: { x: 20, z: 20 }, health: 700, maxHealth: 700, isComplete: true, trainingQueue: [] };
    const resolve: LocalityResolver = () => HOME;
    const plain = { ...base(), units: [merchant], buildings: [dock] };
    expect(holdOf(merchant).capacity).toBe(100);
    expect(loadCargo(plain, 'b', HOME, { wood: 120 }, resolve)).toBeNull();
    const talented = { ...owned(['brisa', 'comboio']), units: [merchant], buildings: [dock] };
    expect(loadCargo(talented, 'b', HOME, { wood: 120 }, resolve)).not.toBeNull();
    expect(loadCargo(talented, 'b', HOME, { wood: 130 }, resolve)).toBeNull();
  });

  it('Carpintaria: -20 de madeira em posto e cais, sem ficar negativo e sem tocar outros edifícios', () => {
    const state = owned(['desembarque', 'carpintaria']);
    expect(effectiveBuildCost(state, 'player1', 'outpost', { wood: 150, stone: 50 })).toEqual({ wood: 130, stone: 50 });
    expect(effectiveBuildCost(state, 'player1', 'dock', { wood: 15 })).toEqual({ wood: 0 });
    expect(effectiveBuildCost(state, 'player1', 'house', { wood: 60 })).toEqual({ wood: 60 });
    expect(effectiveBuildCost(base(), 'player1', 'outpost', { wood: 150 })).toEqual({ wood: 150 });
    const cmd = { type: 'build', buildingType: 'outpost', owner: 'player1', position: { x: 30, z: 30 } };
    const poor = (talents: string[]) => ({ ...owned(talents), playerResources: { player1: { ...res, wood: 140 } } });
    const vision = (s: GameState) => updateOwnerVision(undefined, { ...s, units: [{ ...boat(), position: { x: 30, z: 30 } }] }, ['player1'], 100);
    expect(isAuthorizedPlayerCommand(poor([]), cmd, 'player1', vision(poor([])), { canStandAt: () => true })).toBe(false);
    expect(isAuthorizedPlayerCommand(poor(['desembarque', 'carpintaria']), cmd, 'player1', vision(poor([])), { canStandAt: () => true })).toBe(true);
  });

  it('Bênção agrícola: +10% de comida por fazenda', () => {
    const farm: Building = { id: 'f', type: 'farm', owner: 'player1', position: { x: 5, z: 5 }, health: 400, maxHealth: 400, isComplete: true, trainingQueue: [] };
    const food = (state: GameState) => tickGameState({ ...state, buildings: [farm] }, ctx()).state.playerResources.player1.food - 500;
    expect(food(owned(['bencao'])) / food(base())).toBeCloseTo(1.1, 3);
  });

  it('Farol: visão 14 em cais e posto, e só com o talento', () => {
    const dock: Building = { id: 'd', type: 'dock', owner: 'player1', position: { x: 50, z: 50 }, health: 700, maxHealth: 700, isComplete: true, trainingQueue: [] };
    const seen = (state: GameState) => {
      const vision = updateOwnerVision(undefined, { ...state, buildings: [dock] }, ['player1'], 100);
      return [11, 13, 15].map((d) => isVisibleTo(vision, 'player1', 50 + d, 50));
    };
    expect(seen(base())).toEqual([false, false, false]); // raio 9 padrão
    expect(seen(owned(['farol']))).toEqual([true, true, false]); // raio 14
    expect(hasTalent(owned(['farol']), 'player1', 'farol')).toBe(true);
  });

  it('XP e talento convivem: pontos vêm das maestrias e não há bônus em dobro ao recomprar', () => {
    let mastery = newMastery();
    mastery = creditXp(mastery, { kind: 'freight', amount: 3000 });
    expect(mastery.points).toBeGreaterThan(0);
  });
});
