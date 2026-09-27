/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Building } from './engine';

/** Estado da partida segundo a condição de vitória. */
export type MatchStatus =
  | { status: 'running' }
  | { status: 'finished'; winner: string | null };

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
 * Avalia a partida entre os participantes informados.
 * Sobrar um único dono com TC = vitória dele; não sobrar ninguém = empate
 * (winner null). Enquanto dois ou mais seguem de pé, a partida continua.
 */
export const evaluateMatch = (buildings: Building[], contenders: string[]): MatchStatus => {
  const alive = townCenterOwners(buildings).filter((owner) => contenders.includes(owner));
  if (alive.length > 1) {
    return { status: 'running' };
  }
  return { status: 'finished', winner: alive.length === 1 ? alive[0] : null };
};

/**
 * Resultado do jogador local: perdeu ao ficar sem TC, venceu quando é o
 * único sobrevivente e a partida terminou.
 */
export const localOutcome = (
  localOwner: string,
  buildings: Building[],
  contenders: string[]
): LocalOutcome => {
  if (!hasTownCenter(buildings, localOwner)) {
    return 'defeat';
  }
  const match = evaluateMatch(buildings, contenders);
  if (match.status === 'running') {
    return 'running';
  }
  return match.winner === localOwner ? 'victory' : 'defeat';
};
