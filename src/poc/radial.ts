import {
  MAX_AREA_FRACTION, RADIAL_COMMANDS, VIEWPORTS, altKeyTaken, chromeRects, freeAltLetters, itemOffsets, itemSize, measureAll, placeRadial, summarize,
  type Point, type RadialPlacement, type Viewport,
} from '../game/radialPlacement';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const stage = $<HTMLDivElement>('palco');
const resolution = $<HTMLSelectElement>('resolucao');
const keySelect = $<HTMLSelectElement>('tecla');
const panelOpen = $<HTMLInputElement>('painel-aberto');
const current = $('atual');
const log = $('log');
const DECISION_KEY = 'terrinha:poc-radial-decisao';

let view: Viewport = VIEWPORTS[0];
let cursor: Point | null = null;
let radialEl: HTMLDivElement | null = null;
let opener: HTMLElement | null = null;
let scale = 1;

for (const v of VIEWPORTS) resolution.append(new Option(v.name, v.name));
const free = freeAltLetters();
for (const letter of ['r', 't', ...free.filter((l) => l !== 'r' && l !== 't')]) {
  const taken = altKeyTaken(letter);
  keySelect.append(new Option(`Alt+${letter.toUpperCase()}${taken ? ' (colide no jogo)' : ''}`, letter));
}
keySelect.value = free.includes('q') ? 'q' : free[0];

function text(parent: HTMLElement, tag: string, content: string, className?: string): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = content;
  if (className) el.className = className;
  parent.append(el);
  return el;
}

function fit(): void {
  const outer = stage.parentElement as HTMLElement;
  scale = Math.min(1, (outer.clientWidth - 16) / view.width, (window.innerHeight - 220) / view.height);
  scale = Math.max(0.15, scale);
  stage.style.width = `${view.width}px`;
  stage.style.height = `${view.height}px`;
  stage.style.transform = `scale(${scale})`;
  stage.style.marginBottom = `${-(view.height * (1 - scale))}px`;
  stage.style.marginRight = `${-(view.width * (1 - scale))}px`;
  $('palco-nome').textContent = `Palco ${view.name} (exibido a ${Math.round(scale * 100)}%)`;
}

