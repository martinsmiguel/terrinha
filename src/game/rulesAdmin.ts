import type { GameState, Unit, UnitType } from './model';
import {
  RULE_SETTINGS_VERSION, UNIT_ATTRIBUTES, parseRuleSettings, unitAttribute, type AdjustableUnitStat, type RuleSettings,
} from './unitAttributes';
import { rulesRevisionOf } from './snapshotDelta';

export const STATS: readonly AdjustableUnitStat[] = ['maxHealth', 'attackDamage', 'movePerTick', 'visionRadius'];
export const STAT_LABEL: Record<AdjustableUnitStat, string> = { maxHealth: 'Vida máxima', attackDamage: 'Dano', movePerTick: 'Velocidade (por passo)', visionRadius: 'Visão' };
export const STAT_UNIT: Record<AdjustableUnitStat, string> = { maxHealth: 'HP', attackDamage: 'HP por golpe', movePerTick: 'células por passo (20/s)', visionRadius: 'células' };
export const STAT_LIMITS: Record<AdjustableUnitStat, readonly [number, number]> = {
  maxHealth: [1, 10000], attackDamage: [0, 1000], movePerTick: [0.01, 2], visionRadius: [1, 60],
};
export const UNIT_TYPES = Object.keys(UNIT_ATTRIBUTES) as UnitType[];

export const emptyRules = (): RuleSettings => ({ version: RULE_SETTINGS_VERSION, units: {} });

/** Quem pode editar: só o host (e o jogo solo). O convidado consulta e exporta, nunca altera. */
export const canEditRules = (role: 'host' | 'client' | 'single'): boolean => role !== 'client';

export type RuleSource = 'padrão' | 'local' | 'sessão' | 'rascunho';

export interface RuleRow {
  unit: UnitType; stat: AdjustableUnitStat; base: number; value: number; source: RuleSource; min: number; max: number; unitLabel: string;
}

/**
 * Camadas, da mais fraca à mais forte: padrão → override local → sessão → rascunho (patch). Cada linha informa o valor efetivo,
 * a origem, o limite e a unidade.
 */
export function layeredRows(local: RuleSettings | undefined, session: RuleSettings | undefined, draft: RuleSettings | undefined): RuleRow[] {
  const rows: RuleRow[] = [];
  for (const unit of UNIT_TYPES) {
    for (const stat of STATS) {
      const base = UNIT_ATTRIBUTES[unit][stat];
      const layers: [RuleSource, number | undefined][] = [['local', local?.units[unit]?.[stat]], ['sessão', session?.units[unit]?.[stat]], ['rascunho', draft?.units[unit]?.[stat]]];
      let value = base; let source: RuleSource = 'padrão';
      for (const [name, v] of layers) if (v !== undefined) { value = v; source = name; }
      rows.push({ unit, stat, base, value, source, min: STAT_LIMITS[stat][0], max: STAT_LIMITS[stat][1], unitLabel: STAT_UNIT[stat] });
    }
  }
  return rows;
}

export interface RuleChange { unit: UnitType; stat: AdjustableUnitStat; from: number; to: number; impact: string }

const IMPACT: Record<AdjustableUnitStat, string> = {
  maxHealth: 'A vida atual de cada unidade mantém a fração (sem reviver); novas unidades já nascem com o valor novo.',
  attackDamage: 'Vale já no próximo golpe.',
  movePerTick: 'Vale já no próximo passo; rotas em cache seguem válidas.',
  visionRadius: 'Vale na próxima atualização de visão do host.',
};

/** Diferença entre as regras efetivas da sessão e o rascunho: o que mudaria se aplicado. */
export function diffRules(current: RuleSettings | undefined, draft: RuleSettings): RuleChange[] {
  const changes: RuleChange[] = [];
  for (const unit of UNIT_TYPES) {
    for (const stat of STATS) {
      const from = unitAttribute(unit, stat, current);
      const to = unitAttribute(unit, stat, draft);
      if (from !== to) changes.push({ unit, stat, from, to, impact: IMPACT[stat] });
    }
  }
  return changes;
}

/** Edita uma célula do rascunho com validação de limite; valor igual ao padrão remove o override. Não muta o original. */
export function setDraftValue(draft: RuleSettings, unit: UnitType, stat: AdjustableUnitStat, value: number): { draft: RuleSettings; error?: string } {
  const [min, max] = STAT_LIMITS[stat];
  if (!Number.isFinite(value) || value < min || value > max) return { draft, error: `${STAT_LABEL[stat]} deve ficar entre ${min} e ${max}.` };
  const units = { ...draft.units, [unit]: { ...draft.units[unit] } };
  if (value === UNIT_ATTRIBUTES[unit][stat]) delete units[unit]![stat]; else units[unit]![stat] = value;
  if (Object.keys(units[unit]!).length === 0) delete units[unit];
  return { draft: { version: RULE_SETTINGS_VERSION, units } };
}

export const exportRules = (settings: RuleSettings | undefined): string => JSON.stringify(settings ?? emptyRules(), null, 2);

/** Importa JSON pelo parser único (sem eval, sem URL): qualquer erro recusa tudo, nada é aplicado pela metade. */
export function importRules(text: string): { rules?: RuleSettings; error?: string } {
  try { return { rules: parseRuleSettings(JSON.parse(text)) }; }
  catch (error) { return { error: error instanceof Error ? error.message : 'JSON inválido.' }; }
}

function rescale<T extends Unit>(unit: T, changed: ReadonlySet<UnitType>, next: RuleSettings): T {
  const withPassengers = unit.passengers?.length ? { ...unit, passengers: unit.passengers.map((p) => rescale(p, changed, next)) } : unit;
  if (!changed.has(unit.type)) return withPassengers as T;
  const maxHealth = unitAttribute(unit.type, 'maxHealth', next);
  if (unit.health <= 0) return { ...withPassengers, maxHealth } as T; // não revive
  const fraction = unit.health / unit.maxHealth;
  return { ...withPassengers, maxHealth, health: Math.max(1, Math.round(fraction * maxHealth)) } as T;
}

export interface AppliedRules { state: GameState; revision: number; changes: RuleChange[] }

/**
 * Aplica o rascunho no host: vida conserva a fração sem reviver; custo/duração e filas não são tocados (só novas filas usam o
 * valor novo); porão, passageiros, posse e IDs ficam como estão. `rulesApplied` registra a revisão e o instante, e a revisão
 * muda `rulesRevisionOf`, o que força um quadro completo antes de qualquer delta (a configuração precede o estado).
 */
export function applyRules(state: GameState, draft: RuleSettings): AppliedRules {
  const changes = diffRules(state.ruleSettings, draft);
  const changedHp = new Set(changes.filter((c) => c.stat === 'maxHealth').map((c) => c.unit));
  const next: GameState = {
    ...state,
    ruleSettings: draft,
    units: changedHp.size === 0 ? state.units : state.units.map((unit) => rescale(unit, changedHp, draft)),
    rulesApplied: { revision: rulesRevisionOf({ ruleSettings: draft }), atElapsed: state.elapsed ?? 0 },
  };
  return { state: changes.length === 0 ? state : next, revision: next.rulesApplied!.revision, changes };
}

/** Reiniciar para o padrão aplica o rascunho vazio: devolve as regras, mas não desfaz o que as regras anteriores já causaram. */
export const resetRules = (state: GameState): AppliedRules => applyRules(state, emptyRules());

/** Mudanças que exigem reinício (semente, topologia e água estrutural) não passam por aqui. */
export const RESTART_REQUIRED = ['semente do mundo', 'tamanho do mundo', 'topologia das ilhas', 'água estrutural'] as const;
