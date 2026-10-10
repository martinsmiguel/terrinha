import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '../../src/game/model';
import { DeltaReceiver, DeltaSender, KEYFRAME_EVERY, applyDelta, diffStates, rulesRevisionOf, type SnapshotPacket } from '../../src/game/snapshotDelta';

const unit = (i: number, x = i, z = i): Unit => ({
  id: `u${i}`, type: 'soldier', owner: i % 2 ? 'player1' : 'player2', position: { x, z }, targetPosition: { x: 99, z: 99 }, targetEntityId: null,
  health: 150, maxHealth: 150, attackDamage: 24, state: 'moving',
});
const world = (n = 300, tick = 0, ruleSettings?: GameState['ruleSettings']): GameState => ({
  mapSize: 768, mapSeed: 7,
  units: Array.from({ length: n }, (_, i) => unit(i, i + (i % 20 === 0 ? tick : 0), i)),
  buildings: [{ id: 'b1', type: 'house', owner: 'player1', position: { x: 5, z: 5 }, health: 450, maxHealth: 450, isComplete: true, trainingQueue: [] }],
  resourceNodes: Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, type: 'tree' as const, position: { x: i, z: i }, remaining: 100 })),
  playerResources: { player1: { wood: 100 + tick, food: 0, gold: 0, stone: 0, planks: 0, pop: 3, maxPop: 9 } },
  ...(ruleSettings ? { ruleSettings } : {}),
});

describe('delta entre estados', () => {
  it('aplicar o delta ao estado anterior reproduz o novo, com remoções e escalares', () => {
    const before = world(50, 0);
    const after: GameState = { ...world(50, 3), units: world(50, 3).units.slice(1).concat(unit(900)), match: { status: 'running', players: ['player1'] } };
    const delta = diffStates(before, after);
    expect(delta.units.remove).toEqual(['u0']);
    expect(applyDelta(before, delta)).toEqual(after);
    const gone = diffStates(after, before);
    expect(gone.removedFields).toContain('match');
    // A ordem das listas não importa (entidades têm id): compara por id.
    const byId = (state: GameState): GameState => ({ ...state, units: [...state.units].sort((a, b) => a.id.localeCompare(b.id)) });
    expect(byId(applyDelta(after, gone))).toEqual(byId(before));
  });

  it('o delta carrega só o que mudou', () => {
    const delta = diffStates(world(300, 0), world(300, 1));
    expect(delta.units.upsert.length).toBe(15);
    expect(delta.resourceNodes.upsert).toEqual([]);
    expect(delta.buildings.upsert).toEqual([]);
  });
});

