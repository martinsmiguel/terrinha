import {
  ANCHORS, ESSENTIAL_PANELS, GROUPS, OPACITY_ESSENTIAL_MIN, OPACITY_MIN, PANEL_IDS, PANEL_LABEL, VIEWPORTS, analyzeLayout, apply, cancel, createEditor,
  defaultProfile, deleteProfile, effectiveVisibility, exportProfile, importProfile, loadProfile, preview, redo, reset, restoreProfiles, saveProfile,
  undo, validateProfile, type EditorState, type LayoutProfile, type PanelId, type Viewport,
} from '../game/hudLayoutProfile';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const KEY_PROFILES = 'terrinha:poc-personalizacao-perfis';
const KEY_APPLIED = 'terrinha:poc-personalizacao-uso';
const KEY_DECISION = 'terrinha:poc-personalizacao-decisao';

const stage = $<HTMLDivElement>('palco');
const resolution = $<HTMLSelectElement>('resolucao');
const panelSelect = $<HTMLSelectElement>('painel');
let view: Viewport = VIEWPORTS[0];
let selected: PanelId = 'minimapa';
let scale = 1;

const readJson = (key: string): unknown => { try { return JSON.parse(window.localStorage.getItem(key) ?? 'null'); } catch { return null; } };
const writeJson = (key: string, value: unknown) => { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* vale só nesta sessão */ } };

const storedApplied = validateProfile(readJson(KEY_APPLIED));
let state: EditorState = createEditor(storedApplied.ok ? storedApplied.profile : defaultProfile(), restoreProfiles(readJson(KEY_PROFILES)));

function persist(): void {
  writeJson(KEY_APPLIED, state.applied);
  writeJson(KEY_PROFILES, state.profiles);
}

for (const v of VIEWPORTS) resolution.append(new Option(v.name, v.name));
for (const id of PANEL_IDS) panelSelect.append(new Option(`${PANEL_LABEL[id]}${ESSENTIAL_PANELS.includes(id) ? ' (essencial)' : ''}`, id));
for (const anchor of ANCHORS) $<HTMLSelectElement>('ancora').append(new Option(anchor, anchor));
$<HTMLSelectElement>('grupo').append(new Option('Sem grupo', ''));
for (const group of GROUPS) $<HTMLSelectElement>('grupo').append(new Option(`Grupo ${group}`, group));
panelSelect.value = selected;

const shown = (): LayoutProfile => state.draft ?? state.applied;

function setStatus(message: string, ok = true): void {
  const box = $('aviso');
  box.textContent = message;
  box.className = ok ? 'ok' : 'falha';
}

function fit(): void {
  const outer = stage.parentElement as HTMLElement;
  scale = Math.max(0.15, Math.min(1, (outer.clientWidth - 16) / view.width, (window.innerHeight - 260) / view.height));
  Object.assign(stage.style, {
    width: `${view.width}px`, height: `${view.height}px`, transform: `scale(${scale})`,
    marginBottom: `${-(view.height * (1 - scale))}px`, marginRight: `${-(view.width * (1 - scale))}px`,
  });
  $('palco-nome').textContent = `Palco ${view.name} (exibido a ${Math.round(scale * 100)}%)${state.draft ? ' · PRÉVIA não aplicada' : ''}`;
}

