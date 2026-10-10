import type { BuildingType as BuildableType } from './buildingCatalog';
import type { BuildingType, UnitType } from './model';

/** Overlays modais, na ordem em que foram abertos (o último é o mais recente). */
export type OverlayId = 'world-map' | 'work-zone' | 'empire-catalog' | 'controls' | 'tutorial' | 'palette' | 'talents' | 'rules' | 'batch';

export type SquadFormation = 'box' | 'line' | 'spread';

export type HotkeyAction =
  | { kind: 'close-overlay'; overlay: OverlayId }
  | { kind: 'cancel' }
  | { kind: 'toggle-camera-lock' }
  | { kind: 'toggle-hud-compact' }
  | { kind: 'toggle-hud-hidden' }
  | { kind: 'cycle-hud-composition' }
  | { kind: 'toggle-hud-panel' }
  | { kind: 'open-palette' }
  | { kind: 'toggle-talents' }
  | { kind: 'toggle-rules' }
  | { kind: 'hud-undo' }
  | { kind: 'hud-redo' }
  | { kind: 'toggle-minimap' }
  | { kind: 'toggle-empire-catalog' }
  | { kind: 'toggle-work-zones' }
  | { kind: 'center-camera' }
  | { kind: 'formation'; formation: SquadFormation }
  | { kind: 'build'; building: BuildableType }
  | { kind: 'train'; unit: UnitType };

/** Onde o atalho vale. Escopos de edifícios diferentes nunca estão ativos juntos. */
export type HotkeyScope =
  | { type: 'global' }
  | { type: 'villager' }
  | { type: 'building'; building: BuildingType };

export interface HotkeyDefinition {
  key: string;
  scope: HotkeyScope;
  action: HotkeyAction;
  description: string;
  /** Escopo mais específico vence o global na mesma tecla. */
  priority: number;
}

const global = (key: string, action: HotkeyAction, description: string): HotkeyDefinition =>
  ({ key, scope: { type: 'global' }, action, description, priority: 0 });
const villager = (key: string, building: BuildableType, description: string): HotkeyDefinition =>
  ({ key, scope: { type: 'villager' }, action: { kind: 'build', building }, description, priority: 1 });
const train = (building: BuildingType, key: string, unit: UnitType, description: string): HotkeyDefinition =>
  ({ key, scope: { type: 'building', building }, action: { kind: 'train', unit }, description, priority: 2 });

/** Fonte única dos atalhos de jogo. Câmera (WASD/setas) é tratada pelo engine. */
export const HOTKEYS: readonly HotkeyDefinition[] = [
  global('l', { kind: 'toggle-camera-lock' }, 'Travar/destravar câmera'),
  global('c', { kind: 'toggle-hud-compact' }, 'Alternar HUD completo e compacto'),
  global('h', { kind: 'toggle-hud-hidden' }, 'Mostrar/ocultar HUD'),
  global('i', { kind: 'cycle-hud-composition' }, 'Alternar composição do HUD (mapa, exploração, gestão)'),
  global('j', { kind: 'toggle-hud-panel' }, 'Abrir/fechar painel contextual do HUD'),
  global('m', { kind: 'toggle-minimap' }, 'Recolher/expandir minimapa'),
  global('k', { kind: 'toggle-empire-catalog' }, 'Abrir/fechar catálogo do império'),
  global('z', { kind: 'toggle-work-zones' }, 'Abrir/fechar zonas de trabalho'),
  global('1', { kind: 'formation', formation: 'box' }, 'Formação em caixa'),
  global('2', { kind: 'formation', formation: 'line' }, 'Formação em linha'),
  global('3', { kind: 'formation', formation: 'spread' }, 'Formação dispersa'),
  global(' ', { kind: 'center-camera' }, 'Centralizar câmera'),
  villager('q', 'house', 'Construir casa'),
  villager('w', 'barracks', 'Construir quartel'),
  villager('e', 'tower', 'Construir torre'),
  villager('r', 'sawmill', 'Construir serralheria'),
  villager('t', 'mine', 'Construir mineradora'),
  villager('y', 'market', 'Construir mercado'),
  villager('f', 'farm', 'Construir fazenda'),
  villager('b', 'dock', 'Construir cais'),
  villager('u', 'outpost', 'Construir posto avançado'),
  train('town_center', 'v', 'villager', 'Treinar aldeão'),
  train('barracks', 's', 'soldier', 'Treinar soldado'),
  train('barracks', 'g', 'cavalry', 'Treinar cavalaria'),
  train('dock', 'p', 'fishing_boat', 'Treinar barco de pesca'),
  train('dock', 'm', 'trade_boat', 'Treinar barco mercante'),
  train('dock', 'g', 'warship', 'Treinar barco de guerra'),
  train('dock', 'x', 'colonial_transport', 'Treinar transporte colonial'),
];

/**
 * Colisões de tecla resolvidas por prioridade, declaradas de propósito.
 * Com o cais próprio e concluído selecionado, `M` treina o barco mercante e não
 * alterna o minimapa; o botão do minimapa continua disponível.
 */
export const RESOLVED_CONFLICTS: readonly { key: string; winner: HotkeyAction; loser: HotkeyAction; note: string }[] = [
  {
    key: 'm',
    winner: { kind: 'train', unit: 'trade_boat' },
    loser: { kind: 'toggle-minimap' },
    note: 'Cais selecionado: M treina o barco mercante; o minimapa usa o botão.',
  },
];

