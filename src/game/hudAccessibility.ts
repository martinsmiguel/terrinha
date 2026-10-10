import { HOTKEYS, RESOLVED_CONFLICTS, findKeyCollisions, type HotkeyAction, type HotkeyDefinition } from './hotkeys';

/** Acessibilidade local do HUD (card #115): escala, alto contraste, daltonismo e remapeamento. Nunca toca a partida. */

export const HUD_SCALE_MIN = 75;
export const HUD_SCALE_MAX = 200;
export const HUD_SCALE_STEP = 5;

export type ColorProfile = 'default' | 'protanopia' | 'deuteranopia' | 'tritanopia';
export const COLOR_PROFILES: readonly ColorProfile[] = ['default', 'protanopia', 'deuteranopia', 'tritanopia'];
export const COLOR_PROFILE_LABEL: Record<ColorProfile, string> = {
  default: 'Padrão',
  protanopia: 'Protanopia (sem vermelho)',
  deuteranopia: 'Deuteranopia (sem verde)',
  tritanopia: 'Tritanopia (sem azul)',
};

export interface HudAccessibility {
  /** Percentual da escala do HUD, de 75 a 200. */
  scale: number;
  /** Alto contraste (AAA 7:1) nos textos secundários. */
  highContrast: boolean;
  colorProfile: ColorProfile;
  /** Teclas redefinidas por ação (`hotkeyId`). Ausente = tecla padrão. */
  bindings: Record<string, string>;
}

export const DEFAULT_HUD_ACCESSIBILITY: HudAccessibility = { scale: 100, highContrast: false, colorProfile: 'default', bindings: {} };

export const clampScale = (value: number): number => {
  if (!Number.isFinite(value)) return 100;
  const stepped = Math.round(value / HUD_SCALE_STEP) * HUD_SCALE_STEP;
  return Math.min(HUD_SCALE_MAX, Math.max(HUD_SCALE_MIN, stepped));
};

/* ---------- remapeamento de teclas ---------- */

/** Identificador estável de um atalho do registro: ação + escopo (a tecla muda, o id não). */
export function hotkeyId(def: HotkeyDefinition): string {
  const action = def.action;
  const what = action.kind === 'build' ? `build:${action.building}` : action.kind === 'train' ? `train:${action.unit}`
    : action.kind === 'formation' ? `formation:${action.formation}` : action.kind === 'close-overlay' ? `close:${action.overlay}` : action.kind;
  const scope = def.scope.type === 'building' ? `building:${def.scope.building}` : def.scope.type;
  return `${scope}/${what}`;
}

/** Teclas que o jogo reserva (câmera, cancelar, Enter, Tab e modificadores) e não podem ser atribuídas. */
const RESERVED_KEYS = new Set(['escape', 'enter', 'tab', 'shift', 'control', 'alt', 'meta', 'capslock', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
/** WASD move a câmera (tratado pelo engine), então não vale como atalho redefinido. */
const CAMERA_KEYS = new Set(['w', 'a', 's', 'd']);

export const normalizeKey = (key: string): string => (key.length === 1 ? key.toLowerCase() : key.toLowerCase());

export type BindingCheck = { ok: true } | { ok: false; reason: string };

/** Aplica as teclas redefinidas sobre o registro; o resultado tem o mesmo formato de `HOTKEYS`. */
export function applyBindings(bindings: Readonly<Record<string, string>>, defs: readonly HotkeyDefinition[] = HOTKEYS): HotkeyDefinition[] {
  return defs.map((def) => {
    const key = bindings[hotkeyId(def)];
    return key ? { ...def, key } : def;
  });
}

const declaredConflict = (a: HotkeyDefinition, b: HotkeyDefinition): boolean =>
  RESOLVED_CONFLICTS.some((c) => c.key === a.key && ((sameAction(c.winner, a.action) && sameAction(c.loser, b.action)) || (sameAction(c.winner, b.action) && sameAction(c.loser, a.action))));
const sameAction = (a: HotkeyAction, b: HotkeyAction): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Valida uma nova tecla para um atalho: formato, teclas reservadas e colisão com outro atalho do mesmo escopo. */
export function checkBinding(id: string, rawKey: string, current: Readonly<Record<string, string>>, defs: readonly HotkeyDefinition[] = HOTKEYS): BindingCheck {
  if (!defs.some((def) => hotkeyId(def) === id)) return { ok: false, reason: 'Atalho desconhecido.' };
  const key = normalizeKey(rawKey);
  if (key.length !== 1 && key !== ' ') return { ok: false, reason: 'Use uma tecla de caractere único ou a barra de espaço.' };
  if (RESERVED_KEYS.has(key)) return { ok: false, reason: 'Tecla reservada pelo jogo.' };
  if (CAMERA_KEYS.has(key)) return { ok: false, reason: 'W, A, S e D movem a câmera.' };
  const next = applyBindings({ ...current, [id]: key }, defs);
  const clash = findKeyCollisions(next).find(([a, b]) => (hotkeyId(a) === id || hotkeyId(b) === id) && !declaredConflict(a, b));
  if (clash) {
    const other = hotkeyId(clash[0]) === id ? clash[1] : clash[0];
    return { ok: false, reason: `Conflita com "${other.description}".` };
  }
  return { ok: true };
}

/* ---------- persistência validada ---------- */

export function restoreAccessibility(raw: unknown, defs: readonly HotkeyDefinition[] = HOTKEYS): HudAccessibility {
  if (!raw || typeof raw !== 'object') return DEFAULT_HUD_ACCESSIBILITY;
  const input = raw as Record<string, unknown>;
  const bindings: Record<string, string> = {};
  if (input.bindings && typeof input.bindings === 'object') {
    for (const [id, key] of Object.entries(input.bindings as Record<string, unknown>)) {
      // Cada tecla é validada contra o conjunto já aceito: um valor adulterado ou obsoleto é descartado.
      if (typeof key === 'string' && checkBinding(id, key, bindings, defs).ok) bindings[id] = normalizeKey(key);
    }
  }
  return {
    scale: clampScale(typeof input.scale === 'number' ? input.scale : 100),
    highContrast: input.highContrast === true,
    colorProfile: COLOR_PROFILES.includes(input.colorProfile as ColorProfile) ? (input.colorProfile as ColorProfile) : 'default',
    bindings,
  };
}

/* ---------- contraste (WCAG 2.x) ---------- */

export type Rgb = readonly [number, number, number];

export const hexToRgb = (hex: string): Rgb => {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as unknown as Rgb;
};

const toLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (linear: number): number => {
  const c = Math.min(1, Math.max(0, linear));
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
};

export const relativeLuminance = ([r, g, b]: Rgb): number => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const WCAG_AA = 4.5;
export const WCAG_AAA = 7;

/* ---------- daltonismo: simulação e correção ---------- */

type Matrix3 = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];

/** Simulação de Machado et al. (2009), severidade 1, em RGB linear. */
const SIMULATION: Record<Exclude<ColorProfile, 'default'>, Matrix3> = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

/** Para onde o erro perdido é redistribuído (daltonização clássica): vermelho/verde vão para G/B, azul vai para R/G. */
const SHIFT: Record<Exclude<ColorProfile, 'default'>, Matrix3> = {
  protanopia: [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]],
  deuteranopia: [[0, 0, 0], [0.7, 1, 0], [0.7, 0, 1]],
  tritanopia: [[1, 0, 0.7], [0, 1, 0.7], [0, 0, 0]],
};

