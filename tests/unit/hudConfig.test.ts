import { describe, expect, it } from 'vitest';
import {
  COMPOSITION_INDICATORS, DEFAULT_HUD_CONFIG, HISTORY_LIMIT, VITAL_INDICATORS, applyComposition, commit, createHistory, indicatorsFor, nextComposition,
  readHud, redo, restoreConfig, undo, type HudConfig,
} from '../../src/game/hudConfig';
import type { Building, GameState, Unit } from '../../src/game/model';

const withMode = (mode: HudConfig['mode']): HudConfig => ({ ...DEFAULT_HUD_CONFIG, mode });

describe('indicadores por composição e modo', () => {
  it('os indicadores vitais aparecem em toda composição e em todo modo não oculto', () => {
    for (const composition of ['map-first', 'explore', 'manage'] as const) {
      for (const mode of ['full', 'compact'] as const) {
        for (const panelOpen of [false, true]) {
          const shown = indicatorsFor({ ...DEFAULT_HUD_CONFIG, composition, mode, panelOpen });
          for (const vital of VITAL_INDICATORS) expect(shown).toContain(vital);
        }
      }
    }
  });

  it('cada composição declara seu conjunto extra, e o painel fechado mostra só os vitais', () => {
    expect(indicatorsFor({ ...DEFAULT_HUD_CONFIG, composition: 'manage', panelOpen: false })).toEqual([...VITAL_INDICATORS]);
    expect(indicatorsFor({ ...DEFAULT_HUD_CONFIG, composition: 'manage', panelOpen: true })).toEqual([...VITAL_INDICATORS, ...COMPOSITION_INDICATORS.manage]);
    expect(COMPOSITION_INDICATORS.explore).not.toContain('queues');
    expect(COMPOSITION_INDICATORS.manage).toContain('queues');
  });

  it('o modo oculto não desenha indicador algum (a restauração é o controle)', () => {
    expect(indicatorsFor(withMode('hidden'))).toEqual([]);
  });

  it('o painel contextual inicia fechado e a inatividade, desligada', () => {
    expect(DEFAULT_HUD_CONFIG.panelOpen).toBe(false);
    expect(DEFAULT_HUD_CONFIG.idleCollapse).toBe(false);
    expect(DEFAULT_HUD_CONFIG.mode).toBe('full');
  });

  it('a composição aplica painéis coerentes e cicla em ordem', () => {
    expect(applyComposition(DEFAULT_HUD_CONFIG, 'manage')).toMatchObject({ composition: 'manage', panelOpen: true });
    expect(applyComposition(applyComposition(DEFAULT_HUD_CONFIG, 'manage'), 'map-first')).toMatchObject({ panelOpen: false });
    expect([nextComposition('map-first'), nextComposition('explore'), nextComposition('manage')]).toEqual(['explore', 'manage', 'map-first']);
  });
});

describe('histórico de configuração', () => {
  it('desfaz e refaz a configuração completa, e uma nova mudança descarta o refazer', () => {
    let history = createHistory();
    const managed = applyComposition(history.present, 'manage');
    history = commit(history, managed);
    history = commit(history, { ...managed, mode: 'compact', minimapCollapsed: true });
    expect(history.present).toMatchObject({ composition: 'manage', mode: 'compact', minimapCollapsed: true });
    history = undo(history);
    expect(history.present).toEqual(managed);
    history = undo(history);
    expect(history.present).toEqual(DEFAULT_HUD_CONFIG);
    history = redo(history);
    expect(history.present).toEqual(managed);
    history = commit(history, { ...managed, idleCollapse: true });
    expect(history.future).toEqual([]);
    expect(redo(history)).toBe(history);
    expect(undo(createHistory())).toEqual(createHistory());
  });

  it('mudança igual à atual não cria entrada; o limite descarta as mais antigas', () => {
    const history = createHistory();
    expect(commit(history, { ...DEFAULT_HUD_CONFIG })).toBe(history);
    let current = history;
    for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) current = commit(current, { ...DEFAULT_HUD_CONFIG, minimapCollapsed: i % 2 === 0 });
    expect(current.past).toHaveLength(HISTORY_LIMIT);
  });

  it('o histórico só contém configuração: nenhuma chave de partida entra nele', () => {
    const keys = Object.keys(DEFAULT_HUD_CONFIG).sort();
    expect(keys).toEqual(['composition', 'idleCollapse', 'minimapCollapsed', 'mode', 'panelOpen', 'selectionCollapsed']);
  });
});

