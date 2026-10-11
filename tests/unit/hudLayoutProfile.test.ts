import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT, IMPORT_MAX_BYTES, MAX_PROFILES, OPACITY_ESSENTIAL_MIN, PANEL_IDS, VIEWPORTS, analyzeLayout, apply, cancel, createEditor, defaultProfile,
  deleteProfile, effectiveVisibility, exportProfile, importProfile, loadProfile, preview, redo, reset, restoreProfiles, saveProfile, undo, validateProfile,
  type EditorState, type LayoutProfile,
} from '../../src/game/hudLayoutProfile';

const wide = VIEWPORTS[0];
const withPanel = (profile: LayoutProfile, id: (typeof PANEL_IDS)[number], change: Partial<LayoutProfile['panels'][typeof id]>): LayoutProfile => {
  const copy = structuredClone(profile);
  copy.panels[id] = { ...copy.panels[id], ...change };
  return copy;
};

describe('perfil padrão', () => {
  it('é válido e não esconde, cobre nem tira da tela nenhum painel em nenhuma resolução prevista', () => {
    expect(validateProfile(defaultProfile()).ok).toBe(true);
    for (const view of VIEWPORTS) {
      const report = analyzeLayout(view, defaultProfile().panels);
      expect(report.blocking, view.name).toEqual([]);
      expect(report.offscreen, view.name).toEqual([]);
      expect(report.collisions, view.name).toEqual([]);
    }
  });
});

describe('validação estrita', () => {
  const bad = (change: (raw: any) => void) => {
    const raw = structuredClone(defaultProfile()) as any;
    change(raw);
    return validateProfile(raw);
  };

  it('recusa campos desconhecidos, painéis desconhecidos e tipos errados, sem lançar', () => {
    expect(bad((r) => { r.extra = 1; }).ok).toBe(false);
    expect(bad((r) => { r.panels.fantasma = r.panels.dock; }).ok).toBe(false);
    expect(bad((r) => { r.panels.dock.visible = 'sim'; }).ok).toBe(false);
    expect(bad((r) => { r.panels.dock.anchor = 'meio'; }).ok).toBe(false);
    expect(bad((r) => { r.panels.dock.surpresa = true; }).ok).toBe(false);
    expect(bad((r) => { delete r.panels.dock; }).ok).toBe(false);
    expect(validateProfile(null).ok).toBe(false);
    expect(validateProfile([]).ok).toBe(false);
    expect(validateProfile('texto').ok).toBe(false);
  });

  it('recusa números fora de faixa, NaN e infinitos', () => {
    for (const patch of [{ scale: 0.5 }, { scale: 2 }, { opacity: 0.1 }, { opacity: 2 }, { offsetX: 999 }, { offsetY: -999 }, { scale: Number.NaN }, { offsetX: Infinity }]) {
      expect(bad((r) => Object.assign(r.panels.dock, patch)).ok, JSON.stringify(patch)).toBe(false);
    }
  });

  it('protege o indicador essencial: nem oculto nem quase transparente', () => {
    expect(bad((r) => { r.panels.recursos.visible = false; }).ok).toBe(false);
    expect(bad((r) => { r.panels.recursos.opacity = OPACITY_ESSENTIAL_MIN - 0.05; }).ok).toBe(false);
    expect(bad((r) => { r.panels.recursos.opacity = OPACITY_ESSENTIAL_MIN; }).ok).toBe(true);
  });

  it('recusa nome vazio ou grande demais', () => {
    expect(bad((r) => { r.name = '   '; }).ok).toBe(false);
    expect(bad((r) => { r.name = 'x'.repeat(25); }).ok).toBe(false);
  });
});

