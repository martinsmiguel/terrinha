/**
 * Protótipo da personalização local do HUD (card #97): perfis de painéis sem conta, sem servidor e sem tocar a partida.
 * Tudo aqui é configuração de interface. Nada disto executa ordem de jogo nem altera estado de partida.
 */

export type PanelId = 'recursos' | 'trilho' | 'minimapa' | 'dock' | 'painel';
export const PANEL_IDS: readonly PanelId[] = ['recursos', 'trilho', 'minimapa', 'dock', 'painel'];
export const PANEL_LABEL: Record<PanelId, string> = {
  recursos: 'Recursos e população', trilho: 'Trilho de navegação', minimapa: 'Minimapa', dock: 'Seleção e ações', painel: 'Painel contextual',
};

/** Indicadores vitais: nunca somem nem ficam quase transparentes (alinhado a `VITAL_INDICATORS` do HUD integrado). */
export const ESSENTIAL_PANELS: readonly PanelId[] = ['recursos'];

export type Anchor = 'topo-esquerda' | 'topo' | 'topo-direita' | 'esquerda' | 'direita' | 'base-esquerda' | 'base' | 'base-direita';
export const ANCHORS: readonly Anchor[] = ['topo-esquerda', 'topo', 'topo-direita', 'esquerda', 'direita', 'base-esquerda', 'base', 'base-direita'];
export const GROUPS = ['A', 'B', 'C'] as const;
export type Group = (typeof GROUPS)[number];

export const SCALE_MIN = 0.75;
export const SCALE_MAX = 1.5;
export const OPACITY_MIN = 0.4;
export const OPACITY_ESSENTIAL_MIN = 0.8;
export const OFFSET_LIMIT = 240;
export const MAX_PROFILES = 8;
export const HISTORY_LIMIT = 20;
export const IMPORT_MAX_BYTES = 8 * 1024;
export const PROFILE_NAME_MAX = 24;

export interface PanelSetting {
  visible: boolean;
  anchor: Anchor;
  offsetX: number;
  offsetY: number;
  scale: number;
  opacity: number;
  /** Painéis do mesmo grupo aparecem e somem juntos. */
  group: Group | null;
}

export type PanelLayout = Record<PanelId, PanelSetting>;
export interface LayoutProfile { name: string; panels: PanelLayout }

const DEFAULT_ANCHOR: Record<PanelId, Anchor> = { recursos: 'topo', trilho: 'esquerda', minimapa: 'base-esquerda', dock: 'base', painel: 'direita' };

export const defaultLayout = (): PanelLayout =>
  Object.fromEntries(PANEL_IDS.map((id) => [id, { visible: id !== 'painel', anchor: DEFAULT_ANCHOR[id], offsetX: 0, offsetY: 0, scale: 1, opacity: 1, group: null }])) as PanelLayout;

export const defaultProfile = (name = 'Padrão'): LayoutProfile => ({ name, panels: defaultLayout() });

/* ---------- validação estrita (importação e restauração) ---------- */

export type ValidationResult = { ok: true; profile: LayoutProfile } | { ok: false; errors: string[] };

