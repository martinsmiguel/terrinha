import { HOTKEYS } from './hotkeys';
import { TECH_DEFS, ERA_UPGRADES } from './tech';

export type PaletteRun =
  | { kind: 'hotkey'; key: string }
  | { kind: 'tech'; id: string }
  | { kind: 'locality'; index: number }
  /** Seleciona unidades (efeito explícito: muda a seleção). */
  | { kind: 'select'; ids: string[] }
  /** Ordens por comando de jogador; o host autoriza cada uma. Nada é executado pela busca em si. */
  | { kind: 'order'; commands: { type: 'gather'; unitId: string; targetId: string }[] };

export interface PaletteEntry {
  id: string;
  group: 'Ações' | 'Tecnologias' | 'Localidades' | 'Ordens';
  label: string;
  description: string;
  /** Tecla exibida: vem do registro de atalhos, a mesma que o jogo executa. */
  shortcut?: string;
  run: PaletteRun;
  /** Quando preenchido a entrada aparece, mas não executa: explica o que falta (erro, ausência ou pré-requisito). */
  disabledReason?: string;
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

export interface OrderContext {
  /** Aldeões próprios, vivos e ociosos. */
  idleVillagers: readonly { id: string; position: { x: number; z: number } }[];
  /** Recursos que o dono já explorou (nada fora do conhecido). */
  knownNodes: readonly { id: string; type: string; remaining: number; position: { x: number; z: number } }[];
}

const NODE_ORDERS: { type: string; label: string }[] = [
  { type: 'tree', label: 'madeira' }, { type: 'food_bush', label: 'comida' }, { type: 'gold_mine', label: 'ouro' }, { type: 'stone', label: 'pedra' },
];

/**
 * Ociosos e ordens: cada ordem declara alvo e efeito ("coletar madeira na árvore a N de distância") e leva os mesmos comandos
 * do jogador. Sem aldeões ociosos ou sem recurso conhecido a entrada existe, mas desabilitada, com a razão.
 */
export function orderEntries(context: OrderContext | undefined): PaletteEntry[] {
  if (!context) return [];
  const idle = context.idleVillagers;
  const entries: PaletteEntry[] = [{
    id: 'order:select-idle', group: 'Ordens', label: `Selecionar aldeões ociosos (${idle.length})`, description: 'efeito: troca a seleção pelos aldeões ociosos',
    run: { kind: 'select', ids: idle.map((v) => v.id) }, ...(idle.length === 0 ? { disabledReason: 'Não há aldeões ociosos.' } : {}),
  }];
  for (const { type, label } of NODE_ORDERS) {
    const base = idle[0]?.position;
    const candidates = context.knownNodes.filter((node) => node.type === type && node.remaining > 0);
    const nearest = base ? candidates.reduce<(typeof candidates)[number] | null>((best, node) => (!best || Math.hypot(node.position.x - base.x, node.position.z - base.z) < Math.hypot(best.position.x - base.x, best.position.z - base.z) ? node : best), null) : candidates[0] ?? null;
    const reason = idle.length === 0 ? 'Não há aldeões ociosos.' : !nearest ? `Nenhum recurso de ${label} conhecido: explore antes.` : undefined;
    const distance = nearest && base ? Math.round(Math.hypot(nearest.position.x - base.x, nearest.position.z - base.z)) : null;
    entries.push({
      id: `order:gather:${type}`, group: 'Ordens',
      label: `Coletar ${label}: ${idle.length} aldeão(ões) ocioso(s)${distance !== null ? ` → recurso a ${distance}` : ''}`,
      description: 'efeito: ordem de coleta; o host valida alvo conhecido',
      run: { kind: 'order', commands: nearest ? idle.map((villager) => ({ type: 'gather' as const, unitId: villager.id, targetId: nearest.id })) : [] },
      ...(reason ? { disabledReason: reason } : {}),
    });
  }
  return entries;
}

/** Só localidades JÁ descobertas entram: a lista vem do estado conhecido, sem nomes fixos. */
export function localityEntries(discovered: readonly PaletteLocality[]): PaletteEntry[] {
  return discovered.map((locality) => ({
    id: `locality:${locality.index}`, group: 'Localidades' as const, label: locality.name, description: locality.role, run: { kind: 'locality' as const, index: locality.index },
  }));
}

export const normalize = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export interface PaletteResult { entries: PaletteEntry[]; scope: 'all' | 'tech' | 'locality' | 'order'; empty: boolean }

/**
 * Busca por nome e descrição. `#` restringe às tecnologias e `@` às localidades descobertas.
 * Nome que começa com o termo vem antes de nome que contém, antes de descrição que contém.
 */
export function searchPalette(query: string, discovered: readonly PaletteLocality[], orders?: OrderContext): PaletteResult {
  const raw = query.trim();
  const scope: PaletteResult['scope'] = raw.startsWith('#') ? 'tech' : raw.startsWith('@') ? 'locality' : raw.startsWith('!') ? 'order' : 'all';
  const term = normalize(scope === 'all' ? raw : raw.slice(1));
  const pool = scope === 'tech' ? techEntries() : scope === 'locality' ? localityEntries(discovered) : scope === 'order' ? orderEntries(orders) : [...actionEntries(), ...orderEntries(orders), ...techEntries(), ...localityEntries(discovered)];
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
