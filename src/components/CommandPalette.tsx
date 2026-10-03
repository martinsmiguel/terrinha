import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, CornerDownLeft, Search } from 'lucide-react';

export interface CommandPaletteItem {
  id: string;
  label: string;
  detail: string;
  keywords?: string;
  shortcut?: string;
}

interface CommandPaletteProps {
  open: boolean;
  items: CommandPaletteItem[];
  onChoose: (id: string) => void;
  onClose: () => void;
  onPointerChange?: (isOver: boolean) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, items, onChoose, onClose, onPointerChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    if (!normalized) return items;
    return items.filter((item) => `${item.label} ${item.detail} ${item.keywords ?? ''}`.toLocaleLowerCase('pt-BR').includes(normalized));
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);
  if (!open) return null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(results.length - 1, index + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
    else if (event.key === 'Enter' && results[activeIndex]) { event.preventDefault(); onChoose(results[activeIndex].id); }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/60 pt-[12vh] backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} onMouseEnter={() => onPointerChange?.(true)} onMouseLeave={() => onPointerChange?.(false)}>
      <section className="mx-auto w-[min(640px,calc(100%-24px))] overflow-hidden rounded-xl border border-slate-600/80 bg-[#171b22] shadow-[0_24px_90px_rgba(0,0,0,.75)]">
        <div className="flex items-center gap-3 border-b border-slate-700/80 px-4">
          <Search className="h-4 w-4 shrink-0 text-amber-300" />
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleKeyDown} placeholder="Pesquisar um menu ou ação..." className="h-12 min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500" aria-label="Pesquisar menus e ações" />
          <kbd className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">ESC</kbd>
        </div>
        <div className="max-h-[min(58vh,520px)] overflow-y-auto p-1.5">
          {results.length === 0 ? <p className="px-4 py-8 text-center text-xs text-slate-500">Nenhum menu ou comando encontrado.</p> : results.map((item, index) => (
            <button key={item.id} type="button" onMouseEnter={() => setActiveIndex(index)} onClick={() => onChoose(item.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${index === activeIndex ? 'bg-amber-500/10 text-amber-100' : 'text-slate-300 hover:bg-slate-800/70'}`}>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border text-xs font-semibold ${index === activeIndex ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>{item.label.slice(0, 1)}</span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.label}</span><span className="block truncate text-[10px] text-slate-500">{item.detail}</span></span>
              {item.shortcut && <kbd className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{item.shortcut}</kbd>}
            </button>
          ))}
        </div>
        <footer className="flex items-center justify-between border-t border-slate-800 px-3 py-2 text-[10px] text-slate-500"><span><ArrowUp className="mr-1 inline h-3 w-3" /> Navegar <span className="mx-2">↓</span> selecionar</span><span><CornerDownLeft className="mr-1 inline h-3 w-3" /> abrir</span></footer>
      </section>
    </div>
  );
};
