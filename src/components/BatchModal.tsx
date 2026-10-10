import { useDialogFocus } from '../hooks/useDialogFocus';
import type { BatchPreview } from '../game/batchOrders';

interface BatchModalProps {
  title: string;
  preview: BatchPreview;
  onConfirm(): void;
  onCancel(): void;
}

/** Prévia do comando em lote: todos os alvos, donos e efeitos; cancelar não muda a partida e Esc cancela. */
export function BatchModal({ title, preview, onConfirm, onCancel }: BatchModalProps) {
  const ref = useDialogFocus<HTMLDivElement>();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Comando em lote" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); } }}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950/95 p-4 text-xs text-slate-200 shadow-2xl outline-none">
        <h2 className="mb-1 text-base font-bold text-amber-300">Comando em lote</h2>
        <p className="mb-2 text-slate-300">{title}</p>
        <div className="mb-2 font-semibold text-slate-100">{preview.rows.length} unidade(s) serão afetadas</div>
        <ul className="mb-2 max-h-48 list-disc overflow-y-auto pl-4" aria-label="Alvos do lote">
          {preview.rows.map((row) => <li key={row.unitId}>{row.unit} ({row.owner === 'player1' ? 'sua' : row.owner}): {row.effect}</li>)}
        </ul>
        {preview.skipped.length > 0 && (
          <div className="mb-2 rounded-lg border border-amber-700/60 p-2" aria-label="Pulados">
            <div className="font-semibold text-amber-300">{preview.skipped.length} pulada(s)</div>
            <ul className="list-disc pl-4 text-[11px]">{preview.skipped.map((skip) => <li key={skip.unitId}>{skip.unitId.slice(0, 8)}: {skip.reason}</li>)}</ul>
          </div>
        )}
        <p className="mb-3 text-[10px] text-slate-400">Cancelar não muda nada. Depois de confirmar, o desfazer vale por 60 s e só reverte quem ainda executa esta ordem; recursos coletados não voltam e unidades mortas não ressuscitam.</p>
        <div className="flex gap-2">
          <button type="button" onClick={onConfirm} disabled={preview.rows.length === 0} className="rounded-lg bg-emerald-700 px-3 py-1 font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50">Confirmar nos alvos listados</button>
          <button type="button" onClick={onCancel} className="rounded-lg bg-slate-700 px-3 py-1 font-semibold hover:bg-slate-600">Cancelar (Esc)</button>
        </div>
      </div>
    </div>
  );
}
