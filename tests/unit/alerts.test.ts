import { describe, expect, it } from 'vitest';
import { CAPITAL_RISK, boatMarkers, collectAlerts, healthMemoryOf, legLabel } from '../../src/game/alerts';
import type { Building, GameState, Unit } from '../../src/game/model';
import type { Storm } from '../../src/game/storms';
import type { TradeRoute } from '../../src/game/tradeRoutes';

const route = (overrides: Partial<TradeRoute> = {}): TradeRoute => ({
  a: { buildingId: 'a', berth: { x: 1, z: 1 } }, b: { buildingId: 'b', berth: { x: 9, z: 9 } }, outbound: { resource: 'wood', amount: 50 }, back: null,
  partial: false, phase: 'travel_b', timer: 0, status: 'running', ...overrides,
});
const unit = (id: string, owner: string, x: number, z: number, extra: Partial<Unit> = {}): Unit => ({
  id, type: 'trade_boat', owner, position: { x, z }, targetPosition: null, targetEntityId: null, health: 100, maxHealth: 100, attackDamage: 0, state: 'idle', ...extra,
});
const capital = (health: number, owner = 'player1'): Building => ({ id: 'tc', type: 'town_center', owner, position: { x: 5, z: 5 }, health, maxHealth: 2400, isComplete: true, trainingQueue: [] });
const storm: Storm = { id: 2, center: { x: 50, z: 50 }, radius: 12, warnAt: 100, startsAt: 110, endsAt: 140, severity: 1 };
const state = (units: Unit[], buildings: Building[] = [], extra: Partial<GameState> = {}) => ({ units, buildings, elapsed: 0, ...extra });
const known = () => true;

describe('alertas agrupados por objeto', () => {
  it('rota bloqueada/perdida/esperando vira um alerta do barco, com a posição do próprio barco', () => {
    const blocked = unit('boat', 'player1', 30, 40, { route: route({ status: 'blocked', cause: 'lost', reason: 'Porto perdido.' }) });
    const [alert] = collectAlerts(state([blocked]), 'player1', undefined, known);
    expect(alert).toMatchObject({ objectId: 'boat', kind: 'route', severity: 'danger', focus: { x: 30, z: 40 } });
    expect(alert.text).toMatch(/Rota perdida: Porto perdido/);
    const waiting = unit('boat', 'player1', 1, 1, { route: route({ status: 'waiting', reason: 'Esperando estoque.' }) });
    expect(collectAlerts(state([waiting]), 'player1', undefined, known)[0].severity).toBe('warning');
    const fine = unit('boat', 'player1', 1, 1, { route: route() });
    expect(collectAlerts(state([fine]), 'player1', undefined, known)).toEqual([]);
  });

  it('o mesmo objeto nunca aparece duas vezes: combate e rota no mesmo barco ficam num alerta, o mais grave', () => {
    const hurt = unit('boat', 'player1', 30, 40, { health: 60, route: route({ status: 'waiting', reason: 'Esperando.' }) });
    const alerts = collectAlerts(state([hurt]), 'player1', { boat: 100 }, known);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: 'combat', severity: 'danger' });
  });

  it('combate: só objeto próprio que perdeu vida; dano de leitura sem queda não alerta e o agressor não aparece', () => {
    const mine = unit('u1', 'player1', 10, 10, { type: 'soldier', health: 80 });
    const foe = unit('foe', 'player2', 11, 10, { type: 'soldier' });
    const memory = healthMemoryOf(state([unit('u1', 'player1', 10, 10, { type: 'soldier', health: 100 }), foe]), 'player1');
    expect(memory).toEqual({ u1: 100 });
    const alerts = collectAlerts(state([mine, foe]), 'player1', memory, known);
    expect(alerts.map((a) => a.objectId)).toEqual(['u1']);
    expect(alerts[0].focus).toEqual({ x: 10, z: 10 });
    expect(JSON.stringify(alerts)).not.toMatch(/foe|player2/);
    expect(collectAlerts(state([mine]), 'player1', { u1: 80 }, known)).toEqual([]);
  });

  it('sede em risco abaixo de 50% de vida ou sob ataque; sede de outro dono ou em obras não alerta', () => {
    expect(CAPITAL_RISK).toBe(0.5);
    expect(collectAlerts(state([], [capital(1000)]), 'player1', undefined, known)[0]).toMatchObject({ kind: 'capital', text: expect.stringMatching(/42%/) });
    expect(collectAlerts(state([], [capital(2400)]), 'player1', { tc: 2400 }, known)).toEqual([]);
    expect(collectAlerts(state([], [capital(2300)]), 'player1', { tc: 2400 }, known)[0].text).toMatch(/sob ataque/);
    expect(collectAlerts(state([], [capital(100, 'player2')]), 'player1', undefined, known)).toEqual([]);
  });

  it('tempestade só de região conhecida ou com barco próprio perto, e a localização é a região', () => {
    const s = state([], [], { storm, elapsed: 105 });
    expect(collectAlerts(s, 'player1', undefined, () => false)).toEqual([]);
    const [alert] = collectAlerts(s, 'player1', undefined, known);
    expect(alert).toMatchObject({ kind: 'storm', focus: { x: 50, z: 50 } });
  });
});

describe('porão e perna no minimapa e no HUD', () => {
  it('marca só os barcos próprios com carga ou rota', () => {
    const loaded = unit('a', 'player1', 5, 5, { cargo: { wood: 10, food: 0, gold: 0, stone: 0, planks: 0 } });
    const routed = unit('b', 'player1', 6, 6, { route: route() });
    const foe = unit('c', 'player2', 7, 7, { route: route() });
    const plain = unit('d', 'player1', 8, 8);
    expect(boatMarkers([loaded, routed, foe, plain], 'player1')).toEqual([
      { id: 'a', x: 5, z: 5, carrying: true, onRoute: false },
      { id: 'b', x: 6, z: 6, carrying: false, onRoute: true },
    ]);
  });

  it('descreve a perna e o porão', () => {
    const boat = unit('b', 'player1', 0, 0, { cargo: { wood: 30, food: 0, gold: 0, stone: 0, planks: 0 }, route: route({ phase: 'travel_b' }) });
    expect(legLabel(boat)).toBe('Ida: 50 wood · porão 30');
    expect(legLabel({ ...boat, route: route({ phase: 'travel_a', back: null }) })).toBe('Volta: vazia · porão 30');
    expect(legLabel(unit('x', 'player1', 0, 0))).toBeNull();
  });
});
