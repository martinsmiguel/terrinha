import { describe, expect, it } from 'vitest';
import { FLOW_WINDOW_SECONDS, flowRows, localityRate, netRate, pushSample, sampleFlows, type FlowSample } from '../../src/game/flows';
import type { GameState, Unit } from '../../src/game/model';

const res = (wood: number, pop = 5) => ({ wood, food: 10, gold: 0, stone: 0, planks: 0, pop, maxPop: 20 });
const boat = (cargoWood: number, kit = false): Unit => ({ id: 'b', type: 'trade_boat', owner: 'player1', position: { x: 1, z: 1 }, targetPosition: null, targetEntityId: null, health: 1, maxHealth: 1, attackDamage: 0, state: 'idle', cargo: { wood: cargoWood, food: 0, gold: 0, stone: 0, planks: 0 }, ...(kit ? { kit: true } : {}) });
const state = (t: number, wood: number, extra: Partial<GameState> = {}): GameState => ({ units: [], buildings: [], resourceNodes: [], elapsed: t, playerResources: { player1: res(wood) }, ...extra });
const series = (values: [number, number][]): FlowSample[] => values.reduce<FlowSample[]>((acc, [t, wood]) => pushSample(acc, sampleFlows(state(t, wood), 'player1')), []);

describe('taxa líquida por minuto', () => {
  it('(créditos − débitos) / tempo × 60: +30 de madeira em 30 s são +60 por minuto', () => {
    const samples = series([[0, 100], [10, 110], [20, 120], [30, 130]]);
    const rate = netRate(samples, (s) => s.total.wood);
    expect(rate.perMinute).toBeCloseTo(60, 6);
    expect(rate.seconds).toBe(30);
    expect(rate.partial).toBe(true); // 30 s < janela de 60 s
  });

  it('gasto aparece como taxa negativa; sem amostra suficiente não inventa número', () => {
    expect(netRate(series([[0, 100], [30, 70]]), (s) => s.total.wood).perMinute).toBeCloseTo(-60, 6);
    expect(netRate([], (s) => s.total.wood)).toEqual({ perMinute: null, seconds: 0, partial: true });
    expect(netRate(series([[0, 100]]), (s) => s.total.wood).perMinute).toBeNull();
  });

  it('a janela é de no máximo 60 s e deixa de ser parcial quando completa', () => {
    let samples: FlowSample[] = [];
    for (let t = 0; t <= 120; t += 1) samples = pushSample(samples, sampleFlows(state(t, 100 + t * 2), 'player1'));
    const rate = netRate(samples, (s) => s.total.wood);
    expect(samples[0].t).toBe(120 - FLOW_WINDOW_SECONDS);
    expect(rate.seconds).toBe(FLOW_WINDOW_SECONDS);
    expect(rate.partial).toBe(false);
    expect(rate.perMinute).toBeCloseTo(120, 6);
  });

  it('amostras mais próximas que 1 s não entram e o relógio que recua recomeça a janela', () => {
    const a = pushSample([], sampleFlows(state(5, 100), 'player1'));
    expect(pushSample(a, sampleFlows(state(5.4, 101), 'player1'))).toHaveLength(1);
    const restarted = pushSample(a, sampleFlows(state(0, 100), 'player1'));
    expect(restarted).toHaveLength(1);
  });
});

describe('estoque local versus agregado e transferência interna', () => {
  const local = (wood: number) => ({ localStocks: { player1: { '1': { wood, food: 0, gold: 0, stone: 0, planks: 0 } } } });

  it('o total soma metrópole, colônias e carga em trânsito, cada um uma vez', () => {
    const sample = sampleFlows(state(0, 100, { ...local(40), units: [boat(25, true)] }), 'player1');
    expect(sample.home.wood).toBe(100);
    expect(sample.colonies.wood).toBe(40);
    expect(sample.transit.wood).toBe(25 + 150); // carga + madeira do kit
    expect(sample.total.wood).toBe(100 + 40 + 175);
    expect(sample.byLocality['1'].wood).toBe(40);
  });

  it('transferência interna (metrópole → barco → colônia) não é produção nem perda do império', () => {
    const steps: GameState[] = [
      state(0, 200, local(0)),
      state(10, 100, { ...local(0), units: [boat(100)] }), // carregou 100
      state(20, 100, local(100)), // entregou na colônia
    ];
    const samples = steps.reduce<FlowSample[]>((acc, s) => pushSample(acc, sampleFlows(s, 'player1')), []);
    expect(netRate(samples, (s) => s.total.wood).perMinute).toBeCloseTo(0, 6); // império não ganhou nem perdeu
    expect(netRate(samples, (s) => s.home.wood).perMinute).toBeCloseTo(-300, 6); // metrópole perdeu 100 em 20 s
    expect(localityRate(samples, '1', 'wood').perMinute).toBeCloseTo(300, 6); // colônia ganhou 100 em 20 s
  });

  it('gasto local baixa a taxa local e a do império, mas não a da metrópole', () => {
    const steps = [state(0, 100, local(100)), state(20, 100, local(40))];
    const samples = steps.reduce<FlowSample[]>((acc, s) => pushSample(acc, sampleFlows(s, 'player1')), []);
    const rows = flowRows(samples);
    const wood = rows.find((r) => r.key === 'wood')!;
    expect(wood.home.perMinute).toBeCloseTo(0, 6);
    expect(wood.colonies.perMinute).toBeCloseTo(-180, 6);
    expect(wood.empire.perMinute).toBeCloseTo(-180, 6);
  });

  it('as seis linhas cobrem os cinco recursos e a população, com dados do dono', () => {
    const rows = flowRows(series([[0, 100], [10, 100]]));
    expect(rows.map((r) => r.key)).toEqual(['wood', 'food', 'gold', 'stone', 'planks', 'pop']);
    expect(sampleFlows(state(0, 100), 'player9').total.wood).toBe(0); // dono sem registro: zeros
  });
});
