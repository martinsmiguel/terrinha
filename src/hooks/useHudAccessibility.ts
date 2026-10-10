import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_HUD_ACCESSIBILITY, applyBindings, colorMatrixValues, effectiveScale, restoreAccessibility,
  type HudAccessibility,
} from '../game/hudAccessibility';

const STORAGE_KEY = 'terrinha:hud-accessibility';
const FILTER_ID = 'terrinha-color-profile';
const SVG_NS = 'http://www.w3.org/2000/svg';

function load(): HudAccessibility {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? restoreAccessibility(JSON.parse(raw)) : DEFAULT_HUD_ACCESSIBILITY;
  } catch { return DEFAULT_HUD_ACCESSIBILITY; }
}

/** Mantém no documento o filtro SVG do perfil de daltonismo; sem perfil, remove filtro e elemento. */
function applyColorFilter(values: string | null): void {
  const root = document.documentElement;
  document.getElementById(`${FILTER_ID}-svg`)?.remove();
  if (!values) { root.style.removeProperty('filter'); return; }
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.id = `${FILTER_ID}-svg`;
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.innerHTML = `<filter id="${FILTER_ID}" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="${values}"/></filter>`;
  document.body.appendChild(svg);
  root.style.filter = `url(#${FILTER_ID})`;
}

/**
 * Dono único da acessibilidade local do HUD: escala, alto contraste, perfil de daltonismo e teclas.
 * Persiste só neste navegador e nunca toca seleção, câmera, ordens nem simulação.
 */
export function useHudAccessibility() {
  const [settings, setSettings] = useState<HudAccessibility>(load);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* vale só nesta sessão */ }
  }, [settings]);

  const applied = effectiveScale(settings.scale, viewportWidth);
  useEffect(() => {
    document.documentElement.style.fontSize = `${applied}%`;
    return () => { document.documentElement.style.removeProperty('font-size'); };
  }, [applied]);

  useEffect(() => {
    if (settings.highContrast) document.documentElement.dataset.hudContrast = 'aaa';
    else delete document.documentElement.dataset.hudContrast;
  }, [settings.highContrast]);

  useEffect(() => {
    applyColorFilter(colorMatrixValues(settings.colorProfile));
    return () => applyColorFilter(null);
  }, [settings.colorProfile]);

  const update = useCallback((change: (current: HudAccessibility) => HudAccessibility) => setSettings(change), []);
  const reset = useCallback(() => setSettings(DEFAULT_HUD_ACCESSIBILITY), []);
  const hotkeys = useMemo(() => applyBindings(settings.bindings), [settings.bindings]);

  return { settings, appliedScale: applied, hotkeys, update, reset };
}