describe('regra de recarga', () => {
  it('restaura a configuração, mas o painel volta fechado e o modo oculto volta completo', () => {
    const restored = restoreConfig({ composition: 'explore', mode: 'hidden', panelOpen: true, minimapCollapsed: true, selectionCollapsed: true, idleCollapse: true });
    expect(restored).toEqual({ composition: 'explore', mode: 'full', panelOpen: false, minimapCollapsed: true, selectionCollapsed: true, idleCollapse: true });
    expect(restoreConfig({ mode: 'compact' }).mode).toBe('compact');
  });

  it('dados inválidos ou ausentes caem no padrão, sem lançar', () => {
    expect(restoreConfig(null)).toEqual(DEFAULT_HUD_CONFIG);
    expect(restoreConfig('lixo')).toEqual(DEFAULT_HUD_CONFIG);
    expect(restoreConfig({ composition: 'x', mode: 5, idleCollapse: 'sim' })).toEqual(DEFAULT_HUD_CONFIG);
  });
});

describe('leitura do estado real', () => {
  const unit = (overrides: Partial<Unit>): Unit => ({
    id: 'u', type: 'villager', owner: 'player1', position: { x: 1, z: 1 }, targetPosition: null, targetEntityId: null,
    health: 100, maxHealth: 100, attackDamage: 0, state: 'idle', ...overrides,
  });
  const building = (overrides: Partial<Building>): Building => ({
    id: 'b', type: 'barracks', owner: 'player1', position: { x: 5, z: 5 }, health: 800, maxHealth: 800, isComplete: true,
    trainingQueue: [{ unitType: 'soldier', progress: 40 }], ...overrides,
  });
  const state: Pick<GameState, 'playerResources' | 'units' | 'buildings'> = {
    playerResources: { player1: { wood: 123.9, food: 45, gold: 6, stone: 7, planks: 8, pop: 3, maxPop: 20 }, player2: { wood: 999, food: 999, gold: 999, stone: 999, planks: 999, pop: 9, maxPop: 9 } },
    units: [unit({ id: 'a' }), unit({ id: 'b', state: 'gathering' }), unit({ id: 'c', owner: 'player2' }), unit({ id: 'd', health: 0 }), unit({ id: 'e', type: 'soldier' })],
    buildings: [building({}), building({ id: 'foe', owner: 'player2' }), building({ id: 'wip', isComplete: false })],
  };

  it('lê só os números do jogador: recursos, população, ociosos, filas e seleção', () => {
    const readout = readHud(state, 'player1', { kind: 'unit', id: 'a' });
    expect(readout).toMatchObject({ wood: 123.9, food: 45, gold: 6, stone: 7, planks: 8, population: { current: 3, max: 20 }, idleVillagers: 1 });
    expect(readout.queues).toEqual([{ buildingId: 'b', unit: 'soldier', progress: 40 }]);
    expect(readout.selection).toEqual({ kind: 'unit', id: 'a' });
  });

  it('jogador sem registro lê zeros, sem inventar dados', () => {
    expect(readHud(state, 'player9')).toMatchObject({ wood: 0, population: { current: 0, max: 0 }, idleVillagers: 0, queues: [], selection: null });
  });
});

describe('configuração do HUD não mexe na partida', () => {
  it('ler e reconfigurar o HUD não altera o estado congelado da partida (seleção, ordens e simulação ficam intactas)', () => {
    const frozen: GameState = Object.freeze({
      units: Object.freeze([Object.freeze({
        id: 'u', type: 'villager', owner: 'player1', position: Object.freeze({ x: 1, z: 1 }), targetPosition: Object.freeze({ x: 9, z: 9 }), targetEntityId: null,
        health: 100, maxHealth: 100, attackDamage: 0, state: 'moving',
      })]) as unknown as Unit[],
      buildings: Object.freeze([]) as unknown as Building[],
      resourceNodes: [],
      playerResources: Object.freeze({ player1: Object.freeze({ wood: 1, food: 2, gold: 3, stone: 4, planks: 5, pop: 1, maxPop: 5 }) }),
    }) as GameState;
    const before = JSON.stringify(frozen);
    let history = createHistory();
    history = commit(history, applyComposition(history.present, 'manage'));
    history = commit(history, { ...history.present, mode: 'compact', panelOpen: false });
    readHud(frozen, 'player1', { kind: 'unit', id: 'u' });
    history = undo(redo(undo(history)));
    expect(JSON.stringify(frozen)).toBe(before);
    expect(frozen.units[0].targetPosition).toEqual({ x: 9, z: 9 });
  });
});