const PANEL_KEYS = ['visible', 'anchor', 'offsetX', 'offsetY', 'scale', 'opacity', 'group'];
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Valida um perfil vindo de fora: chaves desconhecidas, tipos, faixas e as regras dos indicadores essenciais. Nunca lança. */
export function validateProfile(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ['O perfil precisa ser um objeto.'] };
  for (const key of Object.keys(raw)) if (key !== 'name' && key !== 'panels') errors.push(`Campo desconhecido: ${key}.`);
  const name = raw.name;
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > PROFILE_NAME_MAX) errors.push(`O nome precisa ter de 1 a ${PROFILE_NAME_MAX} caracteres.`);
  if (!isObject(raw.panels)) {
    errors.push('Faltam os painéis.');
    return { ok: false, errors };
  }
  for (const key of Object.keys(raw.panels)) if (!(PANEL_IDS as readonly string[]).includes(key)) errors.push(`Painel desconhecido: ${key}.`);
  const panels = {} as PanelLayout;
  for (const id of PANEL_IDS) {
    const item = raw.panels[id];
    if (!isObject(item)) { errors.push(`Falta o painel ${id}.`); continue; }
    for (const key of Object.keys(item)) if (!PANEL_KEYS.includes(key)) errors.push(`${id}: campo desconhecido ${key}.`);
    const { visible, anchor, offsetX, offsetY, scale, opacity, group } = item;
    if (typeof visible !== 'boolean') errors.push(`${id}: visible precisa ser verdadeiro ou falso.`);
    if (!(ANCHORS as readonly unknown[]).includes(anchor)) errors.push(`${id}: âncora inválida.`);
    for (const [label, value] of [['offsetX', offsetX], ['offsetY', offsetY]] as const) {
      if (!isNumber(value) || Math.abs(value) > OFFSET_LIMIT) errors.push(`${id}: ${label} fora de ±${OFFSET_LIMIT}.`);
    }
    if (!isNumber(scale) || scale < SCALE_MIN || scale > SCALE_MAX) errors.push(`${id}: escala fora de ${SCALE_MIN} a ${SCALE_MAX}.`);
    if (!isNumber(opacity) || opacity < OPACITY_MIN || opacity > 1) errors.push(`${id}: opacidade fora de ${OPACITY_MIN} a 1.`);
    if (group !== null && !(GROUPS as readonly unknown[]).includes(group)) errors.push(`${id}: grupo inválido.`);
    if (ESSENTIAL_PANELS.includes(id)) {
      if (visible === false) errors.push(`${id}: indicador essencial não pode ficar oculto.`);
      if (isNumber(opacity) && opacity < OPACITY_ESSENTIAL_MIN) errors.push(`${id}: indicador essencial exige opacidade de pelo menos ${OPACITY_ESSENTIAL_MIN}.`);
    }
    panels[id] = { visible: visible as boolean, anchor: anchor as Anchor, offsetX: offsetX as number, offsetY: offsetY as number, scale: scale as number, opacity: opacity as number, group: (group ?? null) as Group | null };
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, profile: { name: (name as string).trim(), panels } };
}

/** Importa um perfil de texto JSON: tamanho limitado, JSON válido e validação estrita. Nada é aplicado aqui. */
export function importProfile(text: string): ValidationResult {
  if (new TextEncoder().encode(text).length > IMPORT_MAX_BYTES) return { ok: false, errors: [`O arquivo passa de ${IMPORT_MAX_BYTES / 1024} KB.`] };
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { ok: false, errors: ['O texto não é um JSON válido.'] }; }
  return validateProfile(parsed);
}

export const exportProfile = (profile: LayoutProfile): string => `${JSON.stringify(profile, null, 2)}\n`;

/* ---------- geometria: colisões e limites ---------- */

export interface Rect { id: PanelId; left: number; top: number; right: number; bottom: number }
export interface Viewport { name: string; width: number; height: number }

export const VIEWPORTS: readonly Viewport[] = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '414x896', width: 414, height: 896 },
  { name: '375x667', width: 375, height: 667 },
];

/** Caixa padrão de cada painel (modelo aproximado do HUD, não as caixas renderizadas do jogo). */
export function baseRects(view: Viewport): Record<PanelId, Rect> {
  const { width: w, height: h } = view;
  const narrow = w < 640;
  const mini = Math.min(176, Math.round(w * 0.3));
  // Em tela estreita o minimapa fica acima da dock, não ao lado.
  const miniBottom = h - 14 - (narrow ? 86 : 0);
  const dockLeft = narrow ? 8 : 16 + mini + 10;
  const dockRight = narrow ? w - 8 : Math.max(dockLeft + 120, w - 320);
  return {
    recursos: { id: 'recursos', left: narrow ? 8 : Math.round(w * 0.2), top: 8, right: narrow ? w - 8 : Math.round(w * 0.8), bottom: narrow ? 88 : 56 },
    trilho: { id: 'trilho', left: 16, top: narrow ? 104 : 74, right: narrow ? 56 : 72, bottom: miniBottom - mini - 8 },
    minimapa: { id: 'minimapa', left: 16, top: miniBottom - mini, right: 16 + mini, bottom: miniBottom },
    dock: { id: 'dock', left: dockLeft, top: h - 86, right: dockRight, bottom: h - 14 },
    painel: { id: 'painel', left: w - 304, top: 70, right: w - 16, bottom: h - 102 },
  };
}

