import { describe, expect, it } from 'vitest';
import { BATCH_UNDO_SECONDS, canUndoBatch, previewBatch, recordBatch, undoBatch, type BatchCommand } from '../../src/game/batchOrders';
import type { GameState, Unit } from '../../src/game/model';
import { isAuthorizedPlayerCommand } from '../../src/game/networkCommands';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';
import { updateOwnerVision } from '../../src/game/visionAuthority';

const unit = (id: string, owner = 'player1', extra: Partial<Unit> = {}): Unit => ({
  id, type: 'villager', owner, position: { x: 10, z: 10 }, targetPosition: null, targetEntityId: null, health: 100, maxHealth: 100, attackDamage: 0, state: 'idle', ...extra,
});
const res = { wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: 3, maxPop: 20 };
const world = (units: Unit[]): GameState => ({
  units, buildings: [], mapSize: 100, playerResources: { player1: res, player2: res },
  resourceNodes: [{ id: 'tree', type: 'tree', position: { x: 12, z: 10 }, remaining: 100 }, { id: 'far', type: 'tree', position: { x: 90, z: 90 }, remaining: 100 }],
});
const cmd = (unitId: string, targetId = 'tree'): BatchCommand => ({ type: 'gather', unitId, targetId });

describe('prévia', () => {
  const state = world([unit('a'), unit('b'), unit('c', 'player2'), unit('dead', 'player1', { health: 0 })]);
  const vision = updateOwnerVision(undefined, state, ['player1', 'player2'], 100);
  const authorize = (command: BatchCommand) => isAuthorizedPlayerCommand(state, command, 'player1', vision);

  it('lista todos os alvos, donos e efeitos das ordens aceitas e não altera nada', () => {
    const before = JSON.stringify(state);
    const preview = previewBatch(state, [cmd('a'), cmd('b')], authorize);
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows[0]).toMatchObject({ unitId: 'a', owner: 'player1', targetId: 'tree' });
    expect(preview.rows[0].effect).toMatch(/passa a coletar tree \(12, 10\)/);
    expect(preview.commands).toEqual([cmd('a'), cmd('b')]);
    expect(JSON.stringify(state)).toBe(before); // cancelar = não aplicar: a partida segue idêntica
  });

  it('a mesma autorização das ações individuais: posse, alvo desconhecido, inexistente, morto e repetido viram pulados com motivo', () => {
    const preview = previewBatch(state, [cmd('c'), cmd('a', 'far'), cmd('a', 'nao-existe'), cmd('dead'), cmd('x'), cmd('b'), cmd('b')], authorize);
    const reasons = Object.fromEntries(preview.skipped.map((s, i) => [`${s.unitId}#${i}`, s.reason]));
    expect(preview.rows.map((r) => r.unitId)).toEqual(['b']);
    expect(preview.skipped.some((s) => s.unitId === 'c' && /recusaria/.test(s.reason))).toBe(true); // unidade alheia
    expect(preview.skipped.some((s) => s.unitId === 'a' && /recusaria/.test(s.reason))).toBe(true); // alvo fora da visão
    expect(preview.skipped.some((s) => /alvo inexistente/.test(s.reason))).toBe(false); // 'a' com alvo inexistente já foi marcado como repetido
    expect(preview.skipped.some((s) => /morta/.test(s.reason))).toBe(true);
    expect(preview.skipped.some((s) => /repetida/.test(s.reason))).toBe(true);
    void reasons;
  });
});

describe('aplicar e desfazer', () => {
  const ctx = (): SimulationContext => ({ playerSlot: 'player1', mode: 'host', activeSlots: ['player1', 'player2'], gatherRadiusLimit: 14, sustainableForestryEnabled: false, buildingDefinitions: {}, random: () => 0.5, createId: () => 'id' });
  const apply = (state: GameState, commands: BatchCommand[]): GameState => ({
    ...state, units: state.units.map((u) => (commands.some((c) => c.unitId === u.id) ? { ...u, state: 'gathering' as const, targetEntityId: commands.find((c) => c.unitId === u.id)!.targetId } : u)),
  });

  it('desfaz exatamente quem ainda executa a ordem do lote e restaura a ordem anterior', () => {
    const start = world([unit('a', 'player1', { state: 'moving', targetPosition: { x: 50, z: 50 } }), unit('b')]);
    const preview = previewBatch(start, [cmd('a'), cmd('b')], () => true);
    const record = recordBatch(start, preview, 100);
    const applied = apply(start, preview.commands);
    const undone = undoBatch(applied, record);
    expect(undone.reverted.sort()).toEqual(['a', 'b']);
    expect(undone.state.units.find((u) => u.id === 'a')).toMatchObject({ state: 'moving', targetEntityId: null, targetPosition: { x: 50, z: 50 } });
    expect(undone.state.units.find((u) => u.id === 'b')).toMatchObject({ state: 'idle', targetEntityId: null });
    expect(undone.conflicts).toEqual([]);
  });

  it('informa conflitos: unidade que recebeu outra ordem, morreu ou sumiu não é tocada; ninguém ressuscita', () => {
    const start = world([unit('a'), unit('b'), unit('c'), unit('d')]);
    const preview = previewBatch(start, [cmd('a'), cmd('b'), cmd('c'), cmd('d')], () => true);
    const record = recordBatch(start, preview, 0);
    let later = apply(start, preview.commands);
    later = { ...later, units: later.units.filter((u) => u.id !== 'd').map((u) => (u.id === 'a' ? { ...u, targetEntityId: 'outra-arvore' } : u.id === 'b' ? { ...u, health: 0 } : u)) };
    const undone = undoBatch(later, record);
    expect(undone.reverted).toEqual(['c']);
    expect(undone.conflicts.map((c) => c.unitId).sort()).toEqual(['a', 'b', 'd']);
    expect(undone.state.units.find((u) => u.id === 'b')!.health).toBe(0); // não ressuscita
    expect(undone.state.units.find((u) => u.id === 'a')!.targetEntityId).toBe('outra-arvore'); // outra ordem preservada
  });

  it('não devolve recurso já coletado nem desfaz o tempo decorrido da simulação', () => {
    const start = world([unit('a', 'player1', { position: { x: 11.5, z: 10 } })]);
    const record = recordBatch(start, previewBatch(start, [cmd('a')], () => true), 0);
    let state = apply(start, [cmd('a')]);
    for (let i = 0; i < 40; i += 1) state = tickGameState(state, ctx()).state;
    const collected = state.playerResources.player1.wood;
    const undone = undoBatch(state, record).state;
    expect(collected).toBeGreaterThan(0);
    expect(undone.playerResources.player1.wood).toBe(collected); // recurso fica
    expect(undone.elapsed).toBe(state.elapsed); // relógio da simulação intocado
    expect(undone.resourceNodes).toBe(state.resourceNodes);
  });

  it('o desfazer expira em 60 s e repetir o desfazer não muda nada', () => {
    const start = world([unit('a')]);
    const record = recordBatch(start, previewBatch(start, [cmd('a')], () => true), 100);
    expect(canUndoBatch(record, 100 + BATCH_UNDO_SECONDS)).toBe(true);
    expect(canUndoBatch(record, 100 + BATCH_UNDO_SECONDS + 1)).toBe(false);
    expect(canUndoBatch(null, 0)).toBe(false);
    const applied = apply(start, [cmd('a')]);
    const once = undoBatch(applied, record).state;
    const twice = undoBatch(once, record);
    expect(twice.reverted).toEqual([]); // já não executa a ordem do lote: conflito, nada a reverter
    expect(twice.state.units[0]).toMatchObject({ state: 'idle', targetEntityId: null });
  });
});