describe('remetente e receptor sequenciados', () => {
  const send = (sender: DeltaSender, ticks: number[]): SnapshotPacket[] => ticks.map((t) => sender.next(world(300, t), 1));

  it('o primeiro pacote é completo; os demais, delta com sequência e base', () => {
    const [first, second, third] = send(new DeltaSender('s1'), [0, 1, 2]);
    expect(first).toMatchObject({ kind: 'full', seq: 1, sessionId: 's1', rulesRevision: 1 });
    expect(second).toMatchObject({ kind: 'delta', seq: 2, base: 1 });
    expect(third).toMatchObject({ kind: 'delta', seq: 3, base: 2 });
  });

  it('em ordem converge para o estado do host', () => {
    const receiver = new DeltaReceiver();
    let last: GameState | null = null;
    for (const packet of send(new DeltaSender('s1'), [0, 1, 2, 3])) last = receiver.apply(packet).state;
    expect(last).toEqual(world(300, 3));
  });

  it('pacote duplicado é ignorado e não reaplica nada (economia não dobra)', () => {
    const receiver = new DeltaReceiver();
    const packets = send(new DeltaSender('s1'), [0, 1, 2]);
    receiver.apply(packets[0]); receiver.apply(packets[1]);
    const dup = receiver.apply(packets[1]);
    expect(dup).toMatchObject({ state: null, needsResync: false, reason: 'duplicado' });
    expect(receiver.apply(packets[2]).state).toEqual(world(300, 2));
    expect(receiver.apply(packets[2]).state).toBeNull();
  });

  it('perda ou reordenação pede ressync em vez de adivinhar, e o quadro completo converge', () => {
    const sender = new DeltaSender('s1');
    const receiver = new DeltaReceiver();
    const [p1, p2, p3, p4] = send(sender, [0, 1, 2, 3]);
    receiver.apply(p1);
    expect(receiver.apply(p3)).toMatchObject({ state: null, needsResync: true }); // p2 perdido
    expect(receiver.apply(p2).state).not.toBeNull(); // p2 atrasado ainda cabe na base
    expect(receiver.apply(p4)).toMatchObject({ needsResync: true, reason: 'buraco na sequência' }); // p3 foi recusado antes
    sender.resync();
    const full = sender.next(world(300, 4), 1);
    expect(full.kind).toBe('full');
    expect(receiver.apply(full).state).toEqual(world(300, 4));
    expect(receiver.apply(sender.next(world(300, 5), 1)).state).toEqual(world(300, 5));
  });

  it('pacote sem sessão, sequência, revisão ou base é recusado', () => {
    const receiver = new DeltaReceiver();
    expect(receiver.apply({ kind: 'full', state: world(5) }).state).toBeNull();
    expect(receiver.apply(null).state).toBeNull();
    const [full] = send(new DeltaSender('s1'), [0]);
    receiver.apply(full);
    expect(receiver.apply({ kind: 'delta', sessionId: 's1', seq: 2, rulesRevision: 1, delta: diffStates(world(5), world(5)) }).state).toBeNull(); // sem base
  });

  it('delta de sessão desconhecida (convidado novo) pede ressync', () => {
    const [, second] = send(new DeltaSender('s1'), [0, 1]);
    expect(new DeltaReceiver().apply(second)).toMatchObject({ state: null, needsResync: true });
  });

  it('a configuração precede o estado: mudar as regras força quadro completo e delta com revisão antiga é recusado', () => {
    const sender = new DeltaSender('s1');
    const receiver = new DeltaReceiver();
    receiver.apply(sender.next(world(20, 0), rulesRevisionOf(world(20))));
    const rules = { version: 1, units: { soldier: { maxHealth: 200 } } } as unknown as GameState['ruleSettings'];
    const changed = sender.next(world(20, 1, rules), rulesRevisionOf(world(20, 1, rules)));
    expect(changed.kind).toBe('full');
    expect(receiver.apply(changed).state?.ruleSettings).toEqual(rules);
    const stale: SnapshotPacket = { kind: 'delta', sessionId: 's1', seq: changed.seq + 1, base: changed.seq, rulesRevision: 12345, delta: diffStates(world(20), world(20)) };
    expect(receiver.apply(stale)).toMatchObject({ state: null, needsResync: true });
  });

  it('um quadro completo periódico limita a deriva', () => {
    const sender = new DeltaSender('s1');
    const kinds = Array.from({ length: KEYFRAME_EVERY + 2 }, (_, i) => sender.next(world(5, i), 1).kind);
    expect(kinds[0]).toBe('full');
    expect(kinds.slice(1, KEYFRAME_EVERY + 1).every((kind) => kind === 'delta')).toBe(true);
    expect(kinds[KEYFRAME_EVERY + 1]).toBe('full');
  });
});

describe('medição de bytes (300 unidades, 200 recursos, 5% se mexendo)', () => {
  it('o delta é bem menor que o quadro completo, na mesma carga', () => {
    const sender = new DeltaSender('s1');
    const full = sender.next(world(300, 0), 1);
    const delta = sender.next(world(300, 1), 1);
    const fullBytes = Buffer.byteLength(JSON.stringify(full));
    const deltaBytes = Buffer.byteLength(JSON.stringify(delta));
    const saving = 1 - deltaBytes / fullBytes;
    // Registrado, não prometido: a economia depende da carga (aqui 5% das unidades mudam por tick).
    console.info(`snapshot completo ${fullBytes} B, delta ${deltaBytes} B, economia ${(saving * 100).toFixed(1)}%`);
    expect(deltaBytes).toBeLessThan(fullBytes * 0.25);
  });
});
