import type { Building, GameState, ResourceNode, Unit } from './model';

type Entity = Unit | Building | ResourceNode;

/** Campos da partida enviados por substituição quando mudam (pequenos e raramente alterados). */
const SCALAR_KEYS = ['playerResources', 'techs', 'match', 'localStocks', 'foundationKits', 'mapSeed', 'mapSize', 'ruleSettings'] as const;
type ScalarKey = (typeof SCALAR_KEYS)[number];

export interface EntityDelta<T> { upsert: T[]; remove: string[] }

export interface StateDelta {
  units: EntityDelta<Unit>;
  buildings: EntityDelta<Building>;
  resourceNodes: EntityDelta<ResourceNode>;
  fields: Partial<Pick<GameState, ScalarKey>>;
  /** Campos escalares que sumiram do estado (ex.: `match` removido). */
  removedFields: ScalarKey[];
}

export type SnapshotPacket =
  | { kind: 'full'; sessionId: string; seq: number; rulesRevision: number; state: GameState }
  | { kind: 'delta'; sessionId: string; seq: number; base: number; rulesRevision: number; delta: StateDelta };

const sameJson = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

function diffList<T extends Entity>(before: readonly T[], after: readonly T[]): EntityDelta<T> {
  const previous = new Map(before.map((entity) => [entity.id, entity]));
  const seen = new Set<string>();
  const upsert: T[] = [];
  for (const entity of after) {
    seen.add(entity.id);
    const old = previous.get(entity.id);
    if (!old || !sameJson(old, entity)) upsert.push(entity);
  }
  return { upsert, remove: before.filter((entity) => !seen.has(entity.id)).map((entity) => entity.id) };
}

export function diffStates(before: GameState, after: GameState): StateDelta {
  const fields: StateDelta['fields'] = {};
  const removedFields: ScalarKey[] = [];
  for (const key of SCALAR_KEYS) {
    if (sameJson(before[key], after[key])) continue;
    if (after[key] === undefined) removedFields.push(key);
    else (fields as Record<string, unknown>)[key] = after[key];
  }
  return { units: diffList(before.units, after.units), buildings: diffList(before.buildings, after.buildings), resourceNodes: diffList(before.resourceNodes, after.resourceNodes), fields, removedFields };
}

function applyList<T extends Entity>(current: readonly T[], change: EntityDelta<T>): T[] {
  const removed = new Set(change.remove);
  const replaced = new Map(change.upsert.map((entity) => [entity.id, entity]));
  const kept = current.filter((entity) => !removed.has(entity.id)).map((entity) => replaced.get(entity.id) ?? entity);
  const known = new Set(kept.map((entity) => entity.id));
  return [...kept, ...change.upsert.filter((entity) => !known.has(entity.id))];
}

export function applyDelta(state: GameState, delta: StateDelta): GameState {
  const next: GameState = {
    ...state,
    ...delta.fields,
    units: applyList(state.units, delta.units),
    buildings: applyList(state.buildings, delta.buildings),
    resourceNodes: applyList(state.resourceNodes, delta.resourceNodes),
  };
  for (const key of delta.removedFields) delete (next as unknown as Record<string, unknown>)[key];
  return next;
}

/** Quantos pacotes entre quadros completos (keyframe), para limitar a deriva se algo escapar. */
export const KEYFRAME_EVERY = 100;

/** Revisão das regras da sessão: muda quando `ruleSettings` muda. */
export function rulesRevisionOf(state: Pick<GameState, 'ruleSettings'>): number {
  const text = JSON.stringify(state.ruleSettings ?? null);
  let hash = 7;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return hash;
}

/** Lado do host: um emissor por destinatário, com a base do que o destinatário já recebeu. */
export class DeltaSender {
  private seq = 0;
  private last: GameState | null = null;
  private sinceFull = 0;
  private lastRevision = -1;
  private readonly sessionId: string;
  constructor(sessionId: string) { this.sessionId = sessionId; }

  /** Próximo pacote para este destinatário: completo na primeira vez, após ressync ou no keyframe; delta nos demais. */
  next(filtered: GameState, rulesRevision: number): SnapshotPacket {
    this.seq += 1;
    // Mudou a configuração de regras: vai um quadro completo (a configuração precede o estado que depende dela).
    const full = this.last === null || this.sinceFull >= KEYFRAME_EVERY || rulesRevision !== this.lastRevision;
    const packet: SnapshotPacket = full
      ? { kind: 'full', sessionId: this.sessionId, seq: this.seq, rulesRevision, state: filtered }
      : { kind: 'delta', sessionId: this.sessionId, seq: this.seq, base: this.seq - 1, rulesRevision, delta: diffStates(this.last!, filtered) };
    this.last = filtered;
    this.lastRevision = rulesRevision;
    this.sinceFull = full ? 0 : this.sinceFull + 1;
    return packet;
  }

  /** Pedido de ressincronização do destinatário: o próximo pacote vai completo. */
  resync(): void { this.last = null; }
}

export interface ReceiveResult { state: GameState | null; needsResync: boolean; reason?: string }

/** Lado do convidado: aplica na ordem, ignora duplicado e pede ressync em vez de adivinhar quando há buraco ou revisão desconhecida. */
export class DeltaReceiver {
  private state: GameState | null = null;
  private sessionId: string | null = null;
  private seq = 0;
  private rulesRevision = -1;

  apply(packet: unknown): ReceiveResult {
    const p = packet as Partial<SnapshotPacket> | null;
    if (!p || typeof p !== 'object' || typeof p.sessionId !== 'string' || typeof p.seq !== 'number' || typeof p.rulesRevision !== 'number') {
      return { state: null, needsResync: false, reason: 'pacote sem sessão, sequência ou revisão de regras' };
    }
    if (p.kind === 'full' && p.state) {
      if (p.sessionId === this.sessionId && p.seq <= this.seq) return { state: null, needsResync: false, reason: 'duplicado' };
      this.sessionId = p.sessionId; this.seq = p.seq; this.rulesRevision = p.rulesRevision; this.state = p.state;
      return { state: this.state, needsResync: false };
    }
    if (p.kind === 'delta' && p.delta && typeof (p as { base?: unknown }).base === 'number') {
      const base = (p as { base: number }).base;
      if (p.sessionId !== this.sessionId || !this.state) return { state: null, needsResync: true, reason: 'sessão desconhecida' };
      if (p.seq <= this.seq) return { state: null, needsResync: false, reason: 'duplicado' };
      if (base !== this.seq) return { state: null, needsResync: true, reason: 'buraco na sequência' };
      if (p.rulesRevision !== this.rulesRevision) return { state: null, needsResync: true, reason: 'revisão de regras diferente: a configuração precede o estado' };
      this.state = applyDelta(this.state, p.delta);
      this.seq = p.seq;
      return { state: this.state, needsResync: false };
    }
    return { state: null, needsResync: false, reason: 'pacote delta sem base ou sem conteúdo' };
  }
}
