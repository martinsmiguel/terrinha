import { useDialogFocus } from '../hooks/useDialogFocus';
import { MASTERY_IDS, MASTERY_LABEL, MASTERY_MAX_LEVEL, xpToNext, type MasteryState } from '../game/mastery';
import { TALENTS, canBuyTalent } from '../game/talents';
import type { GameState } from '../game/model';

interface TalentPanelProps {
  state: Pick<GameState, 'mastery' | 'talents'>;
  owner: string;
  onBuy(id: string): void;
  onClose(): void;
}

/** Constelação de talentos: lê o estado real do host; a compra é um comando autorizado e a partida segue rodando por trás. */
export function TalentPanel({ state, owner, onBuy, onClose }: TalentPanelProps) {
  const ref = useDialogFocus<HTMLDivElement>();
  const mastery: MasteryState | undefined = state.mastery?.[owner];
  const owned = state.talents?.[owner] ?? [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Talentos" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950/95 p-4 text-sm text-slate-200 shadow-2xl outline-none">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-amber-300">Talentos <span className="ml-2 text-xs font-normal text-slate-400">a partida continua rodando · Alt+T / Esc fecham</span></h2>
          <span className="rounded-lg bg-amber-500/15 px-2 py-0.5 font-mono text-amber-200" aria-live="polite">Pontos: {mastery?.points ?? 0}</span>
        </div>

        <ul className="mb-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2" aria-label="Maestrias">
          {MASTERY_IDS.map((id) => {
            const level = mastery?.level[id] ?? 1;
            const xp = mastery?.xp[id] ?? 0;
            const next = level >= MASTERY_MAX_LEVEL ? null : xpToNext(level);
            return (
              <li key={id} className="rounded-lg border border-slate-800 px-2.5 py-1.5">
                <div className="flex justify-between"><span>{MASTERY_LABEL[id]}</span><span className="font-mono text-amber-200">nível {level}{level >= MASTERY_MAX_LEVEL ? ' (máx.)' : ''}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-800"><div className="h-full bg-amber-500" style={{ width: next ? `${Math.min(100, (xp / next) * 100)}%` : '100%' }} /></div>
                <div className="mt-0.5 text-[10px] text-slate-400">{next ? `${Math.floor(xp)} / ${next} XP` : 'sem XP além do nível 10'}</div>
              </li>
            );
          })}
        </ul>

        <ul className="space-y-1.5" aria-label="Constelação de talentos">
          {TALENTS.map((talent) => {
            const has = owned.includes(talent.id);
            const check = canBuyTalent(state, owner, talent.id);
            const prereq = talent.requires ? TALENTS.find((t) => t.id === talent.requires)?.name : null;
            return (
              <li key={talent.id} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${has ? 'border-emerald-700/60 bg-emerald-950/30' : 'border-slate-800'}`}>
                <div>
                  <div className="font-semibold">{talent.name} <span className="text-[10px] font-normal text-slate-400">{MASTERY_LABEL[talent.mastery]} nível {talent.level}{prereq ? ` · exige ${prereq}` : ''} · custo {talent.cost} ponto</span></div>
                  <div className="text-[11px] text-slate-300">{talent.effect}</div>
                  {!has && !check.ok && <div className="text-[10px] text-amber-300">{check.message}</div>}
                </div>
                {has
                  ? <span className="text-[11px] font-semibold text-emerald-300">Adquirido</span>
                  : <button type="button" disabled={!check.ok} onClick={() => onBuy(talent.id)} title={check.ok ? 'Comprar este talento' : check.message}
                      className={`rounded-lg px-3 py-1 text-[11px] font-bold ${check.ok ? 'bg-amber-600 text-white hover:bg-amber-500' : 'cursor-not-allowed bg-slate-800 text-slate-500'}`}>Comprar</button>}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
