import { describe, expect, it } from 'vitest';
import { HULL_RISE, WAVES, hullTilt, waveAt } from '../../src/game/waves';

const points: [number, number][] = [[0, 0], [12.5, 3], [40, 40], [100.25, 7.75], [768, 768]];
const times = [0, 1, 7.3, 60, 1234.5];

describe('superfície de Gerstner', () => {
  it('é determinística: mesmo (x, z, t) dá a mesma altura e normal', () => {
    for (const [x, z] of points) for (const t of times) expect(waveAt(x, z, t)).toEqual(waveAt(x, z, t));
  });

  it('a normal é unitária e aponta para cima; a altura fica dentro da soma das amplitudes', () => {
    const max = WAVES.reduce((sum, wave) => sum + wave.amplitude, 0);
    for (const [x, z] of points) for (const t of times) {
      const { height, normal } = waveAt(x, z, t);
      expect(Math.hypot(normal.x, normal.y, normal.z)).toBeCloseTo(1, 10);
      expect(normal.y).toBeGreaterThan(0.9);
      expect(Math.abs(height)).toBeLessThanOrEqual(max + 1e-12);
    }
  });

  it('a normal concorda com a derivada numérica da altura (erro < 1e-3)', () => {
    const h = 1e-4;
    for (const [x, z] of points.slice(0, 4)) for (const t of [0, 3.7, 55]) {
      const dx = (waveAt(x + h, z, t).height - waveAt(x - h, z, t).height) / (2 * h);
      const dz = (waveAt(x, z + h, t).height - waveAt(x, z - h, t).height) / (2 * h);
      const analytic = waveAt(x, z, t).normal;
      const numeric = { x: -dx, y: 1, z: -dz };
      const len = Math.hypot(numeric.x, numeric.y, numeric.z);
      // A normal analítica usa o fator de inclinação (steepness): compara a direção, não a escala.
      const cos = (analytic.x * numeric.x + analytic.y * numeric.y + analytic.z * numeric.z) / len;
      expect(1 - cos).toBeLessThan(1e-3);
    }
  });

  it('o tempo desloca a onda: mesma posição, tempos diferentes, alturas diferentes; o host e o convidado com o mesmo t concordam', () => {
    expect(waveAt(10, 10, 0).height).not.toBeCloseTo(waveAt(10, 10, 2).height, 4);
    const host = waveAt(33.3, 21.1, 98.6);
    const guest = waveAt(33.3, 21.1, 98.6); // mesmo `elapsed` do snapshot
    expect(guest).toEqual(host);
  });
});

describe('inclinação do casco (só visual)', () => {
  it('mar plano não inclina; inclinação segue a normal e é limitada', () => {
    expect(hullTilt({ x: 0, y: 1, z: 0 }, 1.2)).toEqual({ pitch: 0, roll: 0 });
    for (const [x, z] of points) for (const t of times) {
      const tilt = hullTilt(waveAt(x, z, t).normal, 0.7);
      expect(Math.abs(tilt.pitch)).toBeLessThan(0.45);
      expect(Math.abs(tilt.roll)).toBeLessThan(0.45);
    }
    expect(HULL_RISE).toBeLessThan(1);
  });

  it('a onda não entra na navegação: o módulo de ondas não é importado pelas regras da simulação', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of ['simulation.ts', 'bodyModel.ts', 'foundation.ts', 'tradeRoutes.ts', 'colonialTransport.ts']) {
      expect(readFileSync(new URL(`../../src/game/${file}`, import.meta.url), 'utf8')).not.toMatch(/from '\.\/waves'/);
    }
  });
});
