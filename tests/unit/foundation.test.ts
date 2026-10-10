import { describe, expect, it } from 'vitest';
import type { Building, GameState, Unit } from '../../src/game/model';
import {
  CAPITAL_BUILD_SECONDS, CAPITAL_MAX_HEALTH, FOUNDATION_KIT, advanceFoundation, findCapitalSites, foundCapital, lifePhase,
} from '../../src/game/foundation';
import { evaluateMatch, localOutcome } from '../../src/game/victory';
import { UNIT_ATTRIBUTES } from '../../src/game/unitAttributes';

const wagon = (owner: string, overrides: Partial<Unit> = {}): Unit => ({
  id: `wagon-${owner}`, type: 'wagon', owner, position: { x: 10, z: 10 }, targetPosition: null, targetEntityId: null,
  health: 300, maxHealth: 300, attackDamage: 0, state: 'idle', ...overrides,
});
const capital = (owner: string, overrides: Partial<Building> = {}): Building => ({
  id: `tc-${owner}`, type: 'town_center', owner, position: { x: 12, z: 12 }, health: 2400, maxHealth: 2400,
  isComplete: true, trainingQueue: [], ...overrides,
});
const house = (owner: string): Building => ({
  id: `house-${owner}`, type: 'house', owner, position: { x: 3, z: 3 }, health: 400, maxHealth: 400, isComplete: true, trainingQueue: [],
});
const state = (overrides: Partial<GameState> = {}): GameState => ({
  units: [wagon('player1')],
  buildings: [],
  resourceNodes: [],
  playerResources: { player1: { wood: 350, food: 350, gold: 200, stone: 100, planks: 0, pop: 4, maxPop: 15 } },
  foundationKits: { player1: { ...FOUNDATION_KIT } },
  ...overrides,
});
const always = () => true;
const id = () => 'new-capital';

describe('carroça e kit (defaults)', () => {
  it('carroça: 300 HP, 0,16 por passo, visão 10 e sem ataque', () => {
    expect(UNIT_ATTRIBUTES.wagon).toMatchObject({ maxHealth: 300, movePerTick: 0.16, visionRadius: 10, canAttack: false, attackDamage: 0 });
  });
  it('kit reservado 400 madeira e 200 pedra, fundação de 20 s e capital de 2400 HP', () => {
    expect(FOUNDATION_KIT).toEqual({ wood: 400, stone: 200 });
    expect(CAPITAL_BUILD_SECONDS).toBe(20);
    expect(CAPITAL_MAX_HEALTH).toBe(2400);
  });
});

describe('lifePhase', () => {
  it('chegando só com a carroça, fundando com a capital em obras, ativo com ela concluída', () => {
    expect(lifePhase('player1', [], [wagon('player1')])).toBe('arriving');
    expect(lifePhase('player1', [capital('player1', { isComplete: false, buildProgress: 10 })], [])).toBe('founding');
    expect(lifePhase('player1', [capital('player1')], [])).toBe('active');
  });
  it('eliminado sem carroça e sem capital; construções comuns não dão vida extra', () => {
    expect(lifePhase('player1', [], [])).toBe('eliminated');
    expect(lifePhase('player1', [house('player1')], [])).toBe('eliminated');
    expect(lifePhase('player1', [], [wagon('player1', { health: 0 })])).toBe('eliminated');
  });
  it('carroça de outro jogador não vale', () => {
    expect(lifePhase('player1', [], [wagon('player2')])).toBe('eliminated');
  });
});