describe('importação e exportação', () => {
  it('um perfil exportado volta idêntico', () => {
    const profile = withPanel(defaultProfile('Meu HUD'), 'minimapa', { scale: 1.25, opacity: 0.7, group: 'A' });
    const back = importProfile(exportProfile(profile));
    expect(back).toEqual({ ok: true, profile });
  });

  it('recusa JSON inválido, texto grande demais e objeto malformado, nomeando o motivo', () => {
    expect(importProfile('{ nao e json')).toMatchObject({ ok: false });
    expect(importProfile(' '.repeat(IMPORT_MAX_BYTES + 1))).toMatchObject({ ok: false, errors: [expect.stringContaining('KB')] });
    expect(importProfile('{"name":"x","panels":{}}')).toMatchObject({ ok: false });
  });

  it('importar não aplica nada: o resultado é só um perfil validado', () => {
    const editor = createEditor();
    importProfile(exportProfile(withPanel(defaultProfile('Outro'), 'dock', { visible: false })));
    expect(editor.applied.panels.dock.visible).toBe(true);
  });
});

describe('geometria: colisões, limites e grupos', () => {
  it('deslocar o minimapa para cima da dock gera colisão (aviso) sem bloquear', () => {
    const layout = withPanel(defaultProfile(), 'minimapa', { offsetX: 200 }).panels;
    const report = analyzeLayout(wide, layout);
    expect(report.collisions).toContainEqual(['minimapa', 'dock']);
    expect(report.blocking).toEqual([]);
  });

  it('cobrir o indicador essencial bloqueia ao aplicar, e sair da tela é detectado', () => {
    const phone = VIEWPORTS[3];
    const covering = withPanel(defaultProfile(), 'trilho', { offsetY: -240 }); // sobe o trilho para dentro da faixa de recursos
    const report = analyzeLayout(phone, covering.panels);
    expect(report.collisions).toContainEqual(['recursos', 'trilho']);
    expect(report.blocking.join(' ')).toContain('coberto');
    const blocked = apply(preview(createEditor(), () => covering), phone);
    expect(blocked.ok).toBe(false);

    const off = analyzeLayout(wide, withPanel(defaultProfile(), 'dock', { offsetY: 240 }).panels);
    expect(off.offscreen).toContain('dock');
  });

  it('ocultar um painel do grupo oculta os demais do mesmo grupo', () => {
    let profile = withPanel(defaultProfile(), 'minimapa', { group: 'A' });
    profile = withPanel(profile, 'dock', { group: 'A', visible: false });
    const visible = effectiveVisibility(profile.panels);
    expect(visible.minimapa).toBe(false);
    expect(visible.dock).toBe(false);
    expect(visible.recursos).toBe(true);
  });

  it('um grupo que esconderia o indicador essencial é bloqueado ao aplicar', () => {
    let profile = withPanel(defaultProfile(), 'recursos', { group: 'B' });
    profile = withPanel(profile, 'painel', { group: 'B', visible: false });
    const editor = preview(createEditor(), () => profile);
    const result = apply(editor, wide);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(' ')).toContain('oculto');
  });
});

