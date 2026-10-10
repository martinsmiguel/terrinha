import { HOTKEYS } from './hotkeys';
import { TECH_DEFS, ERA_UPGRADES } from './tech';

export type PaletteRun =
  | { kind: 'hotkey'; key: string }
  | { kind: 'tech'; id: string }
  | { kind: 'locality'; index: number };

export interface PaletteEntry {
  id: string;
  group: 'Ações' | 'Tecnologias' | 'Localidades';
  label: string;
  description: string;
  /** Tecla exibida: vem do registro de atalhos, a mesma que o jogo executa. */
  shortcut?: string;
  run: PaletteRun;
}

export interface PaletteLocality { index: number; name: string; role: string }

/** Ações globais (as de menu/HUD) vindas do registro único de atalhos; as de edifício e aldeão só valem com seleção. */
export function actionEntries(): PaletteEntry[] {
  return HOTKEYS.filter((def) => def.scope.type === 'global').map((def) => ({
    id: `action:${def.key}`,
    group: 'Ações' as const,
    label: def.description,
    description: def.description,
    shortcut: def.key === ' ' ? 'Espaço' : def.key.toUpperCase(),
    run: { kind: 'hotkey' as const, key: def.key },
  }));
}

export function techEntries(): PaletteEntry[] {
  const techs = TECH_DEFS.map((tech) => ({
    id: `tech:${tech.id}`, group: 'Tecnologias' as const, label: tech.name, description: `${tech.category} · era ${tech.era}`, run: { kind: 'tech' as const, id: tech.id },
  }));
  const eras = ERA_UPGRADES.map((era) => ({
    id: `tech:era:${era.era}`, group: 'Tecnologias' as const, label: `Avanço de era: ${era.era}`, description: 'avanço de era', run: { kind: 'tech' as const, id: `era:${era.era}` },
  }));
  return [...techs, ...eras];
}

/** Só localidades JÁ descobertas entram: a lista vem do estado conhecido, sem nomes fixos. */
export function localityEntries(discovered: readonly PaletteLocality[]): PaletteEntry[] {
  return discovered.map((locality) => ({
    id: `locality:${locality.index}`, group: 'Localidades' as const, label: locality.name, description: locality.role, run: { kind: 'locality' as const, index: locality.index },
  }));
}

export const normalize = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export interface PaletteResult { entries: PaletteEntry[]; scope: 'all' | 'tech' | 'locality'; empty: boolean }

/**
 * Busca por nome e descrição. `#` restringe às tecnologias e `@` às localidades descobertas.
 * Nome que começa com o termo vem antes de nome que contém, antes de descrição que contém.
 */
export function searchPalette(query: string, discovered: readonly PaletteLocality[]): PaletteResult {
  const raw = query.trim();
  const scope: PaletteResult['scope'] = raw.startsWith('#') ? 'tech' : raw.startsWith('@') ? 'locality' : 'all';
  const term = normalize(scope === 'all' ? raw : raw.slice(1));
  const pool = scope === 'tech' ? techEntries() : scope === 'locality' ? localityEntries(discovered) : [...actionEntries(), ...techEntries(), ...localityEntries(discovered)];
  const scored = pool.map((entry) => {
    const label = normalize(entry.label);
    const description = normalize(entry.description);
    const score = term === '' ? 3 : label.startsWith(term) ? 0 : label.includes(term) ? 1 : description.includes(term) ? 2 : -1;
    return { entry, score };
  }).filter((item) => item.score >= 0).sort((a, b) => a.score - b.score);
  const entries = scored.map((item) => item.entry).slice(0, 30);
  return { entries, scope, empty: entries.length === 0 };
}

/** Focar uma localidade destaca exatamente um marcador; focar a mesma de novo limpa. */
export const focusLocality = (current: number | null, index: number): number | null => (current === index ? null : index);
