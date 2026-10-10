import { describe, expect, it } from 'vitest';
import { WORLD_SIZE_MAX, WORLD_SIZE_MIN, WORLD_SIZE_OPTIONS, parseWorldSize } from '../../src/game/worldConfig';

describe('configuração do mundo', () => {
  it('aceita inteiros dentro dos limites e cai no padrão para qualquer outra coisa', () => {
    expect(parseWorldSize(60)).toBe(60);
    expect(parseWorldSize(768)).toBe(768);
    expect(parseWorldSize(WORLD_SIZE_MAX)).toBe(WORLD_SIZE_MAX);
    for (const invalid of [59, 1025, 90.5, Number.NaN, Number.POSITIVE_INFINITY, '120', null, undefined, {}, -60]) {
      expect(parseWorldSize(invalid)).toBe(60);
    }
    expect(parseWorldSize('x', 192)).toBe(192);
  });

  it('as opções do lobby são válidas, crescentes e só o padrão está validado', () => {
    const sizes = WORLD_SIZE_OPTIONS.map((option) => option.size);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(sizes[0]).toBe(WORLD_SIZE_MIN);
    for (const option of WORLD_SIZE_OPTIONS) expect(parseWorldSize(option.size, -1)).toBe(option.size);
    expect(WORLD_SIZE_OPTIONS.filter((option) => option.status === 'validado').map((option) => option.size)).toEqual([60]);
  });
});
