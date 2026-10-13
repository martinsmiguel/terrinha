import type { GameState } from './model';
import { eraIndex, normalizeEra } from './tech';

/**
 * Meta atual do jogador (#181): a próxima etapa natural de crescimento, mostrada no topo ("Expanda sua cidade 0/1"),
 * como nos construtores de cidade. Derivada do estado, sem guardar nada. Regra pura.
 */

export interface Goal {
  id: string;
  title: string;
  progress: number;
  target: number;
}

type GoalState = Pick<GameState, 'units' | 'buildings' | 'techs'>;

export function currentGoal(state: GoalState, owner: string): Goal {
  const mine = (type: string) => state.buildings.filter((b) => b.owner === owner && b.type === type && b.isComplete && b.health > 0).length;
  const villagers = state.units.filter((u) => u.owner === owner && u.type === 'villager' && u.health > 0).length;
  const era = eraIndex(normalizeEra(state.techs?.[owner]?.era));
  const steps: Goal[] = [
    { id: 'capital', title: 'Funde sua capital', progress: Math.min(1, mine('town_center')), target: 1 },
    { id: 'casa', title: 'Construa uma casa', progress: Math.min(1, mine('house')), target: 1 },
    { id: 'aldeoes', title: 'Tenha 6 aldeões', progress: Math.min(6, villagers), target: 6 },
    { id: 'fazenda', title: 'Construa uma fazenda', progress: Math.min(1, mine('farm')), target: 1 },
    { id: 'quartel', title: 'Construa um quartel', progress: Math.min(1, mine('barracks')), target: 1 },
    { id: 'serraria', title: 'Construa uma serralheria', progress: Math.min(1, mine('sawmill')), target: 1 },
    { id: 'cais', title: 'Construa um cais', progress: Math.min(1, mine('dock')), target: 1 },
    { id: 'bronze', title: 'Avance à Era do Bronze', progress: era >= 1 ? 1 : 0, target: 1 },
    { id: 'posto', title: 'Ocupe outra ilha com um posto', progress: Math.min(1, mine('outpost')), target: 1 },
    { id: 'casas', title: 'Expanda sua cidade: 5 casas', progress: Math.min(5, mine('house')), target: 5 },
  ];
  return steps.find((goal) => goal.progress < goal.target) ?? { id: 'livre', title: 'Expanda e enfeite seu império', progress: 1, target: 1 };
}