const anchorPoint = (rect: Rect, anchor: Anchor): { x: number; y: number } => {
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  const x = anchor.endsWith('esquerda') ? rect.left : anchor.endsWith('direita') ? rect.right : cx;
  const y = anchor.startsWith('topo') ? rect.top : anchor.startsWith('base') ? rect.bottom : cy;
  return { x, y };
};

/** Caixa de um painel com a escala aplicada em torno da âncora e o deslocamento somado. */
export function placedRect(base: Rect, setting: PanelSetting): Rect {
  const pivot = anchorPoint(base, setting.anchor);
  const scaleAround = (value: number, origin: number) => origin + (value - origin) * setting.scale;
  return {
    id: base.id,
    left: scaleAround(base.left, pivot.x) + setting.offsetX,
    right: scaleAround(base.right, pivot.x) + setting.offsetX,
    top: scaleAround(base.top, pivot.y) + setting.offsetY,
    bottom: scaleAround(base.bottom, pivot.y) + setting.offsetY,
  };
}

export interface LayoutReport {
  rects: Partial<Record<PanelId, Rect>>;
  /** Pares de painéis visíveis que se sobrepõem (aviso: o jogador pode querer isso). */
  collisions: [PanelId, PanelId][];
  /** Painéis visíveis que saem da viewport. */
  offscreen: PanelId[];
  /** Violações das regras de indicadores essenciais, que bloqueiam aplicar. */
  blocking: string[];
}

const area = (rect: Rect) => Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);

/** Aplica os grupos: um painel de grupo é visível se ele e o grupo estiverem visíveis; ocultar um do grupo oculta os outros. */
export function effectiveVisibility(layout: PanelLayout): Record<PanelId, boolean> {
  const hiddenGroups = new Set(PANEL_IDS.filter((id) => !layout[id].visible && layout[id].group).map((id) => layout[id].group));
  return Object.fromEntries(PANEL_IDS.map((id) => [id, layout[id].visible && !(layout[id].group && hiddenGroups.has(layout[id].group))])) as Record<PanelId, boolean>;
}

export function analyzeLayout(view: Viewport, layout: PanelLayout): LayoutReport {
  const visible = effectiveVisibility(layout);
  const bases = baseRects(view);
  const rects: Partial<Record<PanelId, Rect>> = {};
  for (const id of PANEL_IDS) if (visible[id]) rects[id] = placedRect(bases[id], layout[id]);
  const ids = PANEL_IDS.filter((id) => visible[id]);
  const collisions: [PanelId, PanelId][] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = rects[ids[i]]!;
      const b = rects[ids[j]]!;
      const overlap: Rect = { id: a.id, left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) };
      if (area(overlap) > 0) collisions.push([ids[i], ids[j]]);
    }
  }
  const offscreen = ids.filter((id) => {
    const r = rects[id]!;
    return r.left < 0 || r.top < 0 || r.right > view.width || r.bottom > view.height;
  });
  const blocking: string[] = [];
  for (const id of ESSENTIAL_PANELS) {
    if (!visible[id]) blocking.push(`${PANEL_LABEL[id]} ficaria oculto (inclusive por grupo).`);
    else if (offscreen.includes(id)) blocking.push(`${PANEL_LABEL[id]} sairia da tela.`);
    else if (collisions.some((pair) => pair.includes(id))) blocking.push(`${PANEL_LABEL[id]} ficaria coberto por outro painel.`);
  }
  return { rects, collisions, offscreen, blocking };
}

/* ---------- edição: prévia, aplicar, cancelar, restaurar e histórico só da configuração ---------- */

export interface EditorState {
  /** Perfil em uso (o que vale na partida). */
  applied: LayoutProfile;
  /** Rascunho em prévia; `null` quando nada está sendo editado. */
  draft: LayoutProfile | null;
  past: LayoutProfile[];
  future: LayoutProfile[];
  profiles: LayoutProfile[];
}

export const createEditor = (applied: LayoutProfile = defaultProfile(), profiles: LayoutProfile[] = []): EditorState => ({ applied, draft: null, past: [], future: [], profiles });

