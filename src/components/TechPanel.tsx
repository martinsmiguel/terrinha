/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Check, Coins, Lock, Sparkles, Sword, X } from 'lucide-react';
import { describeCost } from '../game/economy';
import type { PlayerResources } from '../game/engine';
import {
  ERA_ORDER,
  ERA_UPGRADES,
  MAX_RESEARCH_QUEUE,
  TECH_DEFS,
  eraIndex,
  researchBlock,
  researchTarget,
  type Era,
  type ResearchBlock,
  type TechDef,
  type TechState,
} from '../game/tech';

const ERA_LABEL: Record<Era, string> = {
  colonial: 'Era Colonial',
  commercial: 'Era do Comércio',
  industrial: 'Era Industrial',
};

const BLOCK_REASON: Record<ResearchBlock, string> = {
  unknown: 'Pesquisa indisponível',
  already: 'Já pesquisada',
  era: 'Exige uma era anterior',
  requires: 'Exige tecnologia anterior',
  busy: `Fila cheia (${MAX_RESEARCH_QUEUE})`,
  cost: 'Recursos insuficientes',
};

export interface TechPanelProps {
  techState: TechState;
  resources: PlayerResources;
  onResearch: (id: string) => void;
  onClose: () => void;
}

const TechCard = ({
  tech,
  techState,
  resources,
  onResearch,
}: {
  tech: TechDef;
  techState: TechState;
  resources: PlayerResources;
  onResearch: (id: string) => void;
}) => {
  const completed = techState.completed.includes(tech.id);
  const block = researchBlock(techState, tech.id, resources);
  const available = !completed && block === null;

  return (
    <div
      className={`rounded-xl border p-3 space-y-1.5 ${
        completed
          ? 'border-emerald-600/40 bg-emerald-950/30'
          : available
          ? 'border-amber-500/40 bg-slate-800/70'
          : 'border-slate-700 bg-slate-900/70'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-bold ${completed ? 'text-emerald-300' : 'text-white'}`}>
          {tech.name}
        </span>
        {completed ? (
          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        ) : block ? (
          <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        ) : (
          <span className="text-[10px] font-mono text-amber-300">{tech.durationSeconds}s</span>
        )}
      </div>

      <p className="text-[11px] text-slate-400 leading-snug">{tech.description}</p>
      <p className="text-[10px] text-slate-500">
        {ERA_LABEL[tech.era]}
        {tech.requires ? ` · exige ${TECH_DEFS.find((t) => t.id === tech.requires)?.name}` : ''}
      </p>

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[11px] font-mono text-amber-300/90">{describeCost(tech.cost)}</span>
        <button
          type="button"
          disabled={!available}
          onClick={() => onResearch(tech.id)}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
            available
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
          title={completed ? 'Tecnologia já concluída' : block ? BLOCK_REASON[block] : 'Pesquisar'}
        >
          {completed ? 'Concluída' : available ? 'Pesquisar' : block ? BLOCK_REASON[block] : 'Indisponível'}
        </button>
      </div>
    </div>
  );
};

export const TechPanel = ({ techState, resources, onResearch, onClose }: TechPanelProps) => {
  const nextEra = ERA_ORDER[eraIndex(techState.era) + 1];
  const eraUpgrade = ERA_UPGRADES.find((upgrade) => upgrade.era === nextEra);
  const eraBlock = eraUpgrade ? researchBlock(techState, `era:${eraUpgrade.era}`, resources) : 'unknown';

  const economyTechs = TECH_DEFS.filter((tech) => tech.category === 'economia');
  const militaryTechs = TECH_DEFS.filter((tech) => tech.category === 'militar');

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/75 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" /> Tecnologias da Colônia
            </h2>
            <p className="text-xs text-slate-400">
              Era atual:{' '}
              <strong className="text-amber-300">{ERA_LABEL[techState.era]}</strong> ·{' '}
              {techState.completed.length}/{TECH_DEFS.length} tecnologias
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {eraUpgrade && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-amber-200">
                Avançar para {ERA_LABEL[eraUpgrade.era]}
              </div>
              <div className="text-[11px] text-slate-400">
                {describeCost(eraUpgrade.cost)} · {eraUpgrade.durationSeconds}s · abre novas tecnologias
              </div>
            </div>
            <button
              type="button"
              disabled={eraBlock !== null}
              onClick={() => onResearch(`era:${eraUpgrade.era}`)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                eraBlock === null
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
              title={eraBlock ? BLOCK_REASON[eraBlock] : 'Iniciar o avanço de era'}
            >
              {eraBlock ? BLOCK_REASON[eraBlock] : 'Avançar Era'}
            </button>
          </div>
        )}

        <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Fila de pesquisa ({techState.queue.length}/{MAX_RESEARCH_QUEUE})
          </div>
          {techState.queue.length === 0 ? (
            <p className="text-[11px] text-slate-500">Nenhuma pesquisa em andamento.</p>
          ) : (
            techState.queue.map((item, index) => {
              const target = researchTarget(item.id);
              return (
                <div key={item.id} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={index === 0 ? 'text-amber-300 font-semibold' : 'text-slate-400'}>
                      {target?.name ?? item.id}
                      {index > 0 ? ' (espera)' : ''}
                    </span>
                    <span className="font-mono text-slate-400">{Math.floor(item.progress)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full transition-all ${index === 0 ? 'bg-amber-400' : 'bg-slate-600'}`}
                      style={{ width: `${Math.min(100, item.progress)}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
              <Coins className="w-3.5 h-3.5" /> Economia
            </div>
            {economyTechs.map((tech) => (
              <TechCard
                key={tech.id}
                tech={tech}
                techState={techState}
                resources={resources}
                onResearch={onResearch}
              />
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-red-300">
              <Sword className="w-3.5 h-3.5" /> Militar
            </div>
            {militaryTechs.map((tech) => (
              <TechCard
                key={tech.id}
                tech={tech}
                techState={techState}
                resources={resources}
                onResearch={onResearch}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
