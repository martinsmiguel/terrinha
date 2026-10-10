/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GraduationCap,
  Hammer,
  MousePointer2,
  Move,
  Swords,
  TreePine,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface TutorialStep {
  id: string;
  title: string;
  icon: LucideIcon;
  lines: string[];
  tip?: string;
}

/** Os 5 passos do tutorial de 2 minutos: selecao, movimento, coleta, construcao, combate. */
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'selecao',
    title: 'Selecionar',
    icon: MousePointer2,
    lines: [
      'Clique em uma unidade ou edifício para selecioná-lo.',
      'Arraste um retângulo no chão para selecionar várias unidades de uma vez.',
      'O painel inferior mostra vida, fila de treino e ações do que está selecionado.',
    ],
    tip: 'Esc limpa a seleção e cancela qualquer modo ativo.',
  },
  {
    id: 'movimento',
    title: 'Mover',
    icon: Move,
    lines: [
      'Botão direito no chão dá a ordem de marcha (também serve para atacar e coletar).',
      'WASD, setas, borda da tela e scroll movem a câmera; Espaço centraliza na seleção.',
      'Formações 1 (caixa), 2 (linha) e 3 (dispersa) organizam o pelotão antes do avanço.',
    ],
    tip: 'O minimapa (canto inferior esquerdo) salta a câmera para onde você clicar.',
  },
  {
    id: 'coleta',
    title: 'Coletar',
    icon: TreePine,
    lines: [
      'Botão direito em árvores, arbustos, ouro ou pedra: o aldeão coleta sozinho.',
      'A coleta acontece dentro da zona de trabalho — abra o configurador com Z para limitar o raio.',
      'Serralheria (+35% madeira) e Mineradora (+40% ouro e pedra) aumentam a produção.',
    ],
    tip: 'Sem comida não há aldeões: arbustos e a Fazenda (tecla F) resolvem a fome.',
  },
  {
    id: 'construcao',
    title: 'Construir',
    icon: Hammer,
    lines: [
      'Com um aldeão selecionado: Q casa, W quartel, E torre, R serralheria, T mineradora, F fazenda.',
      'Escolha a posição clicando no chão; vários aldeões na mesma obra aceleram a construção.',
      'No painel do edifício: Reparar (5 M por 100 HP) e Demolir (devolve 50% do custo).',
    ],
    tip: 'Casa dá +5 de população — construa antes de encher a fila de treino.',
  },
  {
    id: 'combate',
    title: 'Lutar',
    icon: Swords,
    lines: [
      'Selecione soldados e dê botão direito no inimigo — eles atiram em movimento.',
      'Quartel treina com S (soldado) e G (cavalaria); Centro da Vila treina aldeões com V.',
      'Torres de Vigia defendem a base; a barra de vida mostra quem está aguentando.',
    ],
    tip: 'Destrua o Centro da Vila inimigo para vencer — e pesquise melhorias no botão Tecnologias.',
  },
];

export interface TutorialProps {
  /** Chamado ao concluir, pular ou fechar — o host marca o tutorial como visto. */
  onClose: () => void;
}

export const Tutorial = ({ onClose }: TutorialProps) => {
  const dialogRef = useDialogFocus<HTMLDivElement>();
  const [index, setIndex] = useState(0);
  const step = TUTORIAL_STEPS[index];
  const Icon = step.icon;
  const isFirst = index === 0;
  const isLast = index === TUTORIAL_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto">
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tutorial-title" className="max-h-[calc(100dvh-2rem)] overflow-y-auto bg-slate-900/95 border border-cyan-500/40 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 outline-none">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-base">
            <GraduationCap className="w-5 h-5 text-cyan-400" />
            <span id="tutorial-title">Tutorial rápido (2 minutos)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs px-2.5 py-1 transition-colors"
          >
            ✕ Pular
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
              <Icon className="w-7 h-7" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                Passo {index + 1} de {TUTORIAL_STEPS.length}
              </div>
              <h3 className="text-lg font-bold text-white">{step.title}</h3>
            </div>
          </div>

          <ul className="space-y-2 text-xs text-slate-300 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800">
            {step.lines.map((line) => (
              <li key={line} className="flex gap-2 leading-relaxed">
                <span className="text-amber-400">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>

          {step.tip && (
            <div className="text-xs text-slate-400 bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-3 py-2">
              <strong className="text-cyan-300">Dica:</strong> {step.tip}
            </div>
          )}

          <div className="flex items-center justify-center gap-1.5">
            {TUTORIAL_STEPS.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-6 bg-cyan-400' : 'w-2.5 bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={isFirst}
            className="flex items-center gap-1 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 text-xs font-semibold transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Anterior
          </button>
          <span className="flex-1 text-center text-[11px] text-slate-400">
            Este tutorial reaparece pelo botão <strong className="text-slate-300">Controles</strong>
          </span>
          {isLast ? (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors shadow-lg shadow-amber-500/10"
            >
              <Check className="w-3.5 h-3.5" /> Começar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(TUTORIAL_STEPS.length - 1, i + 1))}
              className="flex items-center gap-1 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors"
            >
              Próximo <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