function render(placement?: RadialPlacement): void {
  stage.replaceChildren();
  const rects = chromeRects(view, { panelOpen: panelOpen.checked });
  for (const rect of rects) {
    const box = document.createElement('div');
    box.className = `chrome${placement?.covers.includes(rect.id) ? ' coberto' : ''}`;
    Object.assign(box.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.right - rect.left}px`, height: `${rect.bottom - rect.top}px` });
    box.textContent = rect.id;
    stage.append(box);
  }
  if (cursor) {
    const dot = document.createElement('div');
    dot.className = 'cursor';
    Object.assign(dot.style, { left: `${cursor.x}px`, top: `${cursor.y}px` });
    stage.append(dot);
  }
  if (placement) drawRadial(placement);
}

function describe(placement: RadialPlacement): void {
  current.replaceChildren();
  const pct = (placement.areaFraction * 100).toFixed(1);
  text(current, 'p', `Diâmetro ${Math.round(placement.diameter)} px · área ${pct}% da tela (limite ${MAX_AREA_FRACTION * 100}%) · menor alvo ${itemSize(placement.diameter)} px`);
  text(current, 'p', placement.fits ? 'Não cobre nenhuma âncora do chrome.' : `Cobre: ${placement.covers.join(', ') || 'viewport pequena demais'}`, placement.fits ? 'ok' : 'falha');
  if (placement.moved) text(current, 'p', 'O centro saiu do cursor para respeitar a viewport ou o chrome.');
  if (placement.shrunk) text(current, 'p', 'O diâmetro foi reduzido para caber entre as âncoras.');
}

function drawRadial(placement: RadialPlacement): void {
  const d = placement.diameter;
  radialEl = document.createElement('div');
  radialEl.className = 'radial';
  radialEl.setAttribute('role', 'dialog');
  radialEl.setAttribute('aria-modal', 'true');
  radialEl.setAttribute('aria-label', 'Menu radial de comandos');
  Object.assign(radialEl.style, { left: `${placement.center.x - d / 2}px`, top: `${placement.center.y - d / 2}px`, width: `${d}px`, height: `${d}px` });
  const size = itemSize(d);
  itemOffsets(d).forEach((offset, index) => {
    const command = RADIAL_COMMANDS[index];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'radial-item';
    button.dataset.command = command.id;
    Object.assign(button.style, { left: `${d / 2 + offset.x}px`, top: `${d / 2 + offset.y}px`, width: `${size}px`, height: `${size}px` });
    text(button, 'b', command.label);
    text(button, 'small', command.hint);
    radialEl!.append(button);
  });
  text(radialEl, 'div', 'Enter ou clique executa · setas movem · Esc fecha', 'radial-centro');
  stage.append(radialEl);
  describe(placement);
  (radialEl.querySelector('.radial-item') as HTMLElement | null)?.focus();
}

function openRadial(): void {
  if (!cursor) { log.textContent = 'Clique no palco para escolher o cursor antes de abrir.'; return; }
  opener = document.activeElement as HTMLElement | null;
  const placement = placeRadial(view, cursor, chromeRects(view, { panelOpen: panelOpen.checked }));
  render(placement);
}

function closeRadial(): void {
  if (!radialEl) return;
  radialEl = null;
  render();
  log.textContent = 'Radial fechado; o foco voltou ao elemento anterior.';
  (opener && document.contains(opener) ? opener : stage).focus();
}

stage.addEventListener('click', (event) => {
  if ((event.target as HTMLElement).closest('.radial')) return;
  const box = stage.getBoundingClientRect();
  cursor = { x: Math.round((event.clientX - box.left) / scale), y: Math.round((event.clientY - box.top) / scale) };
  radialEl = null;
  render();
  current.textContent = `Cursor em (${cursor.x}, ${cursor.y}). Abra o radial com Alt+${keySelect.value.toUpperCase()} ou o botão.`;
  log.textContent = '';
});

stage.addEventListener('click', (event) => {
  const item = (event.target as HTMLElement).closest<HTMLElement>('.radial-item');
  if (!item) return;
  const command = RADIAL_COMMANDS.find((c) => c.id === item.dataset.command);
  log.textContent = `Executaria "${command?.label}" (mock: nenhuma ordem enviada).`;
  closeRadial();
});

document.addEventListener('keydown', (event) => {
  if (radialEl) {
    const items = [...radialEl.querySelectorAll<HTMLElement>('.radial-item')];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') { event.preventDefault(); closeRadial(); return; }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); items[(index + 1) % items.length].focus(); return; }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); items[(index - 1 + items.length) % items.length].focus(); return; }
    if (event.key === 'Tab') { event.preventDefault(); items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus(); return; }
    return;
  }
  // Alt+letra pelo código físico: no macOS, Option+letra muda `event.key`.
  if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === `Key${keySelect.value.toUpperCase()}`) { event.preventDefault(); openRadial(); }
});

function onSelectionChange(): void {
  view = VIEWPORTS.find((v) => v.name === resolution.value) ?? VIEWPORTS[0];
  if (cursor) cursor = { x: Math.min(cursor.x, view.width), y: Math.min(cursor.y, view.height) };
  radialEl = null;
  fit();
  render();
}
resolution.addEventListener('change', onSelectionChange);
panelOpen.addEventListener('change', onSelectionChange);
window.addEventListener('resize', fit);
$('abrir').addEventListener('click', openRadial);

keySelect.addEventListener('change', () => {
  const taken = altKeyTaken(keySelect.value);
  $('tecla-aviso').textContent = taken ? `Alt+${keySelect.value.toUpperCase()} já é usado no jogo (resolvedor real de atalhos).` : '';
});
$('tecla-aviso').textContent = '';

let lastRows: ReturnType<typeof measureAll> = [];
$('medir').addEventListener('click', () => {
  lastRows = measureAll();
  const box = $('resumo');
  box.replaceChildren();
  for (const open of [false, true]) {
    text(box, 'p', open ? 'Painel contextual aberto' : 'Painel contextual fechado');
    const table = document.createElement('table');
    const head = table.insertRow();
    for (const h of ['Resolução', 'Cabe', 'Área máx.', 'Menor alvo', 'Cobre']) text(head, 'th', h);
    for (const s of summarize(lastRows.filter((r) => r.panelOpen === open))) {
      const row = table.insertRow();
      text(row, 'td', s.viewport);
      text(row, 'td', `${s.fit}/${s.measured}`, s.fit === s.measured ? 'ok' : 'falha');
      text(row, 'td', `${s.maxAreaPercent}%`, s.areaOk ? 'ok' : 'falha');
      text(row, 'td', `${s.smallestItem} px`, s.smallestItem >= 44 ? 'ok' : 'falha');
      text(row, 'td', s.coveringAnchors.join(', ') || '—');
    }
    box.append(table);
  }
  text(box, 'p', 'Modelo do chrome, não o jogo renderizado.');
});
$('copiar').addEventListener('click', async () => {
  const payload = JSON.stringify({ modelo: 'chrome aproximado', limiteArea: MAX_AREA_FRACTION, linhas: lastRows.length ? lastRows : measureAll() }, null, 2);
  try { await navigator.clipboard.writeText(payload); log.textContent = 'Medição copiada.'; } catch { log.textContent = 'Não foi possível copiar; abra o console e use measureAll().'; }
});

try {
  const saved = JSON.parse(window.localStorage.getItem(DECISION_KEY) ?? 'null') as { decisao?: string; nota?: string } | null;
  if (saved?.decisao) (document.querySelector(`input[name=decisao][value=${saved.decisao}]`) as HTMLInputElement | null)?.setAttribute('checked', '');
  if (saved?.nota) $<HTMLTextAreaElement>('nota').value = saved.nota;
} catch { /* sem armazenamento */ }
const saveDecision = () => {
  const decisao = (document.querySelector('input[name=decisao]:checked') as HTMLInputElement | null)?.value ?? '';
  try { window.localStorage.setItem(DECISION_KEY, JSON.stringify({ decisao, nota: $<HTMLTextAreaElement>('nota').value })); } catch { /* vale só nesta sessão */ }
};
document.querySelectorAll('input[name=decisao]').forEach((el) => el.addEventListener('change', saveDecision));
$('nota').addEventListener('input', saveDecision);

onSelectionChange();
