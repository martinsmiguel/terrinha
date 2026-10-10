import { useMemo, useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { RESTART_REQUIRED, STATS, STAT_LABEL, diffRules, emptyRules, exportRules, importRules, layeredRows, setDraftValue, type RuleRow } from '../game/rulesAdmin';
import type { RuleSettings } from '../game/unitAttributes';

const LOCAL_KEY = 'terrinha:rules-local';
const UNIT_NAME: Record<string, string> = {
  villager: 'Aldeão', soldier: 'Soldado', cavalry: 'Cavalaria', fishing_boat: 'Barco de pesca', trade_boat: 'Mercante', warship: 'Barco de guerra', wagon: 'Carroça', colonial_transport: 'Transporte colonial',
};

const readLocal = (): RuleSettings | undefined => {
  try { const raw = window.localStorage.getItem(LOCAL_KEY); return raw ? importRules(raw).rules : undefined; } catch { return undefined; }
};

interface RulesPanelProps {
  editable: boolean;
  session: RuleSettings | undefined;
  appliedAt?: { revision: number; atElapsed: number };
  onApply(draft: RuleSettings): void;
  onClose(): void;
}

/** Regras da sessão: formulário e JSON no mesmo rascunho; prévia com diff e impacto; só o host aplica, o convidado consulta e exporta. */
export function RulesPanel({ editable, session, appliedAt, onApply, onClose }: RulesPanelProps) {
  const ref = useDialogFocus<HTMLDivElement>();
  const [local, setLocal] = useState<RuleSettings | undefined>(() => readLocal());
  const [draft, setDraft] = useState<RuleSettings>(() => session ?? emptyRules());
  const [json, setJson] = useState(() => exportRules(session));
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const rows = useMemo(() => layeredRows(local, session, editable ? draft : undefined), [local, session, draft, editable]);
  const changes = useMemo(() => diffRules(session, draft), [session, draft]);

  const edit = (row: RuleRow, raw: string) => {
    const result = setDraftValue(draft, row.unit, row.stat, Number(raw));
    setError(result.error ?? null);
    if (!result.error) { setDraft(result.draft); setJson(exportRules(result.draft)); setPreviewing(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Regras da sessão" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950/95 p-4 text-xs text-slate-200 shadow-2xl outline-none">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold text-amber-300">Regras da sessão</h2>
          <span className="text-[11px] text-slate-400">{editable ? 'Você é o host: pode aplicar.' : 'Somente consulta e exportação (convidado).'}{appliedAt ? ` · última aplicação: revisão ${appliedAt.revision} aos ${Math.round(appliedAt.atElapsed)} s` : ''}</span>
        </div>
        <p className="mb-2 text-[10px] text-slate-400">Camadas: padrão → override local → sessão → rascunho. Mudar {RESTART_REQUIRED.join(', ')} exige reiniciar a partida e não passa por aqui.</p>

        <table className="mb-3 w-full text-left text-[11px]">
          <thead className="text-slate-400"><tr><th className="font-normal">Unidade</th>{STATS.map((stat) => <th key={stat} className="font-normal">{STAT_LABEL[stat]}</th>)}</tr></thead>
          <tbody>
            {Object.keys(UNIT_NAME).map((unit) => (
              <tr key={unit} className="border-t border-slate-800">
                <td className="py-1">{UNIT_NAME[unit]}</td>
                {STATS.map((stat) => {
                  const row = rows.find((r) => r.unit === unit && r.stat === stat)!;
                  return (
                    <td key={stat}>
                      <input type="number" step={stat === 'movePerTick' ? 0.01 : 1} min={row.min} max={row.max} value={row.value} disabled={!editable} aria-label={`${UNIT_NAME[unit]}: ${STAT_LABEL[stat]} (${row.unitLabel}, origem ${row.source}, limite ${row.min} a ${row.max})`}
                        onChange={(event) => edit(row, event.target.value)} className="w-20 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 disabled:opacity-60" />
                      <span className="ml-1 text-[9px] text-slate-500">{row.source}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <label className="mb-1 block text-[11px] text-slate-400" htmlFor="rules-json">JSON (mesmo rascunho do formulário)</label>
        <textarea id="rules-json" value={json} onChange={(event) => setJson(event.target.value)} rows={6} className="mb-2 w-full rounded border border-slate-700 bg-slate-900 p-2 font-mono text-[11px]" />
        {error && <div role="alert" className="mb-2 text-[11px] text-rose-300">{error}</div>}

        {previewing && (
          <div className="mb-2 rounded-lg border border-slate-700 p-2" aria-label="Prévia das mudanças">
            <div className="font-semibold text-slate-100">Prévia: {changes.length === 0 ? 'nenhuma mudança' : `${changes.length} mudança(s)`}</div>
            <ul className="list-disc pl-4 text-[11px]">
              {changes.map((change) => <li key={`${change.unit}-${change.stat}`}>{UNIT_NAME[change.unit]} · {STAT_LABEL[change.stat]}: {change.from} → {change.to}. {change.impact}</li>)}
            </ul>
            <div className="mt-1 text-[10px] text-slate-400">Não exige reiniciar: nenhuma mudança aqui altera semente, topologia nem água estrutural.</div>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => { const r = importRules(json); if (r.error) setError(r.error); else { setError(null); setDraft(r.rules!); setPreviewing(true); } }} disabled={!editable} className="rounded-lg bg-slate-700 px-2.5 py-1 font-semibold hover:bg-slate-600 disabled:opacity-50">Importar JSON e ver prévia</button>
          <button type="button" onClick={() => setPreviewing(true)} disabled={!editable} className="rounded-lg bg-slate-700 px-2.5 py-1 font-semibold hover:bg-slate-600 disabled:opacity-50">Prévia</button>
          <button type="button" onClick={() => { onApply(draft); setPreviewing(false); }} disabled={!editable || changes.length === 0} className="rounded-lg bg-emerald-700 px-2.5 py-1 font-semibold hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50">Aplicar</button>
          <button type="button" onClick={() => { setDraft(session ?? emptyRules()); setJson(exportRules(session)); setPreviewing(false); setError(null); }} className="rounded-lg bg-slate-700 px-2.5 py-1 font-semibold hover:bg-slate-600">Cancelar edição</button>
          <button type="button" onClick={() => { setDraft(emptyRules()); setJson(exportRules(emptyRules())); setPreviewing(true); }} disabled={!editable} title="Volta ao padrão; não desfaz o que as regras anteriores já causaram" className="rounded-lg bg-amber-800 px-2.5 py-1 font-semibold hover:bg-amber-700 disabled:opacity-50">Redefinir ao padrão</button>
          <button type="button" onClick={() => { try { window.localStorage.setItem(LOCAL_KEY, exportRules(session)); setLocal(session); } catch { setError('Não foi possível salvar o override local.'); } }} disabled={!editable} className="rounded-lg bg-slate-700 px-2.5 py-1 font-semibold hover:bg-slate-600 disabled:opacity-50">Salvar sessão como override local</button>
          <button type="button" onClick={() => { const blob = new Blob([exportRules(session)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'terrinha-regras.json'; link.click(); URL.revokeObjectURL(link.href); }} className="rounded-lg bg-slate-700 px-2.5 py-1 font-semibold hover:bg-slate-600">Exportar arquivo</button>
          <button type="button" onClick={onClose} className="ml-auto rounded-lg bg-slate-800 px-2.5 py-1 font-semibold hover:bg-slate-700">Fechar (Esc)</button>
        </div>
      </div>
    </div>
  );
}