const IDENTITY: Matrix3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const multiply = (a: Matrix3, b: Matrix3): Matrix3 =>
  a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j])) as unknown as Matrix3;
const add = (a: Matrix3, b: Matrix3): Matrix3 => a.map((row, i) => row.map((v, j) => v + b[i][j])) as unknown as Matrix3;
const subtract = (a: Matrix3, b: Matrix3): Matrix3 => a.map((row, i) => row.map((v, j) => v - b[i][j])) as unknown as Matrix3;

const applyMatrix = (m: Matrix3, rgb: Rgb): Rgb => {
  const lin = rgb.map(toLinear);
  return [0, 1, 2].map((i) => fromLinear(m[i][0] * lin[0] + m[i][1] * lin[1] + m[i][2] * lin[2])) as unknown as Rgb;
};

/** Como uma pessoa com o perfil enxerga a cor. */
export const simulateColorBlindness = (rgb: Rgb, profile: ColorProfile): Rgb => (profile === 'default' ? rgb : applyMatrix(SIMULATION[profile], rgb));

/** Matriz linear (3x3, RGB linear) que realça no canal visível a diferença que o perfil perde: I + S·(I − Sim). */
export function correctionMatrix(profile: ColorProfile): Matrix3 {
  if (profile === 'default') return IDENTITY;
  return add(IDENTITY, multiply(SHIFT[profile], subtract(IDENTITY, SIMULATION[profile])));
}

/** Cor após a correção do perfil. */
export const correctColor = (rgb: Rgb, profile: ColorProfile): Rgb => applyMatrix(correctionMatrix(profile), rgb);

/** `values` de um `<feColorMatrix type="matrix">` (4x5, linha a linha) para o perfil; vazio no padrão. */
export function colorMatrixValues(profile: ColorProfile): string | null {
  if (profile === 'default') return null;
  const m = correctionMatrix(profile);
  return m.map((row) => `${row.map((v) => +v.toFixed(5)).join(' ')} 0 0`).concat('0 0 0 1 0').join(' ');
}

const toLab = (rgb: Rgb): [number, number, number] => {
  const [r, g, b] = rgb.map(toLinear);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};

/** Diferença perceptual (ΔE CIE76) entre duas cores. */
export const deltaE = (a: Rgb, b: Rgb): number => {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

/** Distância que uma pessoa com o perfil percebe entre duas cores, com ou sem a correção ligada. */
export const perceivedDistance = (a: Rgb, b: Rgb, profile: ColorProfile, corrected: boolean): number => {
  const view = (c: Rgb) => simulateColorBlindness(corrected ? correctColor(c, profile) : c, profile);
  return deltaE(view(a), view(b));
};

/* ---------- aplicação no documento ---------- */

/** Variáveis e atributos que o CSS lê; é a única ponte entre o estado e a página. */
export function documentSettings(settings: HudAccessibility): { fontSizePercent: number; highContrast: boolean; colorMatrix: string | null } {
  return { fontSizePercent: settings.scale, highContrast: settings.highContrast, colorMatrix: colorMatrixValues(settings.colorProfile) };
}

/** Largura de referência do layout do HUD (celular estreito): abaixo dela os painéis deixam de caber. */
export const HUD_REFERENCE_WIDTH = 375;

/**
 * Escala realmente aplicada: a escolhida, limitada para que a largura da tela em unidades do HUD nunca fique abaixo da referência.
 * Em 375 px a escala vai de 75 a 100%; em 1366 px, de 75 a 200%.
 */
export function effectiveScale(scale: number, viewportWidth: number): number {
  const ceiling = Math.floor((viewportWidth / HUD_REFERENCE_WIDTH) * 100 / HUD_SCALE_STEP) * HUD_SCALE_STEP;
  return Math.max(HUD_SCALE_MIN, Math.min(clampScale(scale), ceiling));
}
