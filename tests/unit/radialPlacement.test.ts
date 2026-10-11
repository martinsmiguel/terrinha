import { describe, expect, it } from 'vitest';
import {
  MAX_AREA_FRACTION, RADIAL_COMMANDS, VIEWPORTS, altKeyTaken, chromeRects, cursorAnchors, freeAltLetters, itemOffsets, itemSize, measureAll,
  minimumDiameter, placeRadial, radialDiameter, summarize, type Rect,
} from '../../src/game/radialPlacement';

describe('diâmetro e área do radial', () => {
  it('ocupa menos de 20% da tela em todas as resoluções previstas', () => {
    for (const view of VIEWPORTS) {
      const d = radialDiameter(view);
      expect((Math.PI * (d / 2) ** 2) / (view.width * view.height), view.name).toBeLessThan(MAX_AREA_FRACTION);
    }
  });

  it('o diâmetro mínimo acomoda seis alvos de 44 px sem se tocarem', () => {
    const d = minimumDiameter();
    expect(itemSize(d)).toBeGreaterThanOrEqual(44);
    for (const view of VIEWPORTS) expect(radialDiameter(view), view.name).toBeGreaterThanOrEqual(d);
  });

  it('os comandos do anel não se sobrepõem', () => {
    for (const view of VIEWPORTS) {
      const d = radialDiameter(view);
      const size = itemSize(d);
      const offsets = itemOffsets(d);
      expect(offsets).toHaveLength(RADIAL_COMMANDS.length);
      for (let i = 0; i < offsets.length; i += 1) {
        const next = offsets[(i + 1) % offsets.length];
        expect(Math.hypot(offsets[i].x - next.x, offsets[i].y - next.y), view.name).toBeGreaterThanOrEqual(size);
      }
    }
  });
});

describe('posicionamento perto do cursor (modelo do chrome do HUD)', () => {
  it('em toda resolução, âncora de cursor e com o painel aberto ou fechado, o radial cabe sem cobrir o chrome e respeita a viewport', () => {
    const rows = measureAll();
    expect(rows).toHaveLength(VIEWPORTS.length * 2 * 9);
    for (const row of rows) {
      expect(row.fits, `${row.viewport} ${row.anchor} painel=${row.panelOpen}: cobre ${row.covers.join(',')}`).toBe(true);
      expect(row.areaPercent).toBeLessThan(MAX_AREA_FRACTION * 100);
      expect(row.smallestItem).toBeGreaterThanOrEqual(44);
    }
    expect(summarize(rows).every((s) => s.areaOk && s.fit === s.measured)).toBe(true);
  });

  it('o centro nunca deixa a caixa fora da viewport, mesmo com o cursor num canto', () => {
    for (const view of VIEWPORTS) {
      for (const { point } of cursorAnchors(view)) {
        const placed = placeRadial(view, point, chromeRects(view));
        const r = placed.diameter / 2;
        expect(placed.center.x - r).toBeGreaterThanOrEqual(0);
        expect(placed.center.y - r).toBeGreaterThanOrEqual(0);
        expect(placed.center.x + r).toBeLessThanOrEqual(view.width);
        expect(placed.center.y + r).toBeLessThanOrEqual(view.height);
      }
    }
  });

  it('abre no próprio cursor quando há espaço livre', () => {
    const view = VIEWPORTS[0];
    const placed = placeRadial(view, { x: 960, y: 540 }, chromeRects(view));
    expect(placed.moved).toBe(false);
    expect(placed.center).toEqual({ x: 960, y: 540 });
  });

  it('CONTROLE NEGATIVO: com uma âncora que cobre a tela inteira, reporta que não coube e quais âncoras cobre', () => {
    const view = VIEWPORTS[3];
    const wall: Rect = { id: 'parede', left: 0, top: 0, right: view.width, bottom: view.height };
    const placed = placeRadial(view, { x: 100, y: 100 }, [wall]);
    expect(placed.fits).toBe(false);
    expect(placed.covers).toContain('parede');
  });

  it('CONTROLE NEGATIVO: a faixa livre mais estreita que o diâmetro mínimo não finge caber', () => {
    const view = VIEWPORTS[2];
    const bands: Rect[] = [
      { id: 'esquerda', left: 0, top: 0, right: 150, bottom: view.height },
      { id: 'direita', left: view.width - 150, top: 0, right: view.width, bottom: view.height },
    ];
    expect(placeRadial(view, { x: 207, y: 448 }, bands).fits).toBe(false);
  });
});

describe('atalho de abertura (consultado no resolvedor real de atalhos)', () => {
  it('Alt+R, sugestão original do card, colide com as regras da sessão (#88); Alt+T com os talentos', () => {
    expect(altKeyTaken('r')).toBe(true);
    expect(altKeyTaken('t')).toBe(true);
  });

  it('há letras livres para Alt+letra', () => {
    const free = freeAltLetters();
    expect(free).toContain('q');
    expect(free).not.toContain('r');
    expect(free).not.toContain('t');
  });
});
