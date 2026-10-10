import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { searchPalette, type OrderContext, type PaletteEntry, type PaletteLocality } from '../game/commandPalette';

interface CommandPaletteProps {
  discovered: readonly PaletteLocality[];
  orders?: OrderContext;
  onClose(): void;
  /** `centralize` só vale para localidades: Shift+Enter move a câmera; Enter apenas foca. */
  onRun(entry: PaletteEntry, centralize: boolean): void;
}

/** Busca Ctrl/Cmd+K: setas navegam, Enter executa, Esc fecha e devolve o foco; nada age na partida atrás dela. */
export function CommandPalette({ discovered, orders, onClose, onRun }: CommandPaletteProps) {
  const dialogRef = useDialogFocus<HTMLDivElement>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const result = useMemo(() => searchPalette(query, discovered, orders), [query, discovered, orders]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(i + 1, Math.max(0, result.entries.length - 1))); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = result.entries[active];
      if (entry && !entry.disabledReason) onRun(entry, event.shiftKey);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-3 pt-[12vh] backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Buscar menu, tecnologia ou localidade" onKeyDown={onKeyDown}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/95 shadow-2xl outline-none">
        <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar ações · # tecnologias · @ localidades · ! ordens e ociosos" aria-label="Busca"
            role="combobox" aria-expanded="true" aria-controls="palette-results" aria-activedescendant={result.entries[active] ? `palette-${result.entries[active].id}` : undefined}
            className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500" />
          <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">Esc</kbd>
        </div>
        <ul id="palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5 text-sm">
          {result.empty && <li role="status" className="px-3 py-4 text-center text-slate-400">Nenhum resultado{query ? ` para "${query}"` : ''}.</li>}
          {result.entries.map((entry, index) => (
            <li key={entry.id} id={`palette-${entry.id}`} role="option" aria-selected={index === active} onMouseMove={() => setActive(index)} onClick={() => { if (!entry.disabledReason) onRun(entry, false); }}
              aria-disabled={Boolean(entry.disabledReason)} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 ${entry.disabledReason ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${index === active ? 'bg-amber-500/15 text-amber-100' : 'text-slate-300'}`}>
              <span>
                <span className="mr-2 text-[10px] uppercase text-slate-500">{entry.group}</span>{entry.label}
                {entry.group !== 'Ações' && <span className="block text-[11px] text-slate-500">{entry.description}</span>}
                {entry.disabledReason && <span className="block text-[11px] text-amber-300">{entry.disabledReason}</span>}
              </span>
              {entry.shortcut && <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">{entry.shortcut}</kbd>}
              {entry.group === 'Localidades' && <span className="text-[10px] text-slate-500">Enter foca · Shift+Enter centraliza</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
