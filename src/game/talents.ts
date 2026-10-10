import { MASTERY_LABEL, type MasteryId } from './mastery';
import type { GameState } from './model';

export type TalentId = 'brisa' | 'comboio' | 'desembarque' | 'carpintaria' | 'bencao' | 'farol';

export interface TalentDef {
  id: TalentId;
  name: string;
  mastery: MasteryId;
  /** Nível mínimo da maestria. */
  level: number;
  /** Talento exigido antes. */
  requires?: TalentId;
  /** Pontos de talento gastos na compra (sem reembolso nem respec). */
  cost: number;
  effect: string;
}

/** Seis talentos propostos (valores a revisar): cada efeito é real e vem do pipeline do jogo. */
export const TALENTS: readonly TalentDef[] = [
  { id: 'brisa', name: 'Brisa', mastery: 'seafaring', level: 2, cost: 1, effect: '+15% de velocidade dos barcos em mar já conhecido' },
  { id: 'comboio', name: 'Comboio', mastery: 'seafaring', level: 3, requires: 'brisa', cost: 1, effect: 'Porão do mercante de 100 para 125' },
  { id: 'desembarque', name: 'Desembarque ágil', mastery: 'settlement', level: 2, cost: 1, effect: 'Desembarque de 0,5 s para 0,25 s por passageiro' },
  { id: 'carpintaria', name: 'Carpintaria', mastery: 'settlement', level: 3, requires: 'desembarque', cost: 1, effect: '-20 de madeira no custo de posto e cais' },
  { id: 'bencao', name: 'Bênção agrícola', mastery: 'extraction', level: 2, cost: 1, effect: '+10% de comida das fazendas' },
  { id: 'farol', name: 'Farol', mastery: 'exploration', level: 2, cost: 1, effect: 'Visão 14 em cais e postos' },
];

export const talentById = (id: string): TalentDef | undefined => TALENTS.find((talent) => talent.id === id);

export const BRISA_SPEED = 1.15;
export const CARPENTRY_WOOD_DISCOUNT = 20;
export const BLESSING_FARM = 1.1;
export const FAROL_VISION = 14;

type Owned = Pick<GameState, 'talents'>;

export const hasTalent = (state: Owned, owner: string, id: TalentId): boolean => Boolean(state.talents?.[owner]?.includes(id));

export type TalentRefusal = 'unknown' | 'owned' | 'level' | 'requires' | 'points';

export interface TalentCheck { ok: boolean; refusal?: TalentRefusal; message?: string }

/** Valida a compra pelo estado do host: nível, pré-requisito, pontos e ID único. Não altera nada. */
export function canBuyTalent(state: Pick<GameState, 'mastery' | 'talents'>, owner: string, id: string): TalentCheck {
  const def = talentById(id);
  if (!def) return { ok: false, refusal: 'unknown', message: 'Talento desconhecido.' };
  if (state.talents?.[owner]?.includes(def.id)) return { ok: false, refusal: 'owned', message: 'Talento já comprado.' };
  const mastery = state.mastery?.[owner];
  if (!mastery || mastery.level[def.mastery] < def.level) {
    return { ok: false, refusal: 'level', message: `Exige ${MASTERY_LABEL[def.mastery]} nível ${def.level}.` };
  }
  if (def.requires && !state.talents?.[owner]?.includes(def.requires)) {
    return { ok: false, refusal: 'requires', message: `Exige antes o talento ${talentById(def.requires)?.name}.` };
  }
  if (mastery.points < def.cost) return { ok: false, refusal: 'points', message: 'Sem pontos de talento.' };
  return { ok: true };
}

/** Compra atômica: recusa não debita pontos nem repete; sucesso gasta os pontos e registra o ID uma única vez. */
export function buyTalent<T extends Pick<GameState, 'mastery' | 'talents'>>(state: T, owner: string, id: string): { state: T; check: TalentCheck } {
  const check = canBuyTalent(state, owner, id);
  if (!check.ok) return { state, check };
  const def = talentById(id)!;
  const mastery = state.mastery![owner];
  return {
    check,
    state: {
      ...state,
      mastery: { ...state.mastery, [owner]: { ...mastery, points: mastery.points - def.cost } },
      talents: { ...state.talents, [owner]: [...(state.talents?.[owner] ?? []), def.id] },
    },
  };
}

/** Custo efetivo de construção: a Carpintaria tira 20 de madeira de posto e cais (sem ficar negativo; não acumula). */
export function effectiveBuildCost(state: Owned, owner: string, type: string, cost: Record<string, number | undefined>): Record<string, number | undefined> {
  if (!(type === 'outpost' || type === 'dock') || !hasTalent(state, owner, 'carpintaria')) return cost;
  return { ...cost, wood: Math.max(0, (cost.wood ?? 0) - CARPENTRY_WOOD_DISCOUNT) };
}
