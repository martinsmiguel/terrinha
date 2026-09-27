/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { applyCost, canAfford, type ResourceCost } from './economy';
import type { PlayerResources } from './engine';

/** Eras da colonia, em ordem cronologica. */
export type Era = 'colonial' | 'commercial' | 'industrial';

export const ERA_ORDER: readonly Era[] = ['colonial', 'commercial', 'industrial'];

/** Estatisticas que uma tecnologia pode melhorar. */
export type TechStat = 'wood_gather' | 'gold_gather' | 'infantry_damage' | 'cavalry_damage';

export interface TechDef {
  id: string;
  name: string;
  /** Era minima para poder pesquisar. */
  era: Era;
  category: 'economia' | 'militar';
  cost: ResourceCost;
  durationSeconds: number;
  /** Tecnologia obrigatoria antes de pesquisar esta. */
  requires?: string;
  effect: { stat: TechStat; amount: number };
  description: string;
}

export interface EraUpgrade {
  era: Era;
  name: string;
  cost: ResourceCost;
  durationSeconds: number;
}

/** Avancos de era (o custo e o tempo sao a "pesquisa" da nova era). */
export const ERA_UPGRADES: readonly EraUpgrade[] = [
  { era: 'commercial', name: 'Era do Comércio', cost: { wood: 300, gold: 250 }, durationSeconds: 30 },
  { era: 'industrial', name: 'Era Industrial', cost: { wood: 500, gold: 500 }, durationSeconds: 45 },
];

export const TECH_DEFS: readonly TechDef[] = [
  {
    id: 'irrigation',
    name: 'Canais de Irrigação',
    era: 'colonial',
    category: 'economia',
    cost: { wood: 150, gold: 60 },
    durationSeconds: 20,
    effect: { stat: 'wood_gather', amount: 0.25 },
    description: '+25% de coleta de madeira',
  },
  {
    id: 'coinage',
    name: 'Cunhagem',
    era: 'colonial',
    category: 'economia',
    cost: { wood: 120, gold: 80 },
    durationSeconds: 25,
    effect: { stat: 'gold_gather', amount: 0.25 },
    description: '+25% de extração de ouro',
  },
  {
    id: 'rifling',
    name: 'Estriamento do Cano',
    era: 'colonial',
    category: 'militar',
    cost: { wood: 100, gold: 120 },
    durationSeconds: 30,
    effect: { stat: 'infantry_damage', amount: 0.25 },
    description: '+25% de dano da infantaria',
  },
  {
    id: 'cartography',
    name: 'Cartografia',
    era: 'commercial',
    category: 'economia',
    requires: 'coinage',
    cost: { wood: 250, gold: 200 },
    durationSeconds: 35,
    effect: { stat: 'gold_gather', amount: 0.25 },
    description: '+25% de extração de ouro (acumula com Cunhagem)',
  },
  {
    id: 'musketeer_corps',
    name: 'Corpo de Fuzileiros',
    era: 'commercial',
    category: 'militar',
    requires: 'rifling',
    cost: { wood: 300, gold: 250 },
    durationSeconds: 40,
    effect: { stat: 'infantry_damage', amount: 0.35 },
    description: '+35% de dano da infantaria',
  },
  {
    id: 'logistics',
    name: 'Logística Montada',
    era: 'industrial',
    category: 'militar',
    requires: 'musketeer_corps',
    cost: { wood: 350, gold: 300 },
    durationSeconds: 40,
    effect: { stat: 'cavalry_damage', amount: 0.3 },
    description: '+30% de dano da cavalaria',
  },
  {
    id: 'steam_mills',
    name: 'Serrarias a Vapor',
    era: 'industrial',
    category: 'economia',
    requires: 'cartography',
    cost: { wood: 400, gold: 350 },
    durationSeconds: 45,
    effect: { stat: 'wood_gather', amount: 0.4 },
    description: '+40% de coleta de madeira',
  },
];

/** Quantidade maxima de itens simultaneos na fila de pesquisa. */
export const MAX_RESEARCH_QUEUE = 3;

const ERA_PREFIX = 'era:';

/** Id de pesquisa de um avanco de era. */
export const eraResearchId = (era: Era): string => `${ERA_PREFIX}${era}`;

export interface ResearchQueueItem {
  /** Id de uma tecnologia ou de um avanco de era (`era:<era>`). */
  id: string;
  /** Progresso em percentual (0..100). */
  progress: number;
}

export interface TechState {
  era: Era;
  completed: string[];
  queue: ResearchQueueItem[];
}

export const createTechState = (): TechState => ({ era: 'colonial', completed: [], queue: [] });

export const eraIndex = (era: Era): number => ERA_ORDER.indexOf(era);

/** True quando a colonia ja alcancou (ou passou) a era informada. */
export const eraReached = (current: Era, required: Era): boolean =>
  eraIndex(current) >= eraIndex(required);

export const techById = (id: string): TechDef | undefined =>
  TECH_DEFS.find((tech) => tech.id === id);

