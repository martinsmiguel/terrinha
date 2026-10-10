import { useState, type KeyboardEvent } from 'react';
import { HOTKEYS } from '../game/hotkeys';
import {
  COLOR_PROFILES, COLOR_PROFILE_LABEL, HUD_SCALE_MAX, HUD_SCALE_MIN, HUD_SCALE_STEP, checkBinding, clampScale, hotkeyId,
  type ColorProfile, type HudAccessibility,
} from '../game/hudAccessibility';

interface AccessibilityPanelProps {
  settings: HudAccessibility;
  appliedScale: number;
  onChange(change: (current: HudAccessibility) => HudAccessibility): void;
  onReset(): void;
}

const keyLabel = (key: string) => (key === ' ' ? 'Espaço' : key.toUpperCase());

/** Acessibilidade local do HUD: escala, alto contraste, daltonismo e remapeamento de teclas (card #115). */
export function AccessibilityPanel({ settings, appliedScale, onChange, onReset }: AccessibilityPanelProps) {
  const [listening, setListening] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('');

  const capture = (id: string) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (listening !== id) return;
    event.preventDefault();
    event.stopPropagation(); // Esc cancela a captura sem fechar o diálogo
    if (event.key === 'Escape') { setListening(null); setMessage(''); return; }
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
    const result = checkBinding(id, event.key, settings.bindings);
    if (!result.ok) { setMessage(result.reason); return; }
    onChange((current) => ({ ...current, bindings: { ...current.bindings, [id]: event.key.toLowerCase() } }));
    setListening(null);
    setMessage('');
  };

  return (
    <section aria-labelledby="a11y-title" className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 space-y-3 text-xs text-slate-300">
      <h3 id="a11y-title" className="font-bold text-amber-300">Acessibilidade do HUD</h3>

      <label className="flex flex-col gap-1">
        <span>Escala do HUD: <strong className="text-white">{settings.scale}%</strong>
          {appliedScale !== settings.scale && <span className="text-amber-300"> (aplicada {appliedScale}% nesta largura de tela)</span>}</span>
        <input type="range" min={HUD_SCALE_MIN} max={HUD_SCALE_MAX} step={HUD_SCALE_STEP} value={settings.scale}
          onChange={(e) => onChange((current) => ({ ...current, scale: clampScale(Number(e.target.value)) }))} />
      </label>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={settings.highContrast} onChange={(e) => onChange((current) => ({ ...current, highContrast: e.target.checked }))} />
        <span>Alto contraste (7:1) nos textos secundários e de alerta</span>
      </label>

      <label className="flex flex-col gap-1">
        <span>Perfil de daltonismo</span>
        <select value={settings.colorProfile} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white"
          onChange={(e) => onChange((current) => ({ ...current, colorProfile: e.target.value as ColorProfile }))}>
          {COLOR_PROFILES.map((profile) => <option key={profile} value={profile}>{COLOR_PROFILE_LABEL[profile]}</option>)}
        </select>
      </label>

      <div>
        <div className="font-bold text-slate-200 mb-1">Teclas de atalho</div>
        <p className="text-slate-400 mb-2">Clique em uma tecla e pressione a nova. W, A, S, D, setas e Esc são reservadas.</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {HOTKEYS.map((def) => {
            const id = hotkeyId(def);
            const key = settings.bindings[id] ?? def.key;
            return (
              <li key={id} className="flex items-center justify-between gap-2">
                <span>{def.description}</span>
                <button type="button" aria-label={`${def.description}: tecla ${keyLabel(key)}. Ativar para redefinir`}
                  onClick={() => { setListening(id); setMessage(''); }} onKeyDown={capture(id)} onBlur={() => listening === id && setListening(null)}
                  className={`min-w-[3.5rem] px-2 py-0.5 rounded-lg font-mono ${listening === id ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-100'} ${settings.bindings[id] ? 'ring-1 ring-cyan-400' : ''}`}>
                  {listening === id ? 'Pressione…' : keyLabel(key)}
                </button>
              </li>
            );
          })}
        </ul>
        <div role="status" aria-live="polite" className="min-h-4 mt-1 text-red-400">{message}</div>
      </div>

      <button type="button" onClick={onReset} className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100">Restaurar padrões</button>
    </section>
  );
}