const same = (a: LayoutProfile, b: LayoutProfile) => JSON.stringify(a) === JSON.stringify(b);

/** Altera o rascunho (prévia). Não toca o perfil em uso nem o histórico. */
export function preview(state: EditorState, change: (draft: LayoutProfile) => LayoutProfile): EditorState {
  const base = state.draft ?? state.applied;
  return { ...state, draft: change(structuredClone(base)) };
}

/** Descarta o rascunho: o perfil em uso continua exatamente como estava. */
export const cancel = (state: EditorState): EditorState => ({ ...state, draft: null });

export type ApplyResult = { ok: true; state: EditorState } | { ok: false; reasons: string[] };

/** Aplica o rascunho se for válido e não violar os indicadores essenciais na resolução dada; só então entra no histórico (limitado). */
export function apply(state: EditorState, view: Viewport): ApplyResult {
  if (!state.draft) return { ok: false, reasons: ['Não há rascunho para aplicar.'] };
  const validation = validateProfile(state.draft);
  if (!validation.ok) return { ok: false, reasons: validation.errors };
  const report = analyzeLayout(view, validation.profile.panels);
  if (report.blocking.length > 0) return { ok: false, reasons: report.blocking };
  if (same(validation.profile, state.applied)) return { ok: true, state: { ...state, draft: null } };
  return { ok: true, state: { ...state, applied: validation.profile, draft: null, past: [...state.past, state.applied].slice(-HISTORY_LIMIT), future: [] } };
}

/** Restaura o padrão como uma mudança em prévia; o jogador ainda precisa aplicar. */
export const reset = (state: EditorState): EditorState => ({ ...state, draft: defaultProfile(state.applied.name) });

export function undo(state: EditorState): EditorState {
  const previous = state.past[state.past.length - 1];
  if (!previous) return state;
  return { ...state, applied: previous, draft: null, past: state.past.slice(0, -1), future: [state.applied, ...state.future].slice(0, HISTORY_LIMIT) };
}

export function redo(state: EditorState): EditorState {
  const next = state.future[0];
  if (!next) return state;
  return { ...state, applied: next, draft: null, past: [...state.past, state.applied].slice(-HISTORY_LIMIT), future: state.future.slice(1) };
}

/* ---------- perfis locais nomeados ---------- */

export type ProfileResult = { ok: true; state: EditorState } | { ok: false; reason: string };

/** Guarda o perfil em uso com um nome; o mesmo nome substitui, e há um máximo de perfis. */
export function saveProfile(state: EditorState, name: string): ProfileResult {
  const clean = name.trim();
  if (clean.length === 0 || clean.length > PROFILE_NAME_MAX) return { ok: false, reason: `O nome precisa ter de 1 a ${PROFILE_NAME_MAX} caracteres.` };
  const exists = state.profiles.some((p) => p.name === clean);
  if (!exists && state.profiles.length >= MAX_PROFILES) return { ok: false, reason: `Há no máximo ${MAX_PROFILES} perfis. Exclua um antes.` };
  const saved: LayoutProfile = { name: clean, panels: structuredClone(state.applied.panels) };
  return { ok: true, state: { ...state, profiles: exists ? state.profiles.map((p) => (p.name === clean ? saved : p)) : [...state.profiles, saved] } };
}

/** Carrega um perfil guardado como rascunho; precisa ser aplicado para valer. */
export function loadProfile(state: EditorState, name: string): ProfileResult {
  const found = state.profiles.find((p) => p.name === name);
  if (!found) return { ok: false, reason: 'Perfil não encontrado.' };
  return { ok: true, state: { ...state, draft: structuredClone(found) } };
}

export const deleteProfile = (state: EditorState, name: string): EditorState => ({ ...state, profiles: state.profiles.filter((p) => p.name !== name) });

/** Lê perfis guardados (texto do `localStorage`): descarta os inválidos e respeita o máximo. */
export function restoreProfiles(raw: unknown): LayoutProfile[] {
  if (!Array.isArray(raw)) return [];
  const out: LayoutProfile[] = [];
  for (const item of raw) {
    const result = validateProfile(item);
    if (result.ok && !out.some((p) => p.name === result.profile.name)) out.push(result.profile);
    if (out.length >= MAX_PROFILES) break;
  }
  return out;
}
