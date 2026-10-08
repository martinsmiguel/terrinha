import { describe, expect, it } from 'vitest';
import { effectiveAttribute, parseRuleSettings, UNIT_ATTRIBUTES, unitAttribute } from '../../src/game/unitAttributes';

describe('unit attribute rules', () => {
  it('applies flat and percentage modifiers once, clamps negative results, and rejects invalid input', () => {
    expect(effectiveAttribute(10, [2, 3], [0.25, 0.1])).toBeCloseTo(20.25);
    expect(effectiveAttribute(10, [-20], [0.5])).toBe(0);
    expect(() => effectiveAttribute(10, [Number.NaN])).toThrow(RangeError);
    expect(() => effectiveAttribute(10, [], [Infinity])).toThrow(RangeError);
  });

  it('keeps civilian boats noncombatant and military spawn damage equal to effective base damage', () => {
    expect(UNIT_ATTRIBUTES.fishing_boat.canAttack).toBe(false);
    expect(UNIT_ATTRIBUTES.trade_boat.canAttack).toBe(false);
    expect(UNIT_ATTRIBUTES.soldier.attackDamage).toBe(24);
    expect(UNIT_ATTRIBUTES.cavalry.attackDamage).toBe(32);
  });

  it('accepts bounded versioned JSON overrides and rejects NaN, unknown keys and older versions', () => {
    const settings = parseRuleSettings({ version: 1, units: { soldier: { attackDamage: 30 } } });
    expect(unitAttribute('soldier', 'attackDamage', settings)).toBe(30);
    expect(unitAttribute('cavalry', 'attackDamage', settings)).toBe(32);
    expect(() => parseRuleSettings({ version: 0, units: {} })).toThrow();
    expect(() => parseRuleSettings({ version: 1, units: { soldier: { attackDamage: Infinity } } })).toThrow();
    expect(() => parseRuleSettings({ version: 1, units: { soldier: { unknown: 3 } } })).toThrow();
  });
});
