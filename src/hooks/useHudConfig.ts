import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import {
  DEFAULT_HUD_CONFIG, applyComposition, commit, createHistory, nextComposition, redo as redoHistory, restoreConfig, undo as undoHistory,
  type HudComposition, type HudConfig, type HudHistory, type HudMode,
} from '../game/hudConfig';

const STORAGE_KEY = 'terrinha:hud-config';
/** Inatividade (sem mouse, teclado ou toque) até o recolhimento opcional. */
export const IDLE_COLLAPSE_MS = 20000;

function load(startHidden: boolean, narrow: boolean): HudConfig {
  let config = DEFAULT_HUD_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) config = restoreConfig(JSON.parse(raw));
    else if (narrow) config = { ...config, minimapCollapsed: true };
  } catch { /* sem armazenamento: usa o padrão */ }
  return startHidden ? { ...config, mode: 'hidden' } : config;
}

const resolve = <T,>(action: SetStateAction<T>, current: T): T => (typeof action === 'function' ? (action as (value: T) => T)(current) : action);

/**
 * Dono único da configuração do HUD. Toda mudança passa pelo histórico (limite de 50, só configuração) e a recarga
 * restaura apenas a configuração. Não toca seleção, câmera, ordens nem simulação.
 */
export function useHudConfig(options: { startHidden: boolean }) {
  const [history, setHistory] = useState<HudHistory>(() =>
    createHistory(load(options.startHidden, typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches)));
  const ref = useRef(history);
  ref.current = history;

  const write = useCallback((next: HudHistory) => {
    ref.current = next;
    setHistory(next);
  }, []);

  const patch = useCallback((change: (config: HudConfig) => HudConfig) => {
    write(commit(ref.current, change(ref.current.present)));
  }, [write]);

  useEffect(() => {
    try {
      const { panelOpen: _panel, ...persisted } = history.present;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch { /* armazenamento indisponível: a configuração vale só nesta sessão */ }
  }, [history.present]);

  // Inatividade opcional: desligada por padrão; ao ligar, recolhe o HUD completo para o compacto.
  const idle = history.present.idleCollapse && history.present.mode === 'full';
  useEffect(() => {
    if (!idle) return undefined;
    let timer = window.setTimeout(collapse, IDLE_COLLAPSE_MS);
    function collapse() { patch((config) => (config.mode === 'full' ? { ...config, mode: 'compact' } : config)); }
    const wake = () => { window.clearTimeout(timer); timer = window.setTimeout(collapse, IDLE_COLLAPSE_MS); };
    const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((name) => window.addEventListener(name, wake, { passive: true }));
    return () => { window.clearTimeout(timer); events.forEach((name) => window.removeEventListener(name, wake)); };
  }, [idle, patch]);

  return {
    config: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    historySize: history.past.length,
    /** Setters com a mesma assinatura dos useState que substituem. */
    setMode: useCallback((action: SetStateAction<HudMode>) => patch((c) => ({ ...c, mode: resolve(action, c.mode) })), [patch]),
    setMinimapCollapsed: useCallback((action: SetStateAction<boolean>) => patch((c) => ({ ...c, minimapCollapsed: resolve(action, c.minimapCollapsed) })), [patch]),
    setSelectionCollapsed: useCallback((action: SetStateAction<boolean>) => patch((c) => ({ ...c, selectionCollapsed: resolve(action, c.selectionCollapsed) })), [patch]),
    setPanelOpen: useCallback((action: SetStateAction<boolean>) => patch((c) => ({ ...c, panelOpen: resolve(action, c.panelOpen) })), [patch]),
    setIdleCollapse: useCallback((value: boolean) => patch((c) => ({ ...c, idleCollapse: value })), [patch]),
    setComposition: useCallback((composition: HudComposition) => patch((c) => applyComposition(c, composition)), [patch]),
    cycleComposition: useCallback(() => patch((c) => applyComposition(c, nextComposition(c.composition))), [patch]),
    undo: useCallback(() => write(undoHistory(ref.current)), [write]),
    redo: useCallback(() => write(redoHistory(ref.current)), [write]),
  };
}
