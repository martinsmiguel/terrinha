import { useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { BOT_PROFILE_LABEL, type BotProfile } from '../game/bots';
import { MAX_NAME_LENGTH } from '../game/identity';
import { normalizeSearch } from '../game/recipeBook';
import { WORLD_SIZE_OPTIONS } from '../game/worldConfig';
import type { HudAccessibility } from '../game/hudAccessibility';
import { AccessibilityPanel } from './AccessibilityPanel';

type Group = 'jogo' | 'interface' | 'som' | 'acessibilidade';
type HudMode = 'full' | 'compact' | 'hidden';

interface SettingsScreenProps {
  /** Na partida, o que só vale para a próxima aparece marcado. */
  inGame: boolean;
  playerName: string;
  onPlayerName(name: string): void;
  botProfile: BotProfile;
  onBotProfile(profile: BotProfile): void;
  /** Mudar a IA vale já na partida (solo ou host); para convidado, só na próxima. */
  botLive: boolean;
  worldSize: number;
  onWorldSize(size: number): void;
  matchSize: 2 | 3 | 4;
  onMatchSize(size: 2 | 3 | 4): void;
  cameraLocked: boolean;
  onCameraLocked(locked: boolean): void;
  hudMode: HudMode;
  onHudMode(mode: HudMode): void;
  muted: boolean;
  onMuted(muted: boolean): void;
  accessibility: { settings: HudAccessibility; appliedScale: number; update(change: (current: HudAccessibility) => HudAccessibility): void; reset(): void };
  onClose(): void;
}

const GROUPS: { id: Group; label: string; keywords: string }[] = [
  { id: 'jogo', label: 'Jogo', keywords: 'nome nick ia comportamento mundo tamanho jogadores rivais' },
  { id: 'interface', label: 'Interface', keywords: 'camera câmera fixa bordas hud compacto oculto' },
  { id: 'som', label: 'Som', keywords: 'som audio áudio mudo volume' },
  { id: 'acessibilidade', label: 'Acessibilidade', keywords: 'escala tamanho contraste daltonismo cores teclas atalhos' },
];

const Next = () => <span className="ml-1 rounded bg-sky-900/60 px-1.5 py-0.5 text-[10px] font-semibold text-sky-200">próxima partida</span>;
const choice = (active: boolean) =>
  `min-h-10 rounded-xl border px-3 text-xs font-semibold transition-colors ${active ? 'border-amber-500/60 bg-amber-500/15 text-amber-200' : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:text-white'}`;

/**
 * Configurações (#199): abrem no menu principal e no menu do jogo, sem reiniciar o servidor. O que pode mudar com a
 * partida rodando aplica na hora; o que é do mundo fica para a próxima partida e diz isso. Lembradas no navegador.
 */
export function SettingsScreen(props: SettingsScreenProps) {
  const ref = useDialogFocus<HTMLDivElement>();
  const [group, setGroup] = useState<Group>('jogo');
  const [query, setQuery] = useState('');
  const [name, setName] = useState(props.playerName);
  const q = normalizeSearch(query);
  const visible = q ? GROUPS.filter((g) => normalizeSearch(`${g.label} ${g.keywords}`).includes(q)) : GROUPS;
  const active = visible.some((g) => g.id === group) ? group : visible[0]?.id;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-2 sm:p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Configurações"
        onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); props.onClose(); } }}
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/95 text-slate-200 shadow-2xl outline-none">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <h2 className="text-base font-bold text-amber-300">Configurações</h2>
          <button type="button" onClick={props.onClose} aria-label="Fechar configurações" className="min-h-9 min-w-9 rounded-lg bg-slate-800 px-2 text-slate-300 hover:bg-slate-700">✕</button>
        </div>
        <div className="space-y-2 border-b border-slate-800 p-3">
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar configuração (ex.: câmera, som, IA)" aria-label="Buscar configuração"
            className="min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white focus:border-amber-500 focus:outline-none" />
          <div role="tablist" aria-label="Grupos" className="flex flex-wrap gap-1.5">
            {visible.map((g) => (
              <button key={g.id} type="button" role="tab" aria-selected={active === g.id} onClick={() => setGroup(g.id)}
                className={`min-h-9 rounded-lg px-3 text-xs font-bold ${active === g.id ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>{g.label}</button>
            ))}
            {visible.length === 0 && <p className="text-xs text-slate-400">Nenhuma configuração com esse nome.</p>}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
          {active === 'jogo' && (
            <>
              <section className="space-y-1.5">
                <label htmlFor="settings-name" className="block font-semibold">Seu nome</label>
                <div className="flex gap-2">
                  <input id="settings-name" value={name} maxLength={MAX_NAME_LENGTH} onChange={(event) => setName(event.target.value)}
                    className="min-h-10 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-white focus:border-amber-500 focus:outline-none" />
                  <button type="button" onClick={() => props.onPlayerName(name)} className="min-h-10 rounded-xl bg-amber-500 px-3 text-xs font-bold text-slate-950 hover:bg-amber-400">Salvar</button>
                </div>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-semibold">Comportamento da IA {!props.botLive && props.inGame && <Next />}</h3>
                <div className="grid grid-cols-3 gap-2">
                  {(['peaceful', 'defensive', 'raids'] as const).map((profile) => (
                    <button key={profile} type="button" aria-pressed={props.botProfile === profile} onClick={() => props.onBotProfile(profile)} className={choice(props.botProfile === profile)}>{BOT_PROFILE_LABEL[profile]}</button>
                  ))}
                </div>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-semibold">Jogadores no treino solo (você + IA) {props.inGame && <Next />}</h3>
                <div className="grid grid-cols-3 gap-2">
                  {([2, 3, 4] as const).map((size) => (
                    <button key={size} type="button" aria-pressed={props.matchSize === size} onClick={() => props.onMatchSize(size)} className={choice(props.matchSize === size)}>{size} jogadores</button>
                  ))}
                </div>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-semibold">Tamanho do mundo {props.inGame && <Next />}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {WORLD_SIZE_OPTIONS.map((option) => (
                    <button key={option.size} type="button" aria-pressed={props.worldSize === option.size} onClick={() => props.onWorldSize(option.size)} className={choice(props.worldSize === option.size)}>{option.label}</button>
                  ))}
                </div>
              </section>
            </>
          )}

          {active === 'interface' && (
            <>
              <section className="space-y-1.5">
                <h3 className="font-semibold">Câmera</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" aria-pressed={props.cameraLocked} onClick={() => props.onCameraLocked(true)} className={choice(props.cameraLocked)}>Fixa (padrão)</button>
                  <button type="button" aria-pressed={!props.cameraLocked} onClick={() => props.onCameraLocked(false)} className={choice(!props.cameraLocked)}>Livre: rola pelas bordas</button>
                </div>
                <p className="text-xs text-slate-400">A tecla L alterna durante o jogo.</p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-semibold">HUD</h3>
                <div className="grid grid-cols-3 gap-2">
                  {(['full', 'compact', 'hidden'] as const).map((mode) => (
                    <button key={mode} type="button" aria-pressed={props.hudMode === mode} onClick={() => props.onHudMode(mode)} className={choice(props.hudMode === mode)}>{mode === 'full' ? 'Cheio' : mode === 'compact' ? 'Compacto' : 'Oculto'}</button>
                  ))}
                </div>
              </section>
            </>
          )}

          {active === 'som' && (
            <section className="space-y-1.5">
              <h3 className="font-semibold">Som do jogo</h3>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" aria-pressed={!props.muted} onClick={() => props.onMuted(false)} className={choice(!props.muted)}>Ligado</button>
                <button type="button" aria-pressed={props.muted} onClick={() => props.onMuted(true)} className={choice(props.muted)}>Mudo</button>
              </div>
            </section>
          )}

          {active === 'acessibilidade' && (
            <AccessibilityPanel settings={props.accessibility.settings} appliedScale={props.accessibility.appliedScale} onChange={props.accessibility.update} onReset={props.accessibility.reset} />
          )}
        </div>
      </div>
    </div>
  );
}
