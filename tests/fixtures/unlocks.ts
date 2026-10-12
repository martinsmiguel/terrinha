import { MASTERY_IDS, newMastery, type MasteryId } from '../../src/game/mastery';
import type { Building, GameState } from '../../src/game/model';
import { TECH_DEFS } from '../../src/game/tech';

/**
 * Estado com tudo desbloqueado para o dono (era Industrial, todas as pesquisas, ofícios no 10 e, se pedido, cais e quartel
 * de pé longe do mapa). Para testes de outras regras que não a de desbloqueio (card #177).
 */
export function unlockAll<T extends Pick<GameState, 'buildings'> & Partial<Pick<GameState, 'techs' | 'mastery'>>>(
  state: T,
  owner = 'player1',
  options: { buildings?: boolean } = {}
): T {
  const level = Object.fromEntries(MASTERY_IDS.map((id) => [id, 10])) as Record<MasteryId, number>;
  const far = (type: 'dock' | 'barracks'): Building => ({
    id: `unlock-${type}-${owner}`, type, owner, position: { x: -500, z: -500 }, health: 800, maxHealth: 800, isComplete: true, trainingQueue: [],
  });
  return {
    ...state,
    techs: { ...state.techs, [owner]: { era: 'industrial', completed: TECH_DEFS.map((tech) => tech.id), queue: [] } },
    mastery: { ...state.mastery, [owner]: { ...newMastery(), level } },
    buildings: options.buildings ? [...state.buildings, far('dock'), far('barracks')] : state.buildings,
  };
}
