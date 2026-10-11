import { describe, expect, it } from 'vitest';
import type { GameState, Unit, UnitType } from '../../src/game/model';
import { applyRetaliation, canRetaliate, retaliationTargets } from '../../src/game/retaliation';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';

const unit = (id: string, owner: string, type: UnitType, x: number, z: number, extra: Partial<Unit> = {}): Unit => ({
  id, type, owner, position: { x, z }, targetPosition: null, targetEntityId: null, health: UNIT_HP[type], maxHealth: UNIT_HP[type], attackDamage: 24, state: 'idle', ...extra,
});
const UNIT_HP: Record<UnitType, number> = { villager: 100, soldier: 150, cavalry: 180, fishing_boat: 220, trade_boat: 220, wagon: 300, colonial_transport: 360, warship: 300 };
const attacker = (id: string, target: string, x = 12, z = 10, type: UnitType = 'soldier') => unit(id, 'player2', type, x, z, { state: 'attacking', targetEntityId: target });

const resources = { wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: 2, maxPop: 99 };
const ctx: SimulationContext = {
  playerSlot: 'player1', mode: 'host', pathCache: new Map(), gatherRadiusLimit: 14, sustainableForestryEnabled: false, buildingDefinitions: {},
  random: () => 0.5, createId: () => 'x', activeSlots: ['player1', 'player2'],
};
// Cada lado tem a capital em pé, longe da luta: sem ela a regra de eliminação limparia as ordens a cada passo.
const capital = (owner: string, x: number) => ({ id: `capital-${owner}`, type: 'town_center' as const, owner, position: { x, z: 200 }, health: 2400, maxHealth: 2400, isComplete: true, trainingQueue: [] });
const run = (units: Unit[], ticks: number): GameState => {
  let state: GameState = { units, buildings: [capital('player1', 190), capital('player2', 210)], resourceNodes: [], playerResources: { player1: { ...resources }, player2: { ...resources } } };
  for (let i = 0; i < ticks; i += 1) state = tickGameState(state, ctx).state;
  return state;
};
const healthOf = (state: GameState, id: string) => state.units.find((u) => u.id === id)?.health ?? 0;

