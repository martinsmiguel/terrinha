import { resolveHotkey, type HotkeyContext } from './hotkeys';

/**
 * Protótipo do menu radial (card #60): posicionamento e medição puros, sem DOM.
 * O radial só tem comandos de interface; nenhuma ordem de partida sai dele. Não é entregue ao jogo sem a decisão do #56.
 */

export interface Rect { id: string; left: number; top: number; right: number; bottom: number }
export interface Viewport { name: string; width: number; height: number }
export interface Point { x: number; y: number }

/** Resoluções previstas pelo #57 e pelo ADR-0008. */
export const VIEWPORTS: readonly Viewport[] = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '414x896', width: 414, height: 896 },
  { name: '375x667', width: 375, height: 667 },
];

/** Comandos de interface do radial (rótulo, atalho já existente quando houver). Nada aqui envia ordem à partida. */
export const RADIAL_COMMANDS: readonly { id: string; label: string; hint: string }[] = [
  { id: 'panel', label: 'Painel', hint: 'J' },
  { id: 'minimap', label: 'Minimapa', hint: 'M' },
  { id: 'catalog', label: 'Catálogo', hint: 'K' },
  { id: 'search', label: 'Buscar', hint: 'Ctrl+K' },
  { id: 'camera', label: 'Centralizar', hint: 'Espaço' },
  { id: 'hide', label: 'Ocultar HUD', hint: 'H' },
];

export const MAX_AREA_FRACTION = 0.2;
export const MAX_DIAMETER = 460;
const MARGIN = 8;
/** Alvo mínimo por comando (44 px), de onde sai o menor diâmetro aceitável. */
const MIN_ITEM = 44;
const RING_RATIO = 0.36;

/** Diâmetro do radial: limitado pelo teto absoluto, por 88% do lado menor e pela área máxima de 20% da tela. */
export function radialDiameter(view: Viewport): number {
  const byArea = Math.sqrt((MAX_AREA_FRACTION * 0.95 * 4 * view.width * view.height) / Math.PI);
  return Math.floor(Math.min(MAX_DIAMETER, view.width * 0.88, view.height * 0.88, byArea));
}

/** Menor diâmetro em que os alvos de 44 px não se tocam no anel (corda entre vizinhos) e cabem dentro do círculo. */
export function minimumDiameter(count: number = RADIAL_COMMANDS.length): number {
  const apart = (MIN_ITEM + 4) / (2 * Math.sin(Math.PI / count) * RING_RATIO);
  const inside = MIN_ITEM / 2 / (0.5 - RING_RATIO);
  return Math.ceil(Math.max(apart, inside));
}

/**
 * Aproximação do chrome persistente do HUD (faixa de recursos, trilho, minimapa, dock e painel contextual) para a resolução.
 * É um modelo para medir colisão, não as caixas renderizadas do jogo.
 */
export function chromeRects(view: Viewport, options: { panelOpen?: boolean } = {}): Rect[] {
  const { width: w, height: h } = view;
  const narrow = w < 640;
  const rects: Rect[] = [{ id: 'recursos', left: 0, top: 0, right: w, bottom: narrow ? 96 : 64 }];
  rects.push({ id: 'trilho', left: 16, top: narrow ? 104 : 74, right: narrow ? 56 : 72, bottom: h - 20 });
  const mini = Math.min(176, Math.round(w * 0.3));
  rects.push({ id: 'minimapa', left: 16, top: h - 14 - mini, right: 16 + mini, bottom: h - 14 });
  const dockLeft = narrow ? 8 : 16 + mini + 10;
  const dockRight = narrow ? w - 8 : Math.max(dockLeft + 120, w - 320);
  rects.push({ id: 'dock', left: dockLeft, top: h - 86, right: dockRight, bottom: h - 14 });
  if (options.panelOpen && !narrow) rects.push({ id: 'painel', left: w - 304, top: 70, right: w - 16, bottom: h - 102 });
  return rects;
}

