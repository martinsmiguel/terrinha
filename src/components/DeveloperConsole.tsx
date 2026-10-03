import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { Terminal, X } from 'lucide-react';

interface DeveloperConsoleProps {
  open: boolean;
  onClose: () => void;
  onCommand: (input: string) => string;
  onPointerChange: (isOver: boolean) => void;
}

export const DeveloperConsole: React.FC<DeveloperConsoleProps> = ({ open, onClose, onCommand, onPointerChange }) => {
  const [input, setInput] = useState('');
  const [lines, setLines] = useState<string[]>([
    'Modo desenvolvedor — testes locais da partida solo.',
    'Digite “ajuda” para consultar os comandos.',
  ]);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [lines]);

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const command = input.trim();
    if (!command) return;
    const result = onCommand(command);
    setLines((previous) => [...previous, `> ${command}`, ...result.split('\n').map((line) => `  ${line}`)].slice(-48));
    setInput('');
  };

  return (
    <section
      aria-label="Terminal do modo desenvolvedor"
      className="absolute z-[70] right-3 bottom-24 sm:right-5 sm:bottom-28 w-[min(560px,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-cyan-500/50 bg-slate-950/95 shadow-[0_20px_70px_rgba(0,0,0,.65)] backdrop-blur-xl"
      onMouseEnter={() => onPointerChange(true)}
      onMouseLeave={() => onPointerChange(false)}
    >
      <header className="flex items-center justify-between border-b border-cyan-900/70 bg-cyan-950/40 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-cyan-200">
          <Terminal className="h-4 w-4 text-cyan-400" /> Terminal <span className="rounded border border-amber-500/40 px-1.5 py-0.5 text-[9px] text-amber-300">DEV · SOLO</span>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Fechar terminal">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div ref={outputRef} className="h-48 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-5 text-emerald-200 sm:h-56" aria-live="polite">
        {lines.map((line, index) => <div key={`${index}-${line}`} className={line.startsWith('>') ? 'text-cyan-300' : ''}>{line}</div>)}
      </div>
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-slate-800 bg-slate-900/80 px-3 py-2">
        <span className="font-mono text-sm text-cyan-400">›</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}
          className="min-w-0 flex-1 bg-transparent font-mono text-xs text-white outline-none placeholder:text-slate-600"
          placeholder="digite um comando…"
          aria-label="Comando de desenvolvedor"
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[9px] text-slate-500">ENTER</kbd>
      </form>
      <div className="flex flex-wrap gap-1.5 border-t border-slate-800/80 px-3 py-2">
        {['ajuda', 'recursos max', 'viagem', 'ilha 2'].map((command) => (
          <button key={command} type="button" onClick={() => { const result = onCommand(command); setLines((previous) => [...previous, `> ${command}`, ...result.split('\n').map((line) => `  ${line}`)].slice(-48)); }} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[9px] text-slate-300 hover:border-cyan-700 hover:text-cyan-200">
            {command}
          </button>
        ))}
      </div>
    </section>
  );
};