describe('prévia, aplicar, cancelar e restaurar', () => {
  const edited = (state: EditorState) => preview(state, (d) => withPanel(d, 'minimapa', { scale: 1.5 }));

  it('a prévia não altera o perfil em uso, e cancelar o devolve intacto', () => {
    const start = createEditor();
    const previewing = edited(start);
    expect(previewing.draft?.panels.minimapa.scale).toBe(1.5);
    expect(previewing.applied).toEqual(start.applied);
    expect(cancel(previewing)).toEqual({ ...start, draft: null });
  });

  it('aplicar grava no histórico; desfazer e refazer só mexem na configuração', () => {
    const start = createEditor();
    const applied = apply(edited(start), wide);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.state.applied.panels.minimapa.scale).toBe(1.5);
    expect(applied.state.past).toHaveLength(1);
    const undone = undo(applied.state);
    expect(undone.applied).toEqual(start.applied);
    expect(redo(undone).applied.panels.minimapa.scale).toBe(1.5);
  });

  it('aplicar sem mudança não cria histórico', () => {
    const noChange = apply(preview(createEditor(), (d) => d), wide);
    expect(noChange.ok && noChange.state.past.length).toBe(0);
  });

  it('o histórico tem limite, e uma nova mudança descarta o refazer', () => {
    let state = createEditor();
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) {
      const next = apply(preview(state, (d) => withPanel(d, 'minimapa', { scale: i % 2 ? 1.25 : 1.1 })), wide);
      if (next.ok) state = next.state;
    }
    expect(state.past.length).toBeLessThanOrEqual(HISTORY_LIMIT);
    const back = undo(state);
    expect(back.future).toHaveLength(1);
    const forked = apply(preview(back, (d) => withPanel(d, 'dock', { opacity: 0.5 })), wide);
    expect(forked.ok && forked.state.future).toEqual([]);
  });

  it('restaurar o padrão entra como prévia e só vale ao aplicar', () => {
    const custom = apply(edited(createEditor()), wide);
    if (!custom.ok) throw new Error('esperado ok');
    const resetting = reset(custom.state);
    expect(resetting.applied.panels.minimapa.scale).toBe(1.5);
    expect(resetting.draft?.panels.minimapa.scale).toBe(1);
  });

  it('CONTROLE NEGATIVO: aplicar sem rascunho ou com rascunho inválido é recusado e não muda nada', () => {
    const none = apply(createEditor(), wide);
    expect(none).toMatchObject({ ok: false });
    const broken = preview(createEditor(), (d) => withPanel(d, 'dock', { scale: 9 }));
    const result = apply(broken, wide);
    expect(result.ok).toBe(false);
    expect(broken.applied).toEqual(createEditor().applied);
  });
});

describe('perfis locais', () => {
  it('guarda, carrega como rascunho, substitui pelo mesmo nome e exclui', () => {
    let state = createEditor();
    const custom = apply(preview(state, (d) => withPanel(d, 'minimapa', { scale: 1.25 })), wide);
    if (!custom.ok) throw new Error('esperado ok');
    const saved = saveProfile(custom.state, 'Tático');
    if (!saved.ok) throw new Error(saved.reason);
    state = saved.state;
    expect(state.profiles).toHaveLength(1);
    const again = saveProfile(state, 'Tático');
    expect(again.ok && again.state.profiles).toHaveLength(1);
    const loaded = loadProfile(state, 'Tático');
    expect(loaded.ok && loaded.state.draft?.panels.minimapa.scale).toBe(1.25);
    expect(loaded.ok && loaded.state.applied.panels.minimapa.scale).toBe(1.25); // aplicado já era este; o carregamento só abre o rascunho
    expect(deleteProfile(state, 'Tático').profiles).toEqual([]);
    expect(loadProfile(state, 'Inexistente')).toMatchObject({ ok: false });
  });

  it('respeita o máximo de perfis e nomes inválidos', () => {
    let state = createEditor();
    for (let i = 0; i < MAX_PROFILES; i += 1) {
      const saved = saveProfile(state, `P${i}`);
      if (!saved.ok) throw new Error(saved.reason);
      state = saved.state;
    }
    expect(saveProfile(state, 'extra')).toMatchObject({ ok: false });
    expect(saveProfile(state, 'P0')).toMatchObject({ ok: true });
    expect(saveProfile(createEditor(), '  ')).toMatchObject({ ok: false });
  });

  it('restaurar do armazenamento descarta perfis inválidos, duplicados e excedentes', () => {
    const good = defaultProfile('Bom');
    const broken = { name: 'Quebrado', panels: {} };
    const restored = restoreProfiles([good, broken, good, 'lixo', null]);
    expect(restored.map((p) => p.name)).toEqual(['Bom']);
    expect(restoreProfiles('não é lista')).toEqual([]);
    expect(restoreProfiles(Array.from({ length: 30 }, (_, i) => defaultProfile(`N${i}`)))).toHaveLength(MAX_PROFILES);
  });
});