/** Alvo de pesquisa: tecnologia ou avanco de era, com o que e preciso para iniciar. */
export interface ResearchTarget {
  id: string;
  name: string;
  cost: ResourceCost;
  durationSeconds: number;
  category: 'economia' | 'militar' | 'era';
  /** Era minima exigida (para avanco de era, a era alvo). */
  era: Era;
  requires?: string;
}

const eraUpgradeById = (id: string): EraUpgrade | undefined =>
  id.startsWith(ERA_PREFIX)
    ? ERA_UPGRADES.find((upgrade) => eraResearchId(upgrade.era) === id)
    : undefined;

export const researchTarget = (id: string): ResearchTarget | null => {
  const tech = techById(id);
  if (tech) {
    return {
      id: tech.id,
      name: tech.name,
      cost: tech.cost,
      durationSeconds: tech.durationSeconds,
      category: tech.category,
      era: tech.era,
      requires: tech.requires,
    };
  }
  const upgrade = eraUpgradeById(id);
  if (upgrade) {
    return {
      id: eraResearchId(upgrade.era),
      name: upgrade.name,
      cost: upgrade.cost,
      durationSeconds: upgrade.durationSeconds,
      category: 'era',
      era: upgrade.era,
    };
  }
  return null;
};

/** Motivos pelos quais uma pesquisa nao pode comecar agora. */
export type ResearchBlock = 'unknown' | 'already' | 'era' | 'requires' | 'busy' | 'cost';

/**
 * Devolve o motivo da bloqueio, ou `null` quando a pesquisa pode comecar.
 * Era exige a era anterior; tecnologia exige era minima e pre-requisito;
 * a fila comporta no maximo MAX_RESEARCH_QUEUE itens e o custo precisa ser pagavel.
 */
export const researchBlock = (
  state: TechState,
  id: string,
  resources: PlayerResources
): ResearchBlock | null => {
  const target = researchTarget(id);
  if (!target) return 'unknown';

  if (state.queue.some((item) => item.id === target.id)) return 'already';
  if (state.queue.length >= MAX_RESEARCH_QUEUE) return 'busy';

  if (target.category === 'era') {
    if (eraReached(state.era, target.era)) return 'already';
  } else {
    if (state.completed.includes(target.id)) return 'already';
    if (!eraReached(state.era, target.era)) return 'era';
    if (target.requires && !state.completed.includes(target.requires)) return 'requires';
  }

  return canAfford(resources, target.cost) ? null : 'cost';
};

/** Enfileira a pesquisa e debita o custo; `null` quando nao pode comecar. */
export const startResearch = (
  state: TechState,
  id: string,
  resources: PlayerResources
): { techState: TechState; resources: PlayerResources } | null => {
  const target = researchTarget(id);
  if (!target || researchBlock(state, id, resources)) return null;
  return {
    techState: { ...state, queue: [...state.queue, { id: target.id, progress: 0 }] },
    resources: applyCost(resources, target.cost),
  };
};

/**
 * Avanca a fila de pesquisa em `seconds` (20 ticks por segundo no host).
 * O item concluido e aplicado: tecnologia entra em `completed`, avanco de era
 * promove `era`.
 */
export const advanceResearch = (state: TechState, seconds: number): TechState => {
  if (state.queue.length === 0) return state;

  const queue = [...state.queue];
  const current = { ...queue[0] };
  const target = researchTarget(current.id);
  if (!target) {
    queue.shift();
    return { ...state, queue };
  }

  current.progress += (seconds / target.durationSeconds) * 100;
  if (current.progress < 100) {
    queue[0] = current;
    return { ...state, queue };
  }

  queue.shift();
  if (target.category === 'era') {
    const upgrade = eraUpgradeById(target.id);
    if (!upgrade) return { ...state, queue };
    return { ...state, era: upgrade.era, queue };
  }
  if (state.completed.includes(target.id)) return { ...state, queue };
  return { ...state, completed: [...state.completed, target.id], queue };
};

/** Multiplicador acumulado de uma estatistica pelas tecnologias concluidas. */
export const techMultiplier = (state: TechState | undefined, stat: TechStat): number => {
  if (!state) return 1;
  const bonus = TECH_DEFS.reduce(
    (total, tech) =>
      tech.effect.stat === stat && state.completed.includes(tech.id)
        ? total + tech.effect.amount
        : total,
    0
  );
  return 1 + bonus;
};

/** Dano multiplicado das unidades militares (soldado = infantaria, cavalo = cavalaria). */
export const unitDamageMultiplier = (
  state: TechState | undefined,
  unitType: string
): number => {
  if (unitType === 'soldier') return techMultiplier(state, 'infantry_damage');
  if (unitType === 'cavalry') return techMultiplier(state, 'cavalry_damage');
  return 1;
};

/** Coleta multiplicada por tipo de recurso coletado. */
export const gatherMultiplier = (state: TechState | undefined, nodeType: string): number => {
  if (nodeType === 'tree') return techMultiplier(state, 'wood_gather');
  if (nodeType === 'gold_mine') return techMultiplier(state, 'gold_gather');
  return 1;
};