const overlapsCircle = (rect: Rect, c: Point, r: number): boolean => {
  const nx = Math.max(rect.left, Math.min(c.x, rect.right));
  const nz = Math.max(rect.top, Math.min(c.y, rect.bottom));
  return Math.hypot(c.x - nx, c.y - nz) < r;
};

export interface RadialPlacement {
  center: Point;
  diameter: number;
  /** Área do círculo sobre a área da tela. */
  areaFraction: number;
  /** O diâmetro foi reduzido para caber entre as âncoras. */
  shrunk: boolean;
  /** Âncoras que o radial ainda cobre (vazio quando coube em espaço livre). */
  covers: string[];
  /** Coube sem cobrir nenhuma âncora. */
  fits: boolean;
  /** O centro saiu do cursor para respeitar a viewport ou as âncoras. */
  moved: boolean;
}

const clamp = (value: number, lo: number, hi: number) => Math.min(Math.max(value, lo), Math.max(lo, hi));

/**
 * Posiciona o radial perto do cursor: primeiro no cursor (limitado à viewport), depois no ponto livre mais próximo; se nada
 * couber, reduz o diâmetro até o mínimo que acomoda os alvos de 44 px. Se ainda não couber, devolve a melhor tentativa com `fits: false`.
 */
export function placeRadial(view: Viewport, cursor: Point, obstacles: readonly Rect[]): RadialPlacement {
  const full = radialDiameter(view);
  const smallest = Math.min(full, minimumDiameter());
  const attempt = (diameter: number): { center: Point; covers: Rect[] } | null => {
    const r = diameter / 2;
    const lo = { x: r + MARGIN, y: r + MARGIN };
    const hi = { x: view.width - r - MARGIN, y: view.height - r - MARGIN };
    if (hi.x < lo.x || hi.y < lo.y) return null;
    const start = { x: clamp(cursor.x, lo.x, hi.x), y: clamp(cursor.y, lo.y, hi.y) };
    const holder: { best: { center: Point; covers: Rect[]; score: number } | null } = { best: null };
    const step = 8;
    const evaluate = (x: number, y: number) => {
      const covers = obstacles.filter((o) => overlapsCircle(o, { x, y }, r));
      const score = covers.length * 1e6 + Math.hypot(x - start.x, y - start.y);
      if (!holder.best || score < holder.best.score) holder.best = { center: { x, y }, covers, score };
    };
    evaluate(start.x, start.y); // o ponto exato do cursor tem prioridade sobre a grade
    for (let y = lo.y; y <= hi.y; y += step) {
      for (let x = lo.x; x <= hi.x; x += step) {
        evaluate(x, y);
      }
    }
    return holder.best ? { center: holder.best.center, covers: holder.best.covers } : null;
  };

  let diameter = full;
  let chosen = attempt(diameter);
  while (chosen && chosen.covers.length > 0 && diameter > smallest) {
    diameter = Math.max(smallest, diameter - 24);
    chosen = attempt(diameter);
  }
  if (!chosen) {
    const r = Math.min(full, view.width, view.height) / 2;
    return { center: { x: view.width / 2, y: view.height / 2 }, diameter: r * 2, areaFraction: (Math.PI * r * r) / (view.width * view.height), shrunk: false, covers: [], fits: false, moved: true };
  }
  const r = diameter / 2;
  const asked = { x: clamp(cursor.x, r + MARGIN, view.width - r - MARGIN), y: clamp(cursor.y, r + MARGIN, view.height - r - MARGIN) };
  return {
    center: chosen.center,
    diameter,
    areaFraction: (Math.PI * r * r) / (view.width * view.height),
    shrunk: diameter < full,
    covers: chosen.covers.map((o) => o.id),
    fits: chosen.covers.length === 0,
    moved: Math.hypot(chosen.center.x - asked.x, chosen.center.y - asked.y) > 1,
  };
}

/** Posição de cada comando no anel (centro do botão, em pixels, relativo ao centro do radial). */
export function itemOffsets(diameter: number, count: number = RADIAL_COMMANDS.length): Point[] {
  const ring = diameter * RING_RATIO;
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    return { x: Math.cos(angle) * ring, y: Math.sin(angle) * ring };
  });
}

