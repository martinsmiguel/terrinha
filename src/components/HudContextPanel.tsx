import { useEffect, useState } from 'react';
import { type FlowRow } from '../game/flows';
import { PanelLeftClose, PanelLeftOpen, Redo2, Undo2 } from 'lucide-react';
import {
  COMPOSITION_INDICATORS, COMPOSITION_LABEL, COMPOSITION_ORDER, HISTORY_LIMIT, indicatorsFor,
  type HudConfig, type HudComposition, type HudReadout,
} from '../game/hudConfig';

export interface RelicRow { id: string; kind: 'plant' | 'monument'; state: string; label: string; position: { x: number; z: number }; unitId: string | null; check: { ok: boolean; message?: string } }

interface HudContextPanelProps {
  config: HudConfig;
  readout: HudReadout;
  era: string;
  canUndo: boolean;
  canRedo: boolean;
  onTogglePanel(): void;
  onOpenTalents(): void;
  bridgeActive: boolean;
  onToggleBridge(): void;
  flows: FlowRow[];
  relics: RelicRow[];
  onRelicAction(row: RelicRow): void;
  onFocusRelic(x: number, z: number): void;
  talentPoints: number;
  onSelectComposition(composition: HudComposition): void;
  onToggleIdle(enabled: boolean): void;
  onUndo(): void;
  onRedo(): void;
  onPointerEnterUI(): void;
  onPointerLeaveUI(): void;
}

const UNIT_LABEL: Record<string, string> = {
  villager: 'Aldeão', soldier: 'Soldado', cavalry: 'Cavalaria', fishing_boat: 'Barco de pesca', trade_boat: 'Mercante', warship: 'Barco de guerra', colonial_transport: 'Transporte colonial',
};

/**
 * Painel contextual com o estado REAL do jogador. Começa fechado, fica na borda esquerda (o centro do mapa fica livre) e
 * nenhum controle essencial depende de hover. Não toca seleção, câmera, ordens nem simulação.
 */