function renderStage(): void {
  stage.replaceChildren();
  const layout = shown().panels;
  const report = analyzeLayout(view, layout);
  const colliding = new Set(report.collisions.flat());
  for (const id of PANEL_IDS) {
    const rect = report.rects[id];
    if (!rect) continue;
    const box = document.createElement('button');
    box.type = 'button';
    box.className = `painel${ESSENTIAL_PANELS.includes(id) ? ' essencial' : ''}${colliding.has(id) ? ' colide' : ''}${id === selected ? ' selecionado' : ''}`;
    box.setAttribute('aria-label', `${PANEL_LABEL[id]}: selecionar para editar`);
    Object.assign(box.style, {
      left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.right - rect.left}px`, height: `${rect.bottom - rect.top}px`, opacity: String(layout[id].opacity),
    });
    box.append(document.createTextNode(PANEL_LABEL[id]));
    const mock = document.createElement('small');
    mock.textContent = 'dados ilustrativos';
    box.append(mock);
    box.addEventListener('click', () => { selected = id; panelSelect.value = id; renderAll(); });
    stage.append(box);
  }
  const list = $('alertas');
  list.replaceChildren();
  const add = (text: string, ok: boolean) => { const li = document.createElement('li'); li.textContent = text; li.className = ok ? 'ok' : 'falha'; list.append(li); };
  for (const message of report.blocking) add(`Bloqueia aplicar: ${message}`, false);
  for (const [a, b] of report.collisions) add(`Sobreposição: ${PANEL_LABEL[a]} e ${PANEL_LABEL[b]} (aviso).`, true);
  for (const id of report.offscreen) add(`${PANEL_LABEL[id]} sai da tela (aviso).`, true);
  const visible = effectiveVisibility(layout);
  for (const id of PANEL_IDS) if (layout[id].visible && !visible[id]) add(`${PANEL_LABEL[id]} some junto com o grupo ${layout[id].group}.`, true);
  if (list.children.length === 0) add('Sem sobreposições nem painéis fora da tela nesta resolução.', true);
}

function renderForm(): void {
  const setting = shown().panels[selected];
  const essential = ESSENTIAL_PANELS.includes(selected);
  $<HTMLInputElement>('visivel').checked = setting.visible;
  $<HTMLInputElement>('visivel').disabled = essential;
  $<HTMLSelectElement>('ancora').value = setting.anchor;
  $<HTMLInputElement>('ox').value = String(setting.offsetX);
  $<HTMLInputElement>('oy').value = String(setting.offsetY);
  $<HTMLInputElement>('escala').value = String(setting.scale);
  $<HTMLInputElement>('opacidade').min = String(essential ? OPACITY_ESSENTIAL_MIN : OPACITY_MIN);
  $<HTMLInputElement>('opacidade').value = String(setting.opacity);
  $<HTMLSelectElement>('grupo').value = setting.group ?? '';
  $('ox-v').textContent = `${setting.offsetX}`;
  $('oy-v').textContent = `${setting.offsetY}`;
  $('escala-v').textContent = `${setting.scale.toFixed(2)}x`;
  $('opacidade-v').textContent = `${Math.round(setting.opacity * 100)}%`;
  $<HTMLButtonElement>('aplicar').disabled = !state.draft;
  $<HTMLButtonElement>('cancelar').disabled = !state.draft;
  $<HTMLButtonElement>('desfazer').disabled = state.past.length === 0;
  $<HTMLButtonElement>('refazer').disabled = state.future.length === 0;
  $('historico').textContent = `Histórico só da configuração: ${state.past.length} para desfazer, ${state.future.length} para refazer.`;

  const profiles = $('perfis');
  profiles.replaceChildren();
  if (state.profiles.length === 0) { const li = document.createElement('li'); li.textContent = 'Nenhum perfil guardado.'; profiles.append(li); }
  for (const profile of state.profiles) {
    const li = document.createElement('li');
    li.append(document.createTextNode(`${profile.name} `));
    const actions: [string, () => void][] = [
      ['Carregar como prévia', () => {
        const result = loadProfile(state, profile.name);
        if (result.ok) { state = result.state; setStatus(`Perfil "${profile.name}" em prévia. Aplique para valer.`); renderAll(); }
      }],
      ['Excluir', () => { state = deleteProfile(state, profile.name); persist(); renderAll(); }],
    ];
    for (const [label, action] of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'botao';
      button.textContent = label;
      button.setAttribute('aria-label', `${label}: ${profile.name}`);
      button.addEventListener('click', action);
      li.append(button, document.createTextNode(' '));
    }
    profiles.append(li);
  }
}

function renderAll(): void { fit(); renderStage(); renderForm(); }

function edit(change: (panel: LayoutProfile['panels'][PanelId]) => void): void {
  state = preview(state, (draft) => { change(draft.panels[selected]); return draft; });
  setStatus('Prévia: ainda não aplicada.');
  renderAll();
}

$<HTMLInputElement>('visivel').addEventListener('change', (e) => edit((p) => { p.visible = (e.target as HTMLInputElement).checked; }));
$<HTMLSelectElement>('ancora').addEventListener('change', (e) => edit((p) => { p.anchor = (e.target as HTMLSelectElement).value as typeof p.anchor; }));
$<HTMLInputElement>('ox').addEventListener('input', (e) => edit((p) => { p.offsetX = Number((e.target as HTMLInputElement).value); }));
$<HTMLInputElement>('oy').addEventListener('input', (e) => edit((p) => { p.offsetY = Number((e.target as HTMLInputElement).value); }));
$<HTMLInputElement>('escala').addEventListener('input', (e) => edit((p) => { p.scale = Number((e.target as HTMLInputElement).value); }));
$<HTMLInputElement>('opacidade').addEventListener('input', (e) => edit((p) => { p.opacity = Number((e.target as HTMLInputElement).value); }));
$<HTMLSelectElement>('grupo').addEventListener('change', (e) => edit((p) => {
  const value = (e.target as HTMLSelectElement).value;
  p.group = value === '' ? null : (value as typeof p.group);
}));
panelSelect.addEventListener('change', () => { selected = panelSelect.value as PanelId; renderAll(); });
resolution.addEventListener('change', () => { view = VIEWPORTS.find((v) => v.name === resolution.value) ?? VIEWPORTS[0]; renderAll(); });

$('aplicar').addEventListener('click', () => {
  const result = apply(state, view);
  if (!result.ok) { setStatus(`Não aplicado: ${result.reasons.join(' ')}`, false); return; }
  state = result.state;
  persist();
  setStatus('Aplicado e guardado neste navegador. Nada da partida foi alterado.');
  renderAll();
});
$('cancelar').addEventListener('click', () => { state = cancel(state); setStatus('Prévia descartada: o perfil em uso não mudou.'); renderAll(); });
$('padrao').addEventListener('click', () => { state = reset(state); setStatus('Padrão em prévia. Aplique para valer.'); renderAll(); });
$('desfazer').addEventListener('click', () => { state = undo(state); persist(); renderAll(); });
$('refazer').addEventListener('click', () => { state = redo(state); persist(); renderAll(); });
$('salvar').addEventListener('click', () => {
  const name = $<HTMLInputElement>('nome').value;
  const result = saveProfile(state, name);
  if (!result.ok) { setStatus(result.reason, false); return; }
  state = result.state;
  persist();
  setStatus(`Perfil "${name.trim()}" guardado.`);
  renderAll();
});
$('exportar').addEventListener('click', () => { $<HTMLTextAreaElement>('texto').value = exportProfile(state.applied); setStatus('Perfil em uso exportado.'); });
$('importar').addEventListener('click', () => {
  const result = importProfile($<HTMLTextAreaElement>('texto').value);
  if (!result.ok) { setStatus(`Importação recusada: ${result.errors.join(' ')}`, false); return; }
  state = preview(state, () => result.profile);
  setStatus(`"${result.profile.name}" validado e em prévia. Aplique para valer.`);
  renderAll();
});
document.addEventListener('keydown', (event) => {
  const typing = (event.target as HTMLElement).closest('input, textarea, select');
  if (typing || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
  event.preventDefault();
  state = event.shiftKey ? redo(state) : undo(state);
  persist();
  renderAll();
});
window.addEventListener('resize', renderAll);

const saved = readJson(KEY_DECISION) as { controles?: string[]; decisao?: string; nota?: string } | null;
document.querySelectorAll<HTMLInputElement>('input[name=controle]').forEach((el) => { el.checked = saved?.controles?.includes(el.value) ?? false; });
document.querySelectorAll<HTMLInputElement>('input[name=decisao]').forEach((el) => { el.checked = saved?.decisao === el.value; });
if (saved?.nota) $<HTMLTextAreaElement>('nota').value = saved.nota;
const saveDecision = () => writeJson(KEY_DECISION, {
  controles: [...document.querySelectorAll<HTMLInputElement>('input[name=controle]:checked')].map((el) => el.value),
  decisao: document.querySelector<HTMLInputElement>('input[name=decisao]:checked')?.value ?? '',
  nota: $<HTMLTextAreaElement>('nota').value,
});
document.querySelectorAll('input[name=controle], input[name=decisao]').forEach((el) => el.addEventListener('change', saveDecision));
$('nota').addEventListener('input', saveDecision);

renderAll();
