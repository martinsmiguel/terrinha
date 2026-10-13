import { useState } from 'react';
import { Crosshair, Footprints, X } from 'lucide-react';

export type OrderMode = 'move' | 'attack';

export interface BarBuildOption {
  id: string;
  name: string;
  cost: string;
  /** O que falta (era, ofício…), ou `null` quando pode. */
  lock: string | null;
  affordable: boolean;
}

interface MobileCommandBarProps {
  /** Tropa ou unidade selecionada (própria), ou `null`. */
  selection: { title: string; count: number; health: number; maxHealth: number } | null;
  orderMode: OrderMode | null;
  onOrderMode(mode: OrderMode | null): void;
  onClearSelection(): void;
  buildings: BarBuildOption[];
  decorations: BarBuildOption[];
  onBuild(id: string): void;
  onDecorate(id: string): void;
}

const card = 'flex min-h-16 min-w-[4.5rem] flex-1 flex-col items-center justify-center rounded-xl border px-2 py-1.5 text-center text-[11px] font-semibold transition-colors';

/**
 * Barra de comando para toque (#181), no pé da tela como nos jogos de cidade no celular: sem seleção, cartões de
 * construção e decoração; com tropa selecionada, o cartão dela e as ações (Mover, Atacar). A ação escolhida espera um
 * toque no mapa e envia a mesma ordem do clique direito (mesma validação do host).
 */
export function MobileCommandBar({ selection, orderMode, onOrderMode, onClearSelection, buildings, decorations, onBuild, onDecorate }: MobileCommandBarProps) {
  const [tab, setTab] = useState<'construir' | 'decorar'>('construir');
  const options = tab === 'construir' ? buildings : decorations;
  return (
    <div
      role="toolbar"
      aria-label="Comandos"
      data-testid="mobile-command-bar"
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 border-t border-slate-700 bg-slate-950/95 px-2 pt-2 text-slate-100 shadow-2xl"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
    >
      {selection ? (
        <div className="flex items-stretch gap-2">
          <div className="flex min-w-0 flex-[2] flex-col justify-center rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-bold">{selection.title}</span>
              <span className="text-xs text-slate-400">× {selection.count}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-800" role="progressbar" aria-label="Vida da seleção" aria-valuemin={0} aria-valuemax={selection.maxHealth} aria-valuenow={Math.round(selection.health)}>
              <div className="h-full bg-emerald-500" style={{ width: `${selection.maxHealth > 0 ? Math.max(0, Math.min(100, (selection.health / selection.maxHealth) * 100)) : 0}%` }} />
            </div>
            {orderMode && <p className="mt-1 text-[11px] text-amber-300" aria-live="polite">{orderMode === 'move' ? 'Toque no destino' : 'Toque no alvo'}</p>}
          </div>
          <button type="button" aria-pressed={orderMode === 'move'} onClick={() => onOrderMode(orderMode === 'move' ? null : 'move')}
            className={`${card} ${orderMode === 'move' ? 'border-amber-400 bg-amber-500 text-slate-950' : 'border-slate-700 bg-slate-800'}`}>
            <Footprints className="h-5 w-5" /> Mover
          </button>
          <button type="button" aria-pressed={orderMode === 'attack'} onClick={() => onOrderMode(orderMode === 'attack' ? null : 'attack')}
            className={`${card} ${orderMode === 'attack' ? 'border-red-400 bg-red-600 text-white' : 'border-slate-700 bg-slate-800'}`}>
            <Crosshair className="h-5 w-5" /> Atacar
          </button>
          <button type="button" aria-label="Limpar seleção" onClick={() => { onOrderMode(null); onClearSelection(); }} className={`${card} max-w-[3.5rem] min-w-[3.5rem] border-slate-700 bg-slate-900`}>
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div role="tablist" aria-label="Construir ou decorar" className="flex gap-1.5">
            {(['construir', 'decorar'] as const).map((id) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`min-h-8 flex-1 rounded-lg text-[11px] font-bold ${tab === id ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
                {id === 'construir' ? 'Construir' : 'Decorar'}
              </button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {options.map((option) => (
              <button key={option.id} type="button" disabled={Boolean(option.lock)}
                onClick={() => (tab === 'construir' ? onBuild(option.id) : onDecorate(option.id))}
                title={option.lock ? `Falta: ${option.lock}` : option.name}
                className={`${card} ${option.lock ? 'border-slate-800 bg-slate-950 text-slate-500' : 'border-slate-700 bg-slate-900 hover:border-amber-500/60'}`}>
                <span className="leading-tight">{option.name}</span>
                <span className={`line-clamp-2 font-mono text-[10px] ${option.lock ? 'text-slate-500' : option.affordable ? 'text-amber-300' : 'text-red-400'}`}>{option.lock ? `🔒 ${option.lock.split(' · ')[0]}` : option.cost}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
