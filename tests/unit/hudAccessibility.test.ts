import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HUD_ACCESSIBILITY, HUD_SCALE_MAX, HUD_SCALE_MIN, WCAG_AA, WCAG_AAA, applyBindings, checkBinding, clampScale, colorMatrixValues,
  contrastRatio, effectiveScale, hexToRgb as rgb, hotkeyId, perceivedDistance, restoreAccessibility,
} from '../../src/game/hudAccessibility';
import { HOTKEYS, findKeyCollisions, resolveHotkey } from '../../src/game/hotkeys';

describe('escala do HUD', () => {
  it('limita a 75-200% em passos de 5 e ignora valores inválidos', () => {
    expect(clampScale(10)).toBe(HUD_SCALE_MIN);
    expect(clampScale(999)).toBe(HUD_SCALE_MAX);
    expect(clampScale(112)).toBe(110);
    expect(clampScale(Number.NaN)).toBe(100);
  });
});

describe('contraste do HUD (tokens do Tailwind usados nos painéis)', () => {
  const backgrounds = { 'slate-950': '#020617', 'slate-900': '#0f172a', 'slate-800': '#1e293b' };
  it('o padrão cumpre AA no texto principal e AAA não vale para os textos secundários (decisão: AAA é opcional)', () => {
    for (const bg of Object.values(backgrounds)) expect(contrastRatio(rgb('#e2e8f0'), rgb(bg))).toBeGreaterThanOrEqual(WCAG_AAA); // slate-200
    expect(contrastRatio(rgb('#94a3b8'), rgb(backgrounds['slate-900']))).toBeGreaterThanOrEqual(WCAG_AA); // slate-400
    expect(contrastRatio(rgb('#94a3b8'), rgb(backgrounds['slate-900']))).toBeLessThan(WCAG_AAA); // por isso o modo alto contraste existe
  });
  it('o modo alto contraste leva os textos secundários e de alerta a AAA em todos os fundos', () => {
    // slate-400/500 -> slate-300 (#cbd5e1); red-400 -> red-300 (#fca5a5)
    for (const fg of ['#cbd5e1', '#fca5a5']) for (const bg of Object.values(backgrounds)) expect(contrastRatio(rgb(fg), rgb(bg)), `${fg} em ${bg}`).toBeGreaterThanOrEqual(WCAG_AAA);
  });
});

describe('perfis de daltonismo (validados por simulação)', () => {
  const green = rgb('#34d399'), red = rgb('#f87171');
  it('protanopia e deuteranopia: verde e vermelho ficam muito mais distinguíveis com a correção', () => {
    for (const profile of ['protanopia', 'deuteranopia'] as const) {
      const before = perceivedDistance(green, red, profile, false);
      const after = perceivedDistance(green, red, profile, true);
      expect(after, profile).toBeGreaterThan(before * 2);
    }
  });
  it('os pares de status do HUD continuam claramente distintos (ΔE ≥ 15) em todos os perfis, com a correção', () => {
    const status = ['#34d399', '#f87171', '#fbbf24', '#22d3ee', '#a78bfa'].map(rgb);
    for (const profile of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
      for (let i = 0; i < status.length; i += 1) for (let j = i + 1; j < status.length; j += 1) {
        expect(perceivedDistance(status[i], status[j], profile, true), `${profile} ${i}-${j}`).toBeGreaterThanOrEqual(15);
      }
    }
  });
  it('gera a matriz do filtro só para perfis com correção', () => {
    expect(colorMatrixValues('default')).toBeNull();
    for (const profile of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
      expect(colorMatrixValues(profile)!.split(' ')).toHaveLength(20);
    }
  });
});