/** Faixa livre do painel: abaixo do cabeçalho (que quebra em linhas conforme a largura) e acima do minimapa, ambos medidos. */
function useFreeBand(mode: string, minimapCollapsed: boolean): { top: number; bottom: number } {
  const [band, setBand] = useState({ top: 96, bottom: 280 });
  useEffect(() => {
    const measure = () => {
      const header = document.querySelector('header');
      const minimap = document.querySelector('[data-hud-region="minimap"]');
      const top = header ? Math.round(header.getBoundingClientRect().bottom) + 8 : 96;
      const bottom = minimap ? Math.round(minimap.getBoundingClientRect().top) - 8 : window.innerHeight - 16;
      setBand({ top, bottom });
    };
    measure();
    const observed = [document.querySelector('header'), document.querySelector('[data-hud-region="minimap"]')].filter((el): el is Element => Boolean(el));
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observed.forEach((el) => observer?.observe(el));
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [mode, minimapCollapsed]);
  return band;
}

export function HudContextPanel(props: HudContextPanelProps) {
  const { config, readout, era, canUndo, canRedo } = props;
  const { top, bottom } = useFreeBand(config.mode, config.minimapCollapsed);
  if (config.mode === 'hidden') return null;
  const visible = new Set(indicatorsFor(config));
  const label = COMPOSITION_LABEL[config.composition];
  return (
    <div
      style={{ top }}
      className="pointer-events-none absolute left-2 z-20 flex flex-col items-start gap-1.5 sm:left-4"
      onMouseEnter={props.onPointerEnterUI}
      onMouseLeave={props.onPointerLeaveUI}
    >
      <button
        type="button"
        onClick={props.onTogglePanel}
        aria-expanded={config.panelOpen}
        aria-controls="hud-context-panel"
        title="Abrir/fechar o painel contextual (J)"
        className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-950/90 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:border-amber-500/60"
      >
        {config.panelOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
        Painel <kbd className="rounded bg-slate-800 px-1 font-mono text-[10px]">J</kbd>
      </button>

      <button
        type="button"
        onClick={props.onOpenTalents}
        title="Talentos (Alt+T)"
        className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-950/90 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:border-amber-500/60"
      >
        Talentos <kbd className="rounded bg-slate-800 px-1 font-mono text-[10px]">Alt+T</kbd>
        {props.talentPoints > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-slate-950" aria-label={`${props.talentPoints} pontos disponíveis`}>{props.talentPoints}</span>}
      </button>

      <button
        type="button"
        onClick={props.onToggleBridge}
        aria-pressed={props.bridgeActive}
        title="Construir ponte: clique nas duas margens (150 madeira, 50 pedra, 20 tábuas)"
        className={`pointer-events-auto flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${props.bridgeActive ? 'border-amber-500 bg-amber-500/20 text-amber-200' : 'border-slate-700 bg-slate-950/90 text-slate-200 hover:border-amber-500/60'}`}
      >
        Ponte
      </button>

      {config.panelOpen && (
        <section
          id="hud-context-panel"
          aria-label={`Painel contextual: ${label}`}
          style={{ maxHeight: Math.max(96, bottom - (top + 72)) }}
          className="pointer-events-auto w-[min(18rem,calc(100vw-1rem))] space-y-2 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/90 p-2.5 text-xs text-slate-200 backdrop-blur-md"
        >
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Composição da interface">
            {COMPOSITION_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={config.composition === id}
                onClick={() => props.onSelectComposition(id)}
                className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${config.composition === id ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-white'}`}
              >
                {COMPOSITION_LABEL[id]}
              </button>
            ))}
            <span className="ml-auto flex gap-1">
              <button type="button" disabled={!canUndo} onClick={props.onUndo} aria-label="Desfazer configuração do HUD (Ctrl+Z)" title="Desfaz só a configuração do HUD, nunca a partida" className="rounded p-1 text-slate-300 enabled:hover:bg-slate-800 disabled:opacity-40"><Undo2 className="h-3.5 w-3.5" /></button>
              <button type="button" disabled={!canRedo} onClick={props.onRedo} aria-label="Refazer configuração do HUD (Ctrl+Shift+Z)" className="rounded p-1 text-slate-300 enabled:hover:bg-slate-800 disabled:opacity-40"><Redo2 className="h-3.5 w-3.5" /></button>
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            <dt className="text-slate-400">Madeira</dt><dd className="text-right font-mono">{Math.floor(readout.wood)}</dd>
            <dt className="text-slate-400">Comida</dt><dd className="text-right font-mono">{Math.floor(readout.food)}</dd>
            <dt className="text-slate-400">Ouro</dt><dd className="text-right font-mono">{Math.floor(readout.gold)}</dd>
            <dt className="text-slate-400">Pedra</dt><dd className="text-right font-mono">{Math.floor(readout.stone)}</dd>
            <dt className="text-slate-400">Tábuas</dt><dd className="text-right font-mono">{Math.floor(readout.planks)}</dd>
            <dt className="text-slate-400">População</dt><dd className="text-right font-mono">{readout.population.current}/{readout.population.max}</dd>
          </dl>

          <div className="text-[11px]" aria-label="Fluxo líquido por minuto">
            <div className="text-slate-400">Fluxo líquido por minuto</div>
            <table className="w-full text-right font-mono text-[10px]">
              <thead><tr className="text-slate-500"><th className="text-left font-normal"></th><th className="font-normal">império</th><th className="font-normal">colônias</th><th className="font-normal">trânsito</th></tr></thead>
              <tbody>
                {props.flows.map((row) => {
                  const fmt = (rate: FlowRow['empire']) => (rate.perMinute === null ? '—' : `${rate.perMinute >= 0 ? '+' : ''}${rate.perMinute.toFixed(1)}`);
                  const partial = row.empire.partial && row.empire.perMinute !== null;
                  return (
                    <tr key={row.key}>
                      <td className="text-left text-slate-400">{{ wood: 'Madeira', food: 'Comida', gold: 'Ouro', stone: 'Pedra', planks: 'Tábuas', pop: 'Pop.' }[row.key]}</td>
                      <td title={partial ? `janela parcial: ${Math.round(row.empire.seconds)} s` : 'janela de 60 s'}>{fmt(row.empire)}{partial ? '*' : ''}</td>
                      <td>{fmt(row.colonies)}</td>
                      <td>{fmt(row.transit)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="text-[10px] text-slate-500">Dado real da partida · * janela parcial · transferência interna não conta como produção.</div>
          </div>

          {visible.has('era') && <div className="text-[11px]"><span className="text-slate-400">Era: </span>{era}</div>}
          {visible.has('idle-villagers') && <div className="text-[11px]"><span className="text-slate-400">Aldeões ociosos: </span>{readout.idleVillagers}</div>}
          {visible.has('queues') && (
            <div className="text-[11px]">
              <div className="text-slate-400">Filas de treino</div>
              {readout.queues.length === 0
                ? <div>Nenhuma fila ativa.</div>
                : <ul className="list-disc pl-4">{readout.queues.map((item, index) => <li key={`${item.buildingId}-${index}`}>{UNIT_LABEL[item.unit] ?? item.unit} · {Math.round(item.progress)}%</li>)}</ul>}
            </div>
          )}
          {visible.has('selection') && (
            <div className="text-[11px]"><span className="text-slate-400">Seleção: </span>{readout.selection ? `${readout.selection.kind === 'unit' ? 'unidade' : readout.selection.kind === 'building' ? 'edifício' : 'recurso'} ${readout.selection.id.slice(0, 8)}` : 'nenhuma'}</div>
          )}

          {props.relics.length > 0 && (
            <div className="text-[11px]" aria-label="Plantas e monumentos conhecidos">
              <div className="text-slate-400">Plantas e monumentos</div>
              <ul className="space-y-1">
                {props.relics.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2">
                    <span>{row.label} <span className="text-slate-500">· {row.state}</span></span>
                    <span className="flex gap-1">
                      <button type="button" onClick={() => props.onFocusRelic(row.position.x, row.position.z)} className="rounded bg-slate-800 px-1.5 py-0.5 hover:bg-slate-700">Ir</button>
                      {(row.state === 'disponível' || row.state === 'em ruínas') && (
                        <button type="button" disabled={!row.check.ok} title={row.check.ok ? undefined : row.check.message} onClick={() => props.onRelicAction(row)}
                          className={`rounded px-1.5 py-0.5 font-semibold ${row.check.ok ? 'bg-amber-600 text-white hover:bg-amber-500' : 'cursor-not-allowed bg-slate-800 text-slate-500'}`}>
                          {row.kind === 'plant' ? 'Colher' : 'Restaurar'}
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
            <input type="checkbox" checked={config.idleCollapse} onChange={(event) => props.onToggleIdle(event.target.checked)} />
            Recolher o HUD após inatividade (desligado por padrão)
          </label>
          <p className="text-[10px] text-slate-500">
            Indicadores: {COMPOSITION_INDICATORS[config.composition].length} extras além dos vitais. Histórico de até {HISTORY_LIMIT} mudanças só de configuração; a recarga guarda a configuração, não o histórico.
          </p>
        </section>
      )}
    </div>
  );
}