function scopesOverlap(a: HotkeyScope, b: HotkeyScope): boolean {
  if (a.type === 'building' && b.type === 'building') return a.building === b.building;
  return true;
}

/** Pares de atalhos que podem estar ativos juntos na mesma tecla. */
export function findKeyCollisions(defs: readonly HotkeyDefinition[] = HOTKEYS): [HotkeyDefinition, HotkeyDefinition][] {
  const found: [HotkeyDefinition, HotkeyDefinition][] = [];
  for (let i = 0; i < defs.length; i += 1) {
    for (let j = i + 1; j < defs.length; j += 1) {
      if (defs[i].key === defs[j].key && scopesOverlap(defs[i].scope, defs[j].scope)) found.push([defs[i], defs[j]]);
    }
  }
  return found;
}

export interface HotkeyTarget {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?(name: string): string | null;
}

export interface HotkeyEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  target?: object | null;
}

export interface HotkeyContext {
  /** Overlays abertos, do mais antigo ao mais recente. */
  overlays: readonly OverlayId[];
  hasVillagerSelected: boolean;
  /** Edifício próprio, concluído e selecionado. */
  selectedBuilding: BuildingType | null;
  buildMode: boolean;
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const ACTIVATABLE_TAGS = new Set(['BUTTON', 'A', 'SUMMARY']);

/** Controles que usam o teclado nativamente: texto, listas e contenteditable. */
export function isEditableTarget(raw: object | null | undefined): boolean {
  const target = raw as HotkeyTarget | null | undefined;
  if (!target) return false;
  if (target.isContentEditable) return true;
  return EDITABLE_TAGS.has((target.tagName ?? '').toUpperCase());
}

function isActivatable(raw: object | null | undefined): boolean {
  const target = raw as HotkeyTarget | null | undefined;
  if (!target) return false;
  if (ACTIVATABLE_TAGS.has((target.tagName ?? '').toUpperCase())) return true;
  const role = target.getAttribute?.('role');
  return role === 'button' || role === 'link' || role === 'switch' || role === 'checkbox' || role === 'tab';
}

/** Eventos que o jogo não deve interpretar: combinações do sistema e controles nativos. */
export function isNativeKeyboardEvent(event: HotkeyEventLike): boolean {
  return Boolean(event.ctrlKey || event.metaKey || event.altKey) || isEditableTarget(event.target);
}

/**
 * Resolve uma tecla em no máximo uma ação. Com overlay aberto só o Esc age, e fecha
 * apenas o mais recente: seleção e ordens da partida não são tocadas.
 */
export function resolveHotkey(event: HotkeyEventLike, context: HotkeyContext, definitions: readonly HotkeyDefinition[] = HOTKEYS): HotkeyAction | null {
  // Alt+R abre as regras da sessão (consulta para todos; edição só do host).
  if (event.key.toLowerCase() === 'r' && event.altKey && !event.ctrlKey && !event.metaKey && !isEditableTarget(event.target) && context.overlays.length === 0) {
    return { kind: 'toggle-rules' };
  }
  // Alt+T abre/fecha os talentos (Alt não colide com as teclas de jogo, como o P da pesca); com overlay aberto só o Esc age.
  if (event.key.toLowerCase() === 't' && event.altKey && !event.ctrlKey && !event.metaKey && !isEditableTarget(event.target) && context.overlays.length === 0) {
    return { kind: 'toggle-talents' };
  }
  // Ctrl/Cmd+K abre a busca, mesmo a partir de um botão; em campo de texto e com overlay aberto não age.
  if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey) && !event.altKey && !isEditableTarget(event.target) && context.overlays.length === 0) {
    return { kind: 'open-palette' };
  }
  // Desfazer/refazer do HUD: Ctrl/Cmd+Z e Ctrl/Cmd+Shift+Z. Só em jogo (sem overlay), fora de campos de texto, e só configuração.
  if (event.key.toLowerCase() === 'z' && (event.ctrlKey || event.metaKey) && !event.altKey && !isEditableTarget(event.target) && context.overlays.length === 0) {
    return { kind: event.shiftKey ? 'hud-redo' : 'hud-undo' };
  }
  if (isNativeKeyboardEvent(event)) return null;

  if (context.overlays.length > 0) {
    if (event.key !== 'Escape') return null;
    return { kind: 'close-overlay', overlay: context.overlays[context.overlays.length - 1] };
  }

  if (event.key === 'Escape') return { kind: 'cancel' };

  // Espaço e Enter ativam botões e links focados; o atalho de câmera não os rouba.
  if ((event.key === ' ' || event.key === 'Enter') && isActivatable(event.target)) return null;

  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  let best: HotkeyDefinition | null = null;
  for (const def of definitions) {
    if (def.key !== key) continue;
    if (def.scope.type === 'villager' && !(context.hasVillagerSelected && !context.buildMode)) continue;
    if (def.scope.type === 'building' && def.scope.building !== context.selectedBuilding) continue;
    if (!best || def.priority > best.priority) best = def;
  }
  return best?.action ?? null;
}

/** Mantém a ordem de abertura: remove o que fechou e acrescenta o que abriu ao fim. */
export function syncOverlayOrder(previous: readonly OverlayId[], open: ReadonlySet<OverlayId>): OverlayId[] {
  const kept = previous.filter((id) => open.has(id));
  const added = [...open].filter((id) => !kept.includes(id));
  return [...kept, ...added];
}