describe('remapeamento de teclas', () => {
  const id = (key: string, scope = 'global') => hotkeyId(HOTKEYS.find((d) => d.key === key && d.scope.type === scope)!);

  it('todo atalho tem id único', () => {
    expect(new Set(HOTKEYS.map(hotkeyId)).size).toBe(HOTKEYS.length);
  });
  it('aceita uma tecla livre e a aplica no registro e no resolvedor', () => {
    const lock = id('l');
    expect(checkBinding(lock, 'N', {})).toEqual({ ok: true });
    const defs = applyBindings({ [lock]: 'n' });
    const context = { overlays: [], hasVillagerSelected: false, selectedBuilding: null, buildMode: false };
    expect(resolveHotkey({ key: 'n' }, context, defs)).toEqual({ kind: 'toggle-camera-lock' });
    expect(resolveHotkey({ key: 'l' }, context, defs)).toBeNull();
  });
  it('recusa teclas reservadas, da câmera, compostas e conflitantes', () => {
    const lock = id('l');
    expect(checkBinding(lock, 'Escape', {})).toMatchObject({ ok: false });
    expect(checkBinding(lock, 'w', {})).toMatchObject({ ok: false });
    expect(checkBinding(lock, 'ArrowUp', {})).toMatchObject({ ok: false });
    expect(checkBinding(lock, 'ab', {})).toMatchObject({ ok: false });
    expect(checkBinding(lock, 'c', {})).toMatchObject({ ok: false }); // 'c' alterna o HUD compacto (global)
    expect(checkBinding('global/nao-existe', 'n', {})).toMatchObject({ ok: false });
  });
  it('permite a mesma tecla em escopos que nunca estão ativos juntos', () => {
    const train = HOTKEYS.find((d) => d.scope.type === 'building' && d.scope.building === 'barracks' && d.key === 's')!;
    expect(checkBinding(hotkeyId(train), 'p', {})).toEqual({ ok: true }); // 'p' é do cais, o quartel é outro escopo
  });
  it('um conjunto aceito nunca introduz colisão nova', () => {
    const bindings = { [id('l')]: 'n', [id('h')]: 'o' };
    expect(findKeyCollisions(applyBindings(bindings)).map(([a, b]) => [a.key, b.key])).toEqual(findKeyCollisions().map(([a, b]) => [a.key, b.key]));
  });
});

describe('persistência validada', () => {
  it('restaura o que é válido e descarta o resto', () => {
    const lock = hotkeyId(HOTKEYS.find((d) => d.key === 'l')!);
    const restored = restoreAccessibility({
      scale: 250, highContrast: true, colorProfile: 'deuteranopia',
      bindings: { [lock]: 'N', 'global/inexistente': 'x', [hotkeyId(HOTKEYS.find((d) => d.key === 'h')!)]: 'escape' },
    });
    expect(restored).toEqual({ scale: 200, highContrast: true, colorProfile: 'deuteranopia', bindings: { [lock]: 'n' } });
  });
  it('entrada inválida volta ao padrão', () => {
    expect(restoreAccessibility(null)).toEqual(DEFAULT_HUD_ACCESSIBILITY);
    expect(restoreAccessibility({ scale: 'x', colorProfile: 'azul', bindings: 5 })).toEqual(DEFAULT_HUD_ACCESSIBILITY);
  });
});

describe('escala efetiva por largura de tela', () => {
  it('nunca deixa a largura em unidades do HUD abaixo da referência de 375', () => {
    expect(effectiveScale(200, 1920)).toBe(200);
    expect(effectiveScale(200, 1366)).toBe(200);
    expect(effectiveScale(200, 414)).toBe(110);
    expect(effectiveScale(200, 375)).toBe(100);
    expect(effectiveScale(75, 375)).toBe(75);
    for (const width of [375, 414, 1366, 1920]) for (const scale of [75, 100, 150, 200]) {
      const applied = effectiveScale(scale, width);
      expect(width / (applied / 100)).toBeGreaterThanOrEqual(375);
      expect(applied).toBeGreaterThanOrEqual(HUD_SCALE_MIN);
    }
  });
});
