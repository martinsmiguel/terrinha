import { describe, expect, it } from 'vitest';
import {
  HOTKEYS, RESOLVED_CONFLICTS, findKeyCollisions, isNativeKeyboardEvent, resolveHotkey,
  type HotkeyContext, type HotkeyEventLike, type OverlayId,
} from '../../src/game/hotkeys';

const idle: HotkeyContext = { overlays: [], hasVillagerSelected: false, selectedBuilding: null, buildMode: false };
const press = (key: string, extra: Partial<HotkeyEventLike> = {}): HotkeyEventLike => ({ key, ...extra });

describe('registro de atalhos', () => {
  it('só tem colisões de tecla declaradas e resolvidas por prioridade', () => {
    const collisions = findKeyCollisions();
    const declared = new Set(RESOLVED_CONFLICTS.map((item) => item.key));
    for (const [a, b] of collisions) {
      expect(declared.has(a.key)).toBe(true);
      expect(a.priority).not.toBe(b.priority);
    }
    expect(collisions.length).toBe(RESOLVED_CONFLICTS.length);
  });

  it('M treina o barco mercante com cais selecionado e recolhe o minimapa nos demais casos', () => {
    expect(resolveHotkey(press('m'), idle)).toEqual({ kind: 'toggle-minimap' });
    expect(resolveHotkey(press('M'), { ...idle, selectedBuilding: 'dock' }))
      .toEqual({ kind: 'train', unit: 'trade_boat' });
    expect(resolveHotkey(press('m'), { ...idle, selectedBuilding: 'barracks' })).toEqual({ kind: 'toggle-minimap' });
  });

  it('G escolhe cavalaria no quartel e barco de guerra no cais', () => {
    expect(resolveHotkey(press('g'), { ...idle, selectedBuilding: 'barracks' })).toEqual({ kind: 'train', unit: 'cavalry' });
    expect(resolveHotkey(press('g'), { ...idle, selectedBuilding: 'dock' })).toEqual({ kind: 'train', unit: 'warship' });
    expect(resolveHotkey(press('g'), idle)).toBeNull();
  });

  it('atalhos de construção exigem aldeão e ficam suspensos em modo de construção', () => {
    expect(resolveHotkey(press('q'), idle)).toBeNull();
    expect(resolveHotkey(press('q'), { ...idle, hasVillagerSelected: true })).toEqual({ kind: 'build', building: 'house' });
    expect(resolveHotkey(press('q'), { ...idle, hasVillagerSelected: true, buildMode: true })).toBeNull();
  });

  it('toda definição é alcançável pela tecla que declara', () => {
    for (const def of HOTKEYS) {
      const context: HotkeyContext = {
        ...idle,
        hasVillagerSelected: def.scope.type === 'villager',
        selectedBuilding: def.scope.type === 'building' ? def.scope.building : null,
      };
      expect(resolveHotkey(press(def.key), context)).toEqual(def.action);
    }
  });
});

describe('modificadores e controles nativos', () => {
  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)('%s não dispara comandos de jogo por coincidência de letra', (modifier) => {
    for (const key of ['c', 'l', 'h', 'm', 'k', 'z', '1', '2', '3', ' ']) {
      expect(resolveHotkey(press(key, { [modifier]: true }), idle)).toBeNull();
    }
    expect(resolveHotkey(press('q', { [modifier]: true }), { ...idle, hasVillagerSelected: true })).toBeNull();
    expect(resolveHotkey(press('Escape', { [modifier]: true }), idle)).toBeNull();
  });

  it('input, textarea, select e contenteditable mantêm o teclado nativo', () => {
    for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true }]) {
      expect(isNativeKeyboardEvent(press('c', { target }))).toBe(true);
      expect(resolveHotkey(press('c', { target }), idle)).toBeNull();
      expect(resolveHotkey(press('Escape', { target }), { ...idle, overlays: ['controls'] })).toBeNull();
    }
  });

  it('Espaço e Enter ativam botões focados em vez de centralizar a câmera', () => {
    const button = { tagName: 'BUTTON' };
    expect(resolveHotkey(press(' ', { target: button }), idle)).toBeNull();
    expect(resolveHotkey(press(' ', { target: { tagName: 'DIV', getAttribute: () => 'switch' } }), idle)).toBeNull();
    expect(resolveHotkey(press(' ', { target: { tagName: 'CANVAS' } }), idle)).toEqual({ kind: 'center-camera' });
    expect(resolveHotkey(press('c', { target: button }), idle)).toEqual({ kind: 'toggle-hud-compact' });
  });
});

describe('overlays abertos', () => {
  const overlayStates: { name: string; overlays: OverlayId[] }[] = [
    ['world-map'], ['work-zone'], ['empire-catalog'], ['controls'], ['tutorial'],
    ['empire-catalog', 'work-zone'], ['controls', 'tutorial', 'world-map'],
  ].map((overlays) => ({ name: overlays.join(' > '), overlays: overlays as OverlayId[] }));

  it.each(overlayStates)('bloqueia todos os atalhos de fundo ($name)', ({ overlays }) => {
    const context: HotkeyContext = { overlays, hasVillagerSelected: true, selectedBuilding: 'dock', buildMode: false };
    for (const def of HOTKEYS) expect(resolveHotkey(press(def.key), context)).toBeNull();
  });

  it.each(overlayStates)('Esc fecha apenas o overlay mais recente ($name)', ({ overlays }) => {
    const action = resolveHotkey(press('Escape'), { ...idle, overlays });
    expect(action).toEqual({ kind: 'close-overlay', overlay: overlays[overlays.length - 1] });
  });

  it('Esc sem overlay cancela construção ou seleção', () => {
    expect(resolveHotkey(press('Escape'), idle)).toEqual({ kind: 'cancel' });
  });
});
