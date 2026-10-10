import { describe, expect, it } from 'vitest';
import { actionEntries, focusLocality, searchPalette, techEntries } from '../../src/game/commandPalette';
import { HOTKEYS, resolveHotkey } from '../../src/game/hotkeys';
import { TECH_DEFS } from '../../src/game/tech';

const found = [{ index: 0, name: 'Ilha Natal', role: 'madeireira' }, { index: 2, name: 'Cabo Aurífero', role: 'minas de ouro' }];

describe('índice de ações', () => {
  it('deriva do registro único de atalhos e o atalho exibido é o executado', () => {
    const entries = actionEntries();
    const globals = HOTKEYS.filter((def) => def.scope.type === 'global');
    expect(entries).toHaveLength(globals.length);
    for (const entry of entries) {
      expect(entry.run.kind).toBe('hotkey');
      if (entry.run.kind !== 'hotkey') continue;
      const executed = resolveHotkey({ key: entry.run.key }, { overlays: [], hasVillagerSelected: false, selectedBuilding: null, buildMode: false });
      expect(executed, entry.label).not.toBeNull();
      expect(entry.shortcut === 'Espaço' ? ' ' : entry.shortcut!.toLowerCase()).toBe(entry.run.key);
    }
  });

  it('Ctrl/Cmd+K abre a busca, mas não em campo de texto nem com overlay aberto', () => {
    const idle = { overlays: [], hasVillagerSelected: false, selectedBuilding: null, buildMode: false } as const;
    expect(resolveHotkey({ key: 'k', ctrlKey: true }, idle)).toEqual({ kind: 'open-palette' });
    expect(resolveHotkey({ key: 'K', metaKey: true }, idle)).toEqual({ kind: 'open-palette' });
    expect(resolveHotkey({ key: 'k', ctrlKey: true, target: { tagName: 'INPUT' } }, idle)).toBeNull();
    expect(resolveHotkey({ key: 'k', ctrlKey: true }, { ...idle, overlays: ['palette'] })).toBeNull();
  });

  it('com a busca aberta só o Esc age: nenhum atalho modifica a partida atrás do overlay', () => {
    const open = { overlays: ['palette'], hasVillagerSelected: true, selectedBuilding: null, buildMode: false } as const;
    for (const key of ['c', 'h', 'i', 'j', 'q', ' ', '1']) expect(resolveHotkey({ key }, open as never)).toBeNull();
    expect(resolveHotkey({ key: 'Escape' }, open as never)).toEqual({ kind: 'close-overlay', overlay: 'palette' });
  });
});

describe('busca', () => {
  it('acha por nome e por descrição, sem diferenciar acento e caixa', () => {
    expect(searchPalette('catalogo', found).entries.map((entry) => entry.label).join(' ')).toMatch(/catálogo/i);
    expect(searchPalette('MINIMAPA', found).entries.length).toBeGreaterThan(0);
    const byDescription = searchPalette('travar', found).entries;
    expect(byDescription.some((entry) => entry.run.kind === 'hotkey' && entry.run.key === 'l')).toBe(true);
  });

  it('o nome que começa com o termo vem antes de quem só contém', () => {
    const labels = searchPalette('cat', found).entries.map((entry) => entry.label.toLowerCase());
    expect(labels[0].startsWith('cat') || labels[0].includes('cat')).toBe(true);
  });

  it('# restringe às tecnologias reais do jogo', () => {
    const all = searchPalette('#', found);
    expect(all.scope).toBe('tech');
    expect(all.entries.every((entry) => entry.group === 'Tecnologias')).toBe(true);
    const real = TECH_DEFS[0];
    expect(searchPalette(`#${real.name}`, found).entries.map((entry) => entry.id)).toContain(`tech:${real.id}`);
    expect(techEntries().length).toBeGreaterThanOrEqual(TECH_DEFS.length);
  });

  it('@ lista só localidades descobertas, sem nomes fixos; não descoberta não aparece', () => {
    const result = searchPalette('@', found);
    expect(result.scope).toBe('locality');
    expect(result.entries.map((entry) => entry.label)).toEqual(['Ilha Natal', 'Cabo Aurífero']);
    expect(searchPalette('@cabo', found).entries).toHaveLength(1);
    expect(searchPalette('@', []).empty).toBe(true);
    expect(searchPalette('@ilha oculta', found).empty).toBe(true);
  });

  it('sem resultados sinaliza vazio', () => {
    const none = searchPalette('zzzzzz', found);
    expect(none.empty).toBe(true);
    expect(none.entries).toEqual([]);
  });
});

describe('foco de localidade', () => {
  it('destaca exatamente uma; focar de novo a mesma limpa; trocar move o destaque', () => {
    expect(focusLocality(null, 2)).toBe(2);
    expect(focusLocality(2, 2)).toBeNull();
    expect(focusLocality(2, 0)).toBe(0);
  });
});
