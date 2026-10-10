import { describe, expect, it } from 'vitest';
import { nextFocusIndex } from '../../src/game/focusTrap';

describe('nextFocusIndex', () => {
  it('cicla para frente e para trás sem sair do diálogo', () => {
    expect(nextFocusIndex(0, 3, false)).toBe(1);
    expect(nextFocusIndex(2, 3, false)).toBe(0);
    expect(nextFocusIndex(0, 3, true)).toBe(2);
    expect(nextFocusIndex(1, 3, true)).toBe(0);
  });
  it('foco fora do diálogo entra pelo primeiro ou pelo último item', () => {
    expect(nextFocusIndex(-1, 3, false)).toBe(0);
    expect(nextFocusIndex(-1, 3, true)).toBe(2);
    expect(nextFocusIndex(7, 3, false)).toBe(0);
  });
  it('sem itens focáveis não há destino', () => {
    expect(nextFocusIndex(-1, 0, false)).toBe(-1);
  });
});
