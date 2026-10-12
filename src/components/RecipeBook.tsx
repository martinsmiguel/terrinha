import { useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { CRAFT_DEFS } from '../game/crafts';
import { MASTERY_MAX_LEVEL, normalizeMastery, xpToNext } from '../game/mastery';
import type { GameState } from '../game/model';
import { recipeLock } from '../game/production';
import { RECIPE_DEFS } from '../game/recipes';
import { describeUnlock, nextCraftUnlock, recipeBook } from '../game/recipeBook';
import { ERA_LABEL, ERA_ORDER, type Era } from '../game/tech';

interface RecipeBookProps {
  state: Pick<GameState, 'mastery' | 'techs'>;
  owner: string;
  onClose(): void;
}

type Tab = 'receitas' | 'oficios';

/** Livro do império (#179): receitas do registro com busca e filtros, e ofícios com nível, XP e próximo desbloqueio. */
export function RecipeBook({ state, owner, onClose }: RecipeBookProps) {
  const ref = useDialogFocus<HTMLDivElement>();
  const [tab, setTab] = useState<Tab>('receitas');
  const [query, setQuery] = useState('');
  const [era, setEra] = useState<Era | 'todas'>('todas');
  const [craft, setCraft] = useState<string>('todos');
  const entries = recipeBook({ query, era, craft });
  const mastery = normalizeMastery(state.mastery?.[owner]);
  const control = 'min-h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-2 sm:p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Livro do império"
        onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/95 text-sm text-slate-200 shadow-2xl outline-none">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 p-3">
          <h2 className="text-base font-bold text-amber-300">Livro do império <span className="ml-1 text-xs font-normal text-slate-400">Alt+L / Esc fecham</span></h2>
          <div role="tablist" aria-label="Seções do livro" className="flex gap-1">
            {(['receitas', 'oficios'] as const).map((id) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`min-h-9 rounded-lg px-3 text-xs font-bold ${tab === id ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>
                {id === 'receitas' ? 'Receitas' : 'Ofícios'}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar o livro" className="min-h-9 min-w-9 rounded-lg bg-slate-800 px-2 text-slate-300 hover:bg-slate-700">✕</button>
        </div>

        {tab === 'receitas' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-[1fr_auto_auto]">
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar receita, item ou construção" aria-label="Buscar receita" className={control} />
              <select value={era} onChange={(event) => setEra(event.target.value as Era | 'todas')} aria-label="Filtrar por era" className={control}>
                <option value="todas">Todas as eras</option>
                {ERA_ORDER.map((id) => <option key={id} value={id}>{ERA_LABEL[id]}</option>)}
              </select>
              <select value={craft} onChange={(event) => setCraft(event.target.value)} aria-label="Filtrar por ofício" className={control}>
                <option value="todos">Todos os ofícios</option>
                {CRAFT_DEFS.filter((def) => RECIPE_DEFS.some((recipe) => recipe.craft === def.id)).map((def) => <option key={def.id} value={def.id}>{def.name}</option>)}
              </select>
            </div>
            <p className="px-3 text-[11px] text-slate-400" aria-live="polite">{entries.length} de {RECIPE_DEFS.length} receitas</p>
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 pt-2" aria-label="Receitas">
              {entries.length === 0 && <li className="text-xs text-slate-400">Nenhuma receita com esse filtro.</li>}
              {entries.map((entry) => {
                const lock = recipeLock(state, owner, RECIPE_DEFS.find((recipe) => recipe.id === entry.id)!);
                return (
                  <li key={entry.id} className={`rounded-xl border p-2.5 ${lock ? 'border-slate-800 bg-slate-900/60' : 'border-emerald-700/50 bg-emerald-950/20'}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-semibold text-slate-100">{entry.name}</span>
                      <span className="text-[11px] text-slate-400">{entry.station} · {entry.craftName} {entry.level} · {entry.eraLabel}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-amber-200">{entry.formula}</div>
                    {entry.unlocks.length > 0 && <div className="text-[11px] text-sky-300">Abre: {entry.unlocks.join(', ')}</div>}
                    <div className={`text-[11px] ${lock ? 'text-red-300' : 'text-emerald-300'}`}>{lock ? `Falta: ${lock}` : 'Disponível'}</div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <ul className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto p-3 sm:grid-cols-2" aria-label="Ofícios do império">
            {CRAFT_DEFS.map((def) => {
              const level = mastery?.level[def.id] ?? 1;
              const xp = mastery?.xp[def.id] ?? 0;
              const toNext = level >= MASTERY_MAX_LEVEL ? null : xpToNext(level);
              const next = nextCraftUnlock(state.mastery, owner, def.id);
              return (
                <li key={def.id} className="rounded-xl border border-slate-800 p-2.5">
                  <div className="flex justify-between"><span className="font-semibold">{def.name}</span><span className="font-mono text-amber-200">nível {level}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-800" role="progressbar" aria-label={`XP de ${def.name}`} aria-valuemin={0} aria-valuemax={toNext ?? 1} aria-valuenow={toNext ? Math.floor(xp) : 1}>
                    <div className="h-full bg-amber-500" style={{ width: toNext ? `${Math.min(100, (xp / toNext) * 100)}%` : '100%' }} />
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-400">{toNext ? `${Math.floor(xp)} / ${toNext} XP` : 'nível máximo'} · {def.learnedBy}</div>
                  <div className="mt-1 text-[11px] text-sky-300" data-testid={`next-${def.id}`}>
                    {next ? `Nível ${next.level} abre: ${next.items.map(describeUnlock).join(', ')}` : 'Nada mais a destravar por enquanto.'}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
