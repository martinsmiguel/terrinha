/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Building, Unit } from './model';
import { lifePhase } from './foundation';

/** Estado da partida segundo a condição de vitória. */
export type MatchStatus =
  | { status: 'running'; players: string[] }
  | { status: 'finished'; winner: string | null; players: string[] };

/** Resultado local (vista do jogador), derivado do estado da partida. */
export type LocalOutcome = 'running' | 'victory' | 'defeat';

/** Donos com Centro da Vila ainda de pé. */
export const townCenterOwners = (buildings: Building[]): string[] => {
  const owners = new Set<string>();
  for (const building of buildings) {
    if (building.type === 'town_center' && building.health > 0) {
      owners.add(building.owner);
    }
  }
  return [...owners];
};

/** True quando o jogador ainda tem Centro da Vila. */
export const hasTownCenter = (buildings: Building[], owner: string): boolean =>
  townCenterOwners(buildings).includes(owner);

/**
 * Donos ainda na partida. Sem `units`, vale só o Centro da Vila de pé; com `units`, a fase de
 * vida decide: carroça (chegando), capital em obras (fundando) e capital concluída (ativo) contam;
 * ficar sem Centro antes de fundar a capital não elimina enquanto a carroça sobreviver.
 */
const survivors = (buildings: Building[], contenders: string[], units?: Unit[]): string[] =>
  units
    ? contenders.filter((owner) => lifePhase(owner, buildings, units) !== 'eliminated')
    : townCenterOwners(buildings).filter((owner) => contenders.includes(owner));

/**
 * Avalia a partida entre os participantes informados.
 * Sobrar um único sobrevivente = vitória dele; não sobrar ninguém = empate
 * (winner null). Enquanto dois ou mais seguem de pé, a partida continua.
 */
export const evaluateMatch = (buildings: Building[], contenders: string[], units?: Unit[]): MatchStatus => {
  const alive = survivors(buildings, contenders, units);
  if (alive.length > 1) {
    return { status: 'running', players: contenders };
  }
  return { status: 'finished', winner: alive.length === 1 ? alive[0] : null, players: contenders };
};

/**
 * Resultado do jogador local: perdeu ao ser eliminado, venceu quando é o
 * único sobrevivente e a partida terminou.
 */
export const localOutcome = (
  localOwner: string,
  buildings: Building[],
  contenders: string[],
  units?: Unit[]
): LocalOutcome => {
  if (!survivors(buildings, [localOwner], units).includes(localOwner)) {
    return 'defeat';
  }
  const match = evaluateMatch(buildings, contenders, units);
  if (match.status === 'running') {
    return 'running';
  }
  return match.winner === localOwner ? 'victory' : 'defeat';
};
