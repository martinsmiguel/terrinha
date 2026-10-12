import { useMemo, useState } from 'react';
import { Castle, Check, Compass, X } from 'lucide-react';
import type { Unit } from '../game/model';
import { CAPITAL_BUILD_SECONDS, FOUNDATION_KIT } from '../game/foundation';
import type { CapitalSiteReport } from '../game/capitalSite';

export interface CapitalSiteOption {
  x: number;
  z: number;
  report: CapitalSiteReport;
}

interface FoundationPanelProps {
  wagon: Unit;
  /** Quantidade de edifícios: muda o resultado do espaço e invalida a lista de sítios. */
  buildingCount: number;
  kit?: { wood: number; stone: number };
  getOptions(wagon: Unit): CapitalSiteOption[];
  onPreview(x: number, z: number): void;
  onConfirm(x: number, z: number): void;
  /** Escolha livre no mapa (#195): prévia segue o cursor/toque e o clique fixa o ponto. */
  picking?: boolean;
  picked?: CapitalSiteOption | null;
  onPickOnMap?(): void;
  onCancelPick?(): void;
}

const CHECKS: { key: 'space' | 'terrain' | 'access' | 'discovered' | 'kit'; label: string }[] = [
  { key: 'space', label: 'Espaço livre' },
  { key: 'terrain', label: 'Terreno firme' },
  { key: 'access', label: 'Acesso por terra' },
  { key: 'discovered', label: 'Sítio explorado' },
  { key: 'kit', label: 'Kit completo' },
];

/** Escolha da sede: a carroça só vira capital ao confirmar; cancelar não altera a partida. */
export function FoundationPanel({ wagon, buildingCount, kit, getOptions, onPreview, onConfirm, picking = false, picked = null, onPickOnMap, onCancelPick }: FoundationPanelProps) {
  const [choice, setChoice] = useState<number | null>(null);
  const options = useMemo(
    () => getOptions(wagon),
    // A lista depende de onde a carroça está e do que já ocupa o terreno; não de cada tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wagon.id, Math.round(wagon.position.x), Math.round(wagon.position.z), buildingCount, kit?.wood, kit?.stone]
  );
  // O ponto escolhido no mapa vale como seleção; os sítios sugeridos seguem como atalho.
  const selected = picked ?? (choice === null ? null : options[choice] ?? null);
  const selectedLabel = picked ? `Ponto escolhido (${Math.round(picked.x)}, ${Math.round(picked.z)})` : `Sítio ${(choice ?? 0) + 1}`;

  return (
    <section aria-labelledby="foundation-title" className="mt-3 rounded-2xl border border-amber-500/40 bg-slate-950/70 p-3 text-xs text-slate-200">
      <h4 id="foundation-title" className="flex items-center gap-2 text-sm font-bold text-amber-300">
        <Castle className="h-4 w-4" aria-hidden="true" /> Fundar a capital
      </h4>
      <p className="mt-1 text-slate-400">
        Ande com a carroça até onde quiser e escolha o ponto no mapa (perto do mar, num morro…) ou use um sítio sugerido. O kit ({FOUNDATION_KIT.wood} madeira e {FOUNDATION_KIT.stone} pedra) fica reservado e não entra no
        suprimento. Cancelar não gasta nada.
      </p>

      {onPickOnMap && (
        <button
          type="button"
          aria-pressed={picking}
          onClick={() => { setChoice(null); if (picking) onCancelPick?.(); else onPickOnMap(); }}
          className={`mt-2 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border px-3 font-bold transition-colors ${
            picking ? 'border-emerald-400 bg-emerald-900/40 text-emerald-200' : 'border-amber-500/60 bg-amber-600 text-white hover:bg-amber-500'
          }`}
        >
          <Compass className="h-4 w-4" aria-hidden="true" />
          {picking ? (picked ? 'Escolher outro ponto' : 'Toque no mapa onde fundar (Esc cancela)') : 'Escolher no mapa'}
        </button>
      )}

      {options.length === 0 ? (
        <p role="status" className="mt-2 rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-300">
          Nenhum sítio viável por perto. Mova a carroça para terreno aberto e tente de novo.
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Sítios candidatos">
          {options.map((option, index) => (
            <li key={`${option.x}-${option.z}`}>
              <button
                type="button"
                aria-pressed={choice === index}
                onClick={() => {
                  onCancelPick?.();
                  setChoice(index);
                  onPreview(option.x, option.z);
                }}
                className={`rounded-xl border px-3 py-1.5 font-semibold transition-colors ${
                  choice === index
                    ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                    : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-amber-500/50'
                }`}
              >
                Sítio {index + 1} ({Math.round(option.x)}, {Math.round(option.z)})
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="mt-3" aria-live="polite">
          <p className="mb-1 font-semibold text-amber-200">{selectedLabel}</p>
          <ul className="grid grid-cols-2 gap-1" aria-label={`Verificação: ${selectedLabel}`}>
            {CHECKS.map(({ key, label }) => (
              <li key={key} className="flex items-center gap-1.5">
                {selected.report[key] ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                ) : (
                  <X className="h-3.5 w-3.5 text-red-400" aria-hidden="true" />
                )}
                <span>
                  {label}: {selected.report[key] ? 'sim' : 'não'}
                </span>
              </li>
            ))}
          </ul>
          {selected.report.reasons.length > 0 && (
            <p className="mt-1 text-amber-300">{selected.report.reasons.join('. ')}.</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={!selected.report.valid}
              onClick={() => onConfirm(selected.x, selected.z)}
              className="flex items-center gap-1.5 rounded-xl bg-amber-700 px-3 py-1.5 font-bold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-300"
            >
              <Compass className="h-3.5 w-3.5" aria-hidden="true" /> Fundar aqui ({CAPITAL_BUILD_SECONDS} s)
            </button>
            <button
              type="button"
              onClick={() => { setChoice(null); onCancelPick?.(); }}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 font-semibold text-slate-300 hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
