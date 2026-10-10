import type { GameState } from './model';

export type RelicKind = 'plant' | 'monument';
export type RelicState = 'available' | 'harvested' | 'ruined' | 'restored';

export interface Relic {
  id: string;
  kind: RelicKind;
  position: { x: number; z: number };
  /** Ilha onde está (natais e neutras). */
  island: number;
  state: RelicState;
  /** Quem colheu ou restaurou (efeito e XP são só dele). */
  owner?: string;
}

export const RELIC_REACH = 3;
export const RESTORE_COST = { wood: 40, stone: 60 } as const;
/** Bênção da planta: +20% de coleta por 60 s (limitada, não acumula). */
export const BLESSING = { gatherBonus: 0.2, seconds: 60 } as const;
/** Runa do monumento restaurado: visão 14 em volta dele. */
export const RUNE_VISION = 14;

/** Uma planta e um monumento (em ruína) por ilha, em posições determinísticas a partir do layout. */
export function generateRelics(islands: readonly { index: number; center: { x: number; z: number }; baseRadius: number }[]): Relic[] {
  return islands.flatMap((island) => {
    const r = island.baseRadius * 0.45;
    return [
      { id: `plant-${island.index}`, kind: 'plant' as const, island: island.index, state: 'available' as const, position: { x: island.center.x + r, z: island.center.z - r * 0.3 } },
      { id: `monument-${island.index}`, kind: 'monument' as const, island: island.index, state: 'ruined' as const, position: { x: island.center.x - r * 0.6, z: island.center.z + r } },
    ];
  });
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

export type RelicRefusal = 'unknown' | 'state' | 'unit' | 'reach' | 'known' | 'cost';
export interface RelicCheck { ok: boolean; refusal?: RelicRefusal; message?: string }

/** Valida colher/restaurar: entidade, estado, aldeão próprio vivo ao alcance, alvo já conhecido pelo dono e custo (restauração). */
export function checkRelicAction(
  state: Pick<GameState, 'relics' | 'units' | 'playerResources'>,
  owner: string,
  action: 'harvest' | 'restore',
  unitId: string,
  relicId: string,
  isKnown: (x: number, z: number) => boolean = () => true
): RelicCheck {
  const relic = state.relics?.find((candidate) => candidate.id === relicId);
  if (!relic) return { ok: false, refusal: 'unknown', message: 'Relíquia desconhecida.' };
  if (action === 'harvest' ? !(relic.kind === 'plant' && relic.state === 'available') : !(relic.kind === 'monument' && relic.state === 'ruined')) {
    return { ok: false, refusal: 'state', message: action === 'harvest' ? 'Esta planta não pode ser colhida.' : 'Este monumento não está em ruínas.' };
  }
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit || unit.owner !== owner || unit.type !== 'villager' || unit.health <= 0) return { ok: false, refusal: 'unit', message: 'Precisa de um aldeão próprio vivo.' };
  if (!isKnown(relic.position.x, relic.position.z)) return { ok: false, refusal: 'known', message: 'Local ainda não explorado.' };
  if (dist(unit.position, relic.position) > RELIC_REACH) return { ok: false, refusal: 'reach', message: 'O aldeão está longe demais.' };
  if (action === 'restore') {
    const res = state.playerResources[owner];
    if (!res || res.wood < RESTORE_COST.wood || res.stone < RESTORE_COST.stone) return { ok: false, refusal: 'cost', message: `Falta material: ${RESTORE_COST.wood} madeira e ${RESTORE_COST.stone} pedra.` };
  }
  return { ok: true };
}

/** Aplica colher/restaurar uma única vez; recusa não muda nada, repetir recusa por estado. Efeito/XP do dono. */
export function applyRelicAction<T extends Pick<GameState, 'relics' | 'units' | 'playerResources'> & Partial<Pick<GameState, 'buffs'>>>(
  state: T, owner: string, action: 'harvest' | 'restore', unitId: string, relicId: string, isKnown?: (x: number, z: number) => boolean
): { state: T; check: RelicCheck; xp?: { kind: 'plant' | 'monument'; key: string } } {
  const check = checkRelicAction(state, owner, action, unitId, relicId, isKnown);
  if (!check.ok) return { state, check };
  const relics = state.relics!.map((relic) => (relic.id === relicId ? { ...relic, state: action === 'harvest' ? ('harvested' as const) : ('restored' as const), owner } : relic));
  if (action === 'harvest') {
    return { check, xp: { kind: 'plant', key: relicId }, state: { ...state, relics, buffs: { ...state.buffs, [owner]: { blessing: BLESSING.seconds } } } };
  }
  const res = state.playerResources[owner];
  return {
    check, xp: { kind: 'monument', key: relicId },
    state: { ...state, relics, playerResources: { ...state.playerResources, [owner]: { ...res, wood: res.wood - RESTORE_COST.wood, stone: res.stone - RESTORE_COST.stone } } },
  };
}

/** Tempo da bênção diminui por tick; ao acabar o efeito some sem deixar resíduo. */
export function tickBuffs(buffs: GameState['buffs'], dt: number): GameState['buffs'] {
  if (!buffs) return buffs;
  const next: NonNullable<GameState['buffs']> = {};
  for (const [owner, buff] of Object.entries(buffs)) {
    const blessing = (buff.blessing ?? 0) - dt;
    if (blessing > 0) next[owner] = { blessing };
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export const blessingMultiplier = (buffs: GameState['buffs'], owner: string): number => ((buffs?.[owner]?.blessing ?? 0) > 0 ? 1 + BLESSING.gatherBonus : 1);

/** Visão das runas: monumentos restaurados dão visão ao dono que os restaurou. */
export const runeSources = (relics: readonly Relic[] | undefined, owner: string): { x: number; z: number; radius: number }[] =>
  (relics ?? []).filter((relic) => relic.kind === 'monument' && relic.state === 'restored' && relic.owner === owner).map((relic) => ({ x: relic.position.x, z: relic.position.z, radius: RUNE_VISION }));

export const SEASON_SECONDS = 180;
export type Season = 'wet' | 'dry';
/** Estações a cada 180 s: úmida e seca alternam a partir da úmida. */
export const seasonOf = (elapsedSeconds: number): Season => (Math.floor(elapsedSeconds / SEASON_SECONDS) % 2 === 0 ? 'wet' : 'dry');
/** Produção agrícola: +10% na úmida e -10% na seca, para nunca inviabilizar a natal. */
export const seasonFarmFactor = (season: Season): number => (season === 'wet' ? 1.1 : 0.9);
