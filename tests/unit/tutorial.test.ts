import { describe, expect, it } from 'vitest';
import { TUTORIAL_STEPS } from '../../src/components/Tutorial';

describe('tutorial de primeira partida', () => {
  it('cobre fundacao, selecao, movimento, coleta, construcao e combate', () => {
    expect(TUTORIAL_STEPS.map((step) => step.id)).toEqual([
      'fundacao',
      'selecao',
      'movimento',
      'coleta',
      'construcao',
      'combate',
    ]);
  });

  it('tem passos com titulo, icone e instrucoes curtas (cabe em 2 minutos)', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.icon).toBeTruthy();
      expect(step.lines.length).toBeGreaterThanOrEqual(3);
      for (const line of step.lines) {
        expect(line.length).toBeLessThanOrEqual(140);
      }
    }
  });
});