describe('foundCapital', () => {
  it('converte a carroça em capital em obras, consome o kit e baixa a população, sem mutar a entrada', () => {
    const before = state();
    const snapshot = JSON.stringify(before);
    const result = foundCapital(before, { owner: 'player1', wagonId: 'wagon-player1', position: { x: 20, z: 21 } }, always, id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(result.state.units).toEqual([]);
    expect(result.capital).toMatchObject({ id: 'new-capital', type: 'town_center', owner: 'player1', isComplete: false, maxHealth: 2400, position: { x: 20, z: 21 } });
    expect(result.state.foundationKits).toEqual({});
    expect(result.state.playerResources.player1).toMatchObject({ wood: 350, stone: 100, pop: 3 });
    expect(lifePhase('player1', result.state.buildings, result.state.units)).toBe('founding');
  });

  it('só converte uma vez: repetir o pedido não clona kit, capital nem saldo', () => {
    const first = foundCapital(state(), { owner: 'player1', wagonId: 'wagon-player1', position: { x: 20, z: 21 } }, always, id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = foundCapital(first.state, { owner: 'player1', wagonId: 'wagon-player1', position: { x: 30, z: 30 } }, always, id);
    expect(again).toEqual({ ok: false, reason: 'wagon-missing' });
  });

  it('recusa sítio inválido, kit ausente, carroça alheia e jogador que já tem capital, sem alterar o estado', () => {
    const request = { owner: 'player1', wagonId: 'wagon-player1', position: { x: 20, z: 21 } };
    expect(foundCapital(state(), request, () => false, id)).toEqual({ ok: false, reason: 'site-invalid' });
    expect(foundCapital(state({ foundationKits: {} }), request, always, id)).toEqual({ ok: false, reason: 'kit-missing' });
    expect(foundCapital(state({ foundationKits: { player1: { wood: 399, stone: 200 } } }), request, always, id)).toEqual({ ok: false, reason: 'kit-missing' });
    expect(foundCapital(state({ units: [wagon('player2', { id: 'wagon-player1' })] }), request, always, id)).toEqual({ ok: false, reason: 'wagon-missing' });
    expect(foundCapital(state({ buildings: [capital('player1')] }), request, always, id)).toEqual({ ok: false, reason: 'not-arriving' });
    expect(foundCapital(state(), { ...request, position: { x: Number.NaN, z: 1 } }, always, id)).toEqual({ ok: false, reason: 'site-invalid' });
  });
});

describe('advanceFoundation', () => {
  it('conclui em 20 s (400 passos) com vida crescente até 2400', () => {
    let building = capital('player1', { isComplete: false, buildProgress: 0, health: 240 });
    let last = building.health;
    for (let tick = 0; tick < 399; tick += 1) {
      building = advanceFoundation(building);
      expect(building.health).toBeGreaterThanOrEqual(last);
      last = building.health;
    }
    expect(building.isComplete).toBe(false);
    building = advanceFoundation(building);
    expect(building).toMatchObject({ isComplete: true, health: 2400, buildProgress: 100 });
  });
  it('não mexe em outras construções, em capital concluída nem em destruída', () => {
    const done = capital('player1');
    expect(advanceFoundation(done)).toBe(done);
    expect(advanceFoundation(house('player1'))).toEqual(house('player1'));
    const dead = capital('player1', { isComplete: false, health: 0 });
    expect(advanceFoundation(dead)).toBe(dead);
  });
});

describe('findCapitalSites', () => {
  const viableAll = () => true;
  it('devolve pelo menos três sítios distintos e espaçados quando há espaço', () => {
    const sites = findCapitalSites({ x: 30, z: 30 }, viableAll);
    expect(sites.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < sites.length; i += 1) {
      for (let j = i + 1; j < sites.length; j += 1) {
        expect(Math.hypot(sites[i].x - sites[j].x, sites[i].z - sites[j].z)).toBeGreaterThanOrEqual(6);
      }
    }
    expect(sites[0]).toEqual({ x: 30, z: 30 });
  });
  it('respeita a viabilidade e devolve menos sítios quando o terreno não permite', () => {
    const onlyEast = (x: number) => x >= 30;
    const sites = findCapitalSites({ x: 30, z: 30 }, onlyEast);
    expect(sites.every((site) => site.x >= 30)).toBe(true);
    expect(findCapitalSites({ x: 30, z: 30 }, () => false)).toEqual([]);
  });
  it('é determinístico', () => {
    expect(findCapitalSites({ x: 12, z: 40 }, viableAll)).toEqual(findCapitalSites({ x: 12, z: 40 }, viableAll));
  });
});

describe('vitória por fase de vida', () => {
  const players = ['player1', 'player2', 'player3', 'player4'];
  it('ausência inicial de Centro não derrota quem ainda tem a carroça', () => {
    const units = [wagon('player1'), wagon('player2')];
    expect(evaluateMatch([], ['player1', 'player2'], units)).toEqual({ status: 'running', players: ['player1', 'player2'] });
    expect(localOutcome('player1', [], ['player1', 'player2'], units)).toBe('running');
  });
  it('destruir a carroça antes de fundar elimina; o outro vence', () => {
    const units = [wagon('player2')];
    expect(evaluateMatch([], ['player1', 'player2'], units)).toEqual({ status: 'finished', winner: 'player2', players: ['player1', 'player2'] });
    expect(localOutcome('player1', [], ['player1', 'player2'], units)).toBe('defeat');
    expect(localOutcome('player2', [], ['player1', 'player2'], units)).toBe('victory');
  });
  it('capital em obras destruída sem carroça elimina', () => {
    const buildings = [capital('player1', { isComplete: false, health: 0 }), capital('player2')];
    expect(evaluateMatch(buildings, ['player1', 'player2'], [])).toMatchObject({ status: 'finished', winner: 'player2' });
  });
  it('entreposto ou casa não dão vida extra', () => {
    expect(evaluateMatch([house('player1'), capital('player2')], ['player1', 'player2'], [])).toMatchObject({ winner: 'player2' });
  });
  it('com 2, 3 e 4 jogadores a partida continua com dois vivos e termina com um ou nenhum', () => {
    const mixed = [wagon('player1'), wagon('player2', { id: 'w2' })];
    const buildings = [capital('player3'), capital('player4', { isComplete: false })];
    expect(evaluateMatch(buildings, players, mixed).status).toBe('running');
    expect(evaluateMatch(buildings, players.slice(0, 3), mixed).status).toBe('running');
    expect(evaluateMatch([capital('player3')], ['player3', 'player4'], [])).toMatchObject({ status: 'finished', winner: 'player3' });
    expect(evaluateMatch([], players.slice(0, 2), [])).toEqual({ status: 'finished', winner: null, players: players.slice(0, 2) });
    expect(evaluateMatch([], players, [wagon('player4')])).toMatchObject({ status: 'finished', winner: 'player4' });
  });
});