describe('revide de tropa parada', () => {
  it('um soldado parado atacado passa a atacar o agressor, sem ordem do jogador', () => {
    const targets = retaliationTargets([unit('meu', 'player1', 'soldier', 10, 10), attacker('inimigo', 'meu')], undefined);
    expect(targets.get('meu')).toBe('inimigo');
    const after = applyRetaliation([unit('meu', 'player1', 'soldier', 10, 10), attacker('inimigo', 'meu')], undefined);
    expect(after.find((u) => u.id === 'meu')).toMatchObject({ state: 'attacking', targetEntityId: 'inimigo', targetPosition: null });
  });

  it('REGRESSÃO (simulação): o agressor leva dano de uma tropa parada que ninguém comandou', () => {
    const state = run([unit('meu', 'player1', 'soldier', 10, 10), attacker('inimigo', 'meu')], 60);
    expect(healthOf(state, 'inimigo'), 'o agressor foi atingido').toBeLessThan(150);
  });

  it('quatro soldados parados derrubam um agressor que os ataca', () => {
    const mine = Array.from({ length: 4 }, (_, i) => unit(`m${i}`, 'player1', 'soldier', 10, 10 + i * 0.4));
    const state = run([...mine, attacker('inimigo', 'm0')], 150);
    expect(state.units.find((u) => u.id === 'inimigo'), 'o agressor morre').toBeUndefined();
    expect(state.units.filter((u) => u.owner === 'player1').length).toBe(4);
  });

  it('escolhe o agressor mais próximo quando há vários', () => {
    const targets = retaliationTargets([unit('meu', 'player1', 'soldier', 10, 10), attacker('longe', 'meu', 20, 10), attacker('perto', 'meu', 13, 10)], undefined);
    expect(targets.get('meu')).toBe('perto');
  });

  it('não troca a ordem de quem já tem o que fazer', () => {
    const busy: Unit[] = [
      unit('marchando', 'player1', 'soldier', 10, 10, { state: 'moving', targetPosition: { x: 30, z: 30 } }),
      unit('atacando', 'player1', 'soldier', 10, 11, { state: 'attacking', targetEntityId: 'outro' }),
      unit('construindo', 'player1', 'soldier', 10, 12, { state: 'building', targetEntityId: 'obra' }),
    ];
    const hostile = [attacker('a', 'marchando'), attacker('b', 'atacando'), attacker('c', 'construindo')];
    expect(retaliationTargets([...busy, ...hostile], undefined).size).toBe(0);
  });

  it('aldeão parado não revida por conta própria', () => {
    expect(canRetaliate(unit('v', 'player1', 'villager', 10, 10))).toBe(false);
    expect(retaliationTargets([unit('v', 'player1', 'villager', 10, 10), attacker('inimigo', 'v')], undefined).size).toBe(0);
  });

  it('a tropa parada defende o aliado atacado dentro do campo de visão, e só dentro dele', () => {
    const perto = retaliationTargets([unit('vigia', 'player1', 'soldier', 10, 10), unit('alvo', 'player1', 'soldier', 14, 10), attacker('inimigo', 'alvo', 16, 10)], undefined);
    expect(perto.get('vigia'), 'o vigia a 6 do agressor defende o aliado').toBe('inimigo');
    expect(perto.get('alvo'), 'e o atacado revida').toBe('inimigo');
    const longe = retaliationTargets([unit('vigia', 'player1', 'soldier', 10, 10), unit('alvo', 'player1', 'soldier', 60, 10), attacker('inimigo', 'alvo', 62, 10)], undefined);
    expect(longe.has('vigia'), 'a 52 do agressor, fora da visão: não vai').toBe(false);
  });

  it('nunca revida a quem é do mesmo dono nem a quem ataca outro lado', () => {
    const targets = retaliationTargets([
      unit('meu', 'player1', 'soldier', 10, 10), { ...attacker('amigo', 'meu'), owner: 'player1' },
      unit('de-outro', 'player3', 'soldier', 10, 12), attacker('inimigo', 'de-outro'),
    ], undefined);
    expect(targets.has('meu')).toBe(false);
    expect(targets.get('de-outro')).toBe('inimigo');
  });

  it('só revida o que o dono vê (a perseguição de alvo invisível acabaria no mesmo passo)', () => {
    const blind = {} as Record<string, never>;
    expect(retaliationTargets([unit('meu', 'player1', 'soldier', 10, 10), attacker('inimigo', 'meu')], blind).size).toBe(0);
  });

  it('barco de guerra só responde a barco', () => {
    expect(retaliationTargets([unit('nav', 'player1', 'warship', 10, 10), attacker('terra', 'nav')], undefined).size).toBe(0);
    expect(retaliationTargets([unit('nav', 'player1', 'warship', 10, 10), attacker('barco', 'nav', 12, 10, 'warship')], undefined).get('nav')).toBe('barco');
  });

  it('cavalaria e soldado revidam; barco de pesca e carroça não (sem ataque)', () => {
    expect(canRetaliate(unit('c', 'player1', 'cavalry', 0, 0))).toBe(true);
    expect(canRetaliate(unit('p', 'player1', 'fishing_boat', 0, 0))).toBe(false);
    expect(canRetaliate(unit('w', 'player1', 'wagon', 0, 0))).toBe(false);
  });

  it('CONTROLE NEGATIVO: sem agressor ninguém muda de estado', () => {
    const units = [unit('a', 'player1', 'soldier', 10, 10), unit('b', 'player2', 'soldier', 40, 40)];
    expect(applyRetaliation(units, undefined)).toBe(units);
  });
});