/** Lado do botão de cada comando: cabe no anel sem encostar no vizinho nem sair do círculo; nunca abaixo de 44 px com o diâmetro mínimo. */
export function itemSize(diameter: number, count: number = RADIAL_COMMANDS.length): number {
  const ring = diameter * RING_RATIO;
  const chord = 2 * ring * Math.sin(Math.PI / count);
  return Math.floor(Math.min(88, chord - 4, diameter - 2 * ring));
}

/** Âncoras de cursor medidas em cada resolução: centro, quatro cantos e quatro meios de borda. */
export function cursorAnchors(view: Viewport): { name: string; point: Point }[] {
  const { width: w, height: h } = view;
  return [
    ['centro', w / 2, h / 2], ['canto superior esquerdo', 0, 0], ['canto superior direito', w, 0], ['canto inferior esquerdo', 0, h],
    ['canto inferior direito', w, h], ['meio da borda superior', w / 2, 0], ['meio da borda inferior', w / 2, h],
    ['meio da borda esquerda', 0, h / 2], ['meio da borda direita', w, h / 2],
  ].map(([name, x, y]) => ({ name: name as string, point: { x: x as number, y: y as number } }));
}

export interface RadialMeasurement {
  viewport: string;
  anchor: string;
  panelOpen: boolean;
  diameter: number;
  areaPercent: number;
  fits: boolean;
  covers: string[];
  shrunk: boolean;
  smallestItem: number;
}

/** Mede todas as âncoras em todas as resoluções, com o painel contextual fechado e aberto. */
export function measureAll(viewports: readonly Viewport[] = VIEWPORTS): RadialMeasurement[] {
  const rows: RadialMeasurement[] = [];
  for (const view of viewports) {
    for (const panelOpen of [false, true]) {
      const obstacles = chromeRects(view, { panelOpen });
      for (const { name, point } of cursorAnchors(view)) {
        const placed = placeRadial(view, point, obstacles);
        rows.push({
          viewport: view.name, anchor: name, panelOpen, diameter: Math.round(placed.diameter), areaPercent: +(placed.areaFraction * 100).toFixed(1),
          fits: placed.fits, covers: placed.covers, shrunk: placed.shrunk, smallestItem: itemSize(placed.diameter),
        });
      }
    }
  }
  return rows;
}

export interface RadialSummary { viewport: string; measured: number; fit: number; areaOk: boolean; maxAreaPercent: number; coveringAnchors: string[]; smallestItem: number }

export function summarize(rows: readonly RadialMeasurement[]): RadialSummary[] {
  const names = [...new Set(rows.map((r) => r.viewport))];
  return names.map((viewport) => {
    const own = rows.filter((r) => r.viewport === viewport);
    return {
      viewport,
      measured: own.length,
      fit: own.filter((r) => r.fits).length,
      areaOk: own.every((r) => r.areaPercent < MAX_AREA_FRACTION * 100),
      maxAreaPercent: Math.max(...own.map((r) => r.areaPercent)),
      coveringAnchors: [...new Set(own.flatMap((r) => r.covers))],
      smallestItem: Math.min(...own.map((r) => r.smallestItem)),
    };
  });
}

/* ---------- atalho de abertura ---------- */

const NO_OVERLAY: HotkeyContext = { overlays: [], hasVillagerSelected: false, selectedBuilding: null, buildMode: false };

/** Alt+tecla já usado pelo jogo, consultado no resolvedor real (não numa lista copiada). */
export function altKeyTaken(letter: string): boolean {
  return resolveHotkey({ key: letter, altKey: true }, NO_OVERLAY) !== null;
}

/** Letras livres para Alt+letra no jogo real; `r` (a sugestão original do card) colide com as regras da sessão (#88). */
export function freeAltLetters(): string[] {
  return 'abcdefghijklmnopqrstuvwxyz'.split('').filter((letter) => !altKeyTaken(letter));
}
