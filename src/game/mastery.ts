import type { GameState } from './model';

export const MASTERY_IDS = ['exploration', 'seafaring', 'extraction', 'settlement', 'combat'] as const;
export type MasteryId = (typeof MASTERY_IDS)[number];

export const MASTERY_LABEL: Record<MasteryId, string> = {
  exploration: 'Exploração', seafaring: 'Navegação', extraction: 'Extração', settlement: 'Colonização', combat: 'Combate',
};

export const MASTERY_START_LEVEL = 1;
export const MASTERY_MAX_LEVEL = 10;

/** XP para sair do nível atual: ceil(100 × nível^1.95) (default revisado). */
export const xpToNext = (level: number): number => Math.ceil(100 * level ** 1.95);

export type XpEvent =
  | { kind: 'discovery'; key: string }
  | { kind: 'fishing'; amount: number }
  | { kind: 'extraction'; amount: number }
  | { kind: 'foundation'; key: string }
  | { kind: 'freight'; amount: number }
  | { kind: 'plant'; key: string }
  | { kind: 'monument'; key: string }
  | { kind: 'damage'; amount: number };

/** Tabela de XP por evento (propostas a revisar). Fração acumula. */
export const XP_RULES: Record<XpEvent['kind'], { mastery: MasteryId; xp: (event: never) => number }> = {
  discovery: { mastery: 'exploration', xp: () => 10 },
  plant: { mastery: 'exploration', xp: () => 25 },
  monument: { mastery: 'exploration', xp: () => 40 },
  fishing: { mastery: 'seafaring', xp: (event: { amount: number }) => event.amount * 0.2 },
  freight: { mastery: 'seafaring', xp: (event: { amount: number }) => event.amount * 0.15 },
  extraction: { mastery: 'extraction', xp: (event: { amount: number }) => event.amount * 0.1 },
  foundation: { mastery: 'settlement', xp: () => 60 },
  damage: { mastery: 'combat', xp: (event: { amount: number }) => event.amount * 0.05 },
};

export interface MasteryState {
  xp: Record<MasteryId, number>;
  level: Record<MasteryId, number>;
  /** Pontos de talento ganhos (um por nível) ainda não gastos. */
  points: number;
  /** Eventos únicos já creditados (descoberta por setor, fundação, planta, monumento): repetir não paga de novo. */
  credited: Record<string, true>;
}

export const newMastery = (): MasteryState => ({
  xp: Object.fromEntries(MASTERY_IDS.map((id) => [id, 0])) as Record<MasteryId, number>,
  level: Object.fromEntries(MASTERY_IDS.map((id) => [id, MASTERY_START_LEVEL])) as Record<MasteryId, number>,
  points: 0,
  credited: {},
});

const UNIQUE: readonly XpEvent['kind'][] = ['discovery', 'foundation', 'plant', 'monument'];

/** Credita um evento ao dono: único por chave, fração acumulada, sobe de nível (teto 10) e dá 1 ponto por nível. */
export function creditXp(current: MasteryState | undefined, event: XpEvent): MasteryState {
  const mastery = current ?? newMastery();
  const rule = XP_RULES[event.kind];
  let credited = mastery.credited;
  if (UNIQUE.includes(event.kind)) {
    const key = `${event.kind}:${(event as { key: string }).key}`;
    if (key in credited) return mastery;
    credited = { ...credited, [key]: true };
  }
  const gain = rule.xp(event as never);
  if (!(gain > 0)) return { ...mastery, credited };
  const xp = { ...mastery.xp };
  const level = { ...mastery.level };
  let points = mastery.points;
  xp[rule.mastery] += gain;
  while (level[rule.mastery] < MASTERY_MAX_LEVEL && xp[rule.mastery] >= xpToNext(level[rule.mastery])) {
    xp[rule.mastery] -= xpToNext(level[rule.mastery]);
    level[rule.mastery] += 1;
    points += 1;
  }
  if (level[rule.mastery] >= MASTERY_MAX_LEVEL) xp[rule.mastery] = 0;
  return { xp, level, points, credited };
}

/** Chaves dos setores de 16x16 já explorados pelo dono (centro explorado), para a descoberta inédita. */
export function exploredSectorKeys(isExplored: (x: number, z: number) => boolean, size: number, sector = 16): string[] {
  const keys: string[] = [];
  for (let sx = 0; sx * sector < size; sx += 1) {
    for (let sz = 0; sz * sector < size; sz += 1) {
      const cx = Math.min(size - 1, sx * sector + Math.floor(sector / 2));
      const cz = Math.min(size - 1, sz * sector + Math.floor(sector / 2));
      if (isExplored(cx, cz)) keys.push(`${sx},${sz}`);
    }
  }
  return keys;
}

export type MasteryTable = NonNullable<GameState['mastery']>;

/** Aplica uma lista de eventos de vários donos ao estado, sem mutar o original. */
export function creditAll(table: MasteryTable | undefined, events: readonly { owner: string; event: XpEvent }[]): MasteryTable | undefined {
  if (events.length === 0) return table;
  const next: MasteryTable = { ...table };
  for (const { owner, event } of events) next[owner] = creditXp(next[owner], event);
  return next;
}
