import type { UnitType } from './model';

/** Valores autoritativos por passo de simulação (20 Hz). */
export interface UnitAttributes {
  maxHealth: number;
  attackDamage: number;
  movePerTick: number;
  attackRangeUnit: number;
  attackRangeBuilding: number;
  attackCooldownTicks: number;
  bodyRadius: number;
  visionRadius: number;
  canAttack: boolean;
}

export const UNIT_ATTRIBUTES: Readonly<Record<UnitType, Readonly<UnitAttributes>>> = {
  villager: { maxHealth: 100, attackDamage: 8, movePerTick: 0.16, attackRangeUnit: 1.2, attackRangeBuilding: 2.5, attackCooldownTicks: 8, bodyRadius: 0.45, visionRadius: 8, canAttack: true },
  soldier: { maxHealth: 150, attackDamage: 24, movePerTick: 0.2, attackRangeUnit: 4.5, attackRangeBuilding: 5.5, attackCooldownTicks: 12, bodyRadius: 0.45, visionRadius: 11, canAttack: true },
  cavalry: { maxHealth: 180, attackDamage: 32, movePerTick: 0.3, attackRangeUnit: 2.5, attackRangeBuilding: 3.5, attackCooldownTicks: 8, bodyRadius: 0.55, visionRadius: 8, canAttack: true },
  fishing_boat: { maxHealth: 220, attackDamage: 0, movePerTick: 0.16, attackRangeUnit: 0, attackRangeBuilding: 0, attackCooldownTicks: 20, bodyRadius: 0.8, visionRadius: 7, canAttack: false },
  trade_boat: { maxHealth: 220, attackDamage: 0, movePerTick: 0.16, attackRangeUnit: 0, attackRangeBuilding: 0, attackCooldownTicks: 20, bodyRadius: 0.8, visionRadius: 7, canAttack: false },
  wagon: { maxHealth: 300, attackDamage: 0, movePerTick: 0.16, attackRangeUnit: 0, attackRangeBuilding: 0, attackCooldownTicks: 20, bodyRadius: 0.8, visionRadius: 10, canAttack: false },
  colonial_transport: { maxHealth: 360, attackDamage: 0, movePerTick: 0.14, attackRangeUnit: 0, attackRangeBuilding: 0, attackCooldownTicks: 20, bodyRadius: 0.9, visionRadius: 7, canAttack: false },
  warship: { maxHealth: 300, attackDamage: 20, movePerTick: 0.16, attackRangeUnit: 7, attackRangeBuilding: 5, attackCooldownTicks: 16, bodyRadius: 0.8, visionRadius: 8, canAttack: true },
};

export const RULE_SETTINGS_VERSION = 1;
export type AdjustableUnitStat = 'maxHealth' | 'attackDamage' | 'movePerTick' | 'visionRadius';
export interface RuleSettings {
  version: typeof RULE_SETTINGS_VERSION;
  units: Partial<Record<UnitType, Partial<Record<AdjustableUnitStat, number>>>>;
}
const ADJUSTABLE_STATS: readonly AdjustableUnitStat[] = ['maxHealth', 'attackDamage', 'movePerTick', 'visionRadius'];
const LIMITS: Record<AdjustableUnitStat, readonly [number, number]> = {
  maxHealth: [1, 10000], attackDamage: [0, 1000], movePerTick: [0.01, 2], visionRadius: [1, 60],
};

/** Parser único para configurações vindas de JSON, UI ou código. Recusa chaves desconhecidas. */
export function parseRuleSettings(value: unknown): RuleSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('Settings must be an object');
  const root = value as Record<string, unknown>;
  if (root.version !== RULE_SETTINGS_VERSION || Object.keys(root).some((key) => !['version', 'units'].includes(key))) {
    throw new TypeError('Unsupported rule settings version or key');
  }
  if (typeof root.units !== 'object' || root.units === null || Array.isArray(root.units)) throw new TypeError('Units must be an object');
  const units: RuleSettings['units'] = {};
  for (const [type, raw] of Object.entries(root.units)) {
    if (!(type in UNIT_ATTRIBUTES) || typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new TypeError('Unknown unit or malformed override');
    }
    const entries = Object.entries(raw);
    const values: Partial<Record<AdjustableUnitStat, number>> = {};
    for (const [stat, amount] of entries) {
      if (!ADJUSTABLE_STATS.includes(stat as AdjustableUnitStat) || typeof amount !== 'number' || !Number.isFinite(amount)) {
        throw new TypeError('Unknown or non-finite unit attribute');
      }
      const key = stat as AdjustableUnitStat;
      const [min, max] = LIMITS[key];
      if (amount < min || amount > max) throw new RangeError('Unit attribute out of bounds');
      values[key] = amount;
    }
    units[type as UnitType] = values;
  }
  return { version: RULE_SETTINGS_VERSION, units };
}

export function unitAttribute(type: UnitType, stat: AdjustableUnitStat, settings?: RuleSettings): number {
  return settings?.units[type]?.[stat] ?? UNIT_ATTRIBUTES[type][stat];
}

/** Ordem única para modificadores planos e percentuais, sem resultados negativos. */
export function effectiveAttribute(base: number, flat: readonly number[] = [], percent: readonly number[] = []): number {
  if (![base, ...flat, ...percent].every(Number.isFinite)) throw new RangeError('Attribute modifiers must be finite');
  return Math.max(0, (base + flat.reduce((sum, value) => sum + value, 0)) *
    (1 + percent.reduce((sum, value) => sum + value, 0)));
}
