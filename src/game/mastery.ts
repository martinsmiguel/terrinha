import { CRAFT_DEFS, CRAFT_IDS, craftById, type CraftId } from './crafts';
import { HOME, canPayAt, debitAt } from './depots';
import type { ResourceCost } from './economy';
import type { ItemId } from './items';
import type { GameState } from './model';
import type { RecipeDef } from './recipes';
import { normalizeEra, type Era } from './tech';

/**
 * Ofícios do império (card #176): o conhecimento evolui pelo trabalho (eventos autoritativos da partida) e pelo estudo pago.
 * O registro de ofícios fica em `src/game/crafts/`; os nomes `Mastery*` são mantidos por compatibilidade com o código.
 */

export const MASTERY_IDS = CRAFT_IDS;
export type MasteryId = CraftId;

export const MASTERY_LABEL: Record<MasteryId, string> = Object.fromEntries(CRAFT_DEFS.map((craft) => [craft.id, craft.name])) as Record<MasteryId, string>;

export const MASTERY_START_LEVEL = 1;
export const MASTERY_MAX_LEVEL = 10;

/** XP para passar do nível `level` ao seguinte: cresce mais que linear, para limitar a disparada de quem começa na frente. */
export const xpToNext = (level: number): number => Math.ceil(100 * level ** 1.95);

export type XpEvent =
  | { kind: 'discovery'; key: string }
  | { kind: 'fishing'; amount: number }
  /** Coleta em terra; o item decide o ofício treinado. Sem item (eventos antigos) vale a agricultura. */
  | { kind: 'extraction'; amount: number; item?: ItemId }
  | { kind: 'foundation'; key: string }
  | { kind: 'freight'; amount: number }
  | { kind: 'plant'; key: string }
  | { kind: 'monument'; key: string }
  | { kind: 'damage'; amount: number }
  /** Produção por receita: treina o ofício declarado na receita. */
  | { kind: 'production'; craft: MasteryId; amount: number }
  /** Estudo pago: XP direto no ofício. */
  | { kind: 'study'; craft: MasteryId; xp: number };

/** Ofício treinado pela coleta de cada item. */
export const GATHER_CRAFT: Record<ItemId, MasteryId> = { wood: 'carpintaria', stone: 'cantaria', gold: 'mineracao', food: 'agricultura', planks: 'carpintaria' };

/** XP de produção por unidade produzida. */
export const PRODUCTION_XP = 0.5;

/** Quanto cada evento paga, e a quais ofícios (um evento pode treinar mais de um). */
export function xpGains(event: XpEvent): { craft: MasteryId; xp: number }[] {
  switch (event.kind) {
    case 'discovery': return [{ craft: 'exploracao', xp: 10 }];
    case 'plant': return [{ craft: 'exploracao', xp: 25 }];
    case 'monument': return [{ craft: 'exploracao', xp: 40 }];
    case 'fishing': return [{ craft: 'navegacao', xp: event.amount * 0.2 }];
    case 'freight': return [{ craft: 'navegacao', xp: event.amount * 0.15 }, { craft: 'comercio', xp: event.amount * 0.15 }];
    case 'extraction': return [{ craft: GATHER_CRAFT[event.item ?? 'food'], xp: event.amount * 0.1 }];
    case 'foundation': return [{ craft: 'colonizacao', xp: 60 }];
    case 'damage': return [{ craft: 'guerra', xp: event.amount * 0.05 }];
    case 'production': return [{ craft: event.craft, xp: event.amount * PRODUCTION_XP }];
    case 'study': return [{ craft: event.craft, xp: event.xp }];
  }
}

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

/** Maestrias antigas e os ofícios que as herdam (a extração se dividia em quatro ofícios de coleta). */
export const LEGACY_MASTERY: Record<string, readonly MasteryId[]> = {
  exploration: ['exploracao'], seafaring: ['navegacao'], settlement: ['colonizacao'], combat: ['guerra'],
  extraction: ['agricultura', 'carpintaria', 'cantaria', 'mineracao'],
};

/**
 * Converte um estado com chaves antigas: cada ofício herda o nível e o XP da maestria de origem (o maior, se houver mais de
 * uma). Pontos e eventos já creditados ficam como estão: talentos comprados não se perdem e nada é pago de novo.
 */
export function normalizeMastery(current: MasteryState | undefined): MasteryState | undefined {
  if (!current) return current;
  const legacy = Object.keys(current.level).filter((key) => key in LEGACY_MASTERY);
  if (legacy.length === 0 && MASTERY_IDS.every((id) => id in current.level)) return current;
  const fresh = newMastery();
  for (const id of MASTERY_IDS) {
    if (id in current.level) { fresh.level[id] = current.level[id]; fresh.xp[id] = current.xp[id] ?? 0; }
  }
  for (const key of legacy) {
    for (const id of LEGACY_MASTERY[key]) {
      const oldLevel = (current.level as Record<string, number>)[key];
      const oldXp = (current.xp as Record<string, number>)[key] ?? 0;
      if (oldLevel > fresh.level[id] || (oldLevel === fresh.level[id] && oldXp > fresh.xp[id])) {
        fresh.level[id] = oldLevel;
        fresh.xp[id] = oldXp;
      }
    }
  }
  return { ...fresh, points: current.points, credited: current.credited };
}

const UNIQUE: readonly XpEvent['kind'][] = ['discovery', 'foundation', 'plant', 'monument'];

/** Credita um evento ao dono: único por chave, fração acumulada, sobe de nível (teto 10) e dá 1 ponto por nível. */
export function creditXp(current: MasteryState | undefined, event: XpEvent): MasteryState {
  const mastery = normalizeMastery(current) ?? newMastery();
  let credited = mastery.credited;
  if (UNIQUE.includes(event.kind)) {
    const key = `${event.kind}:${(event as { key: string }).key}`;
    if (key in credited) return mastery;
    credited = { ...credited, [key]: true };
  }
  const gains = xpGains(event).filter((gain) => gain.xp > 0);
  if (gains.length === 0) return { ...mastery, credited };
  const xp = { ...mastery.xp };
  const level = { ...mastery.level };
  let points = mastery.points;
  for (const { craft, xp: gain } of gains) {
    if (level[craft] >= MASTERY_MAX_LEVEL) continue;
    xp[craft] += gain;
    while (level[craft] < MASTERY_MAX_LEVEL && xp[craft] >= xpToNext(level[craft])) {
      xp[craft] -= xpToNext(level[craft]);
      level[craft] += 1;
      points += 1;
    }
    if (level[craft] >= MASTERY_MAX_LEVEL) xp[craft] = 0;
  }
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

/* ---------- estudo pago ---------- */

/** Nível máximo que o estudo alcança em cada era (o trabalho pode passar disso). */
export const STUDY_CAP: Record<Era, number> = { pedra: 2, bronze: 3, ferro: 4, medieval: 5, navegacoes: 7, industrial: 10 };
/** Cada sessão de estudo rende esta fração do XP que falta para o próximo nível (duas sessões por nível). */
export const STUDY_FRACTION = 0.5;

/** Custo de uma sessão de estudo do ofício no nível atual: o custo base vezes o nível. */
export function studyCost(craft: MasteryId, level: number): ResourceCost {
  const base = craftById(craft)?.studyCost ?? {};
  return Object.fromEntries(Object.entries(base).map(([key, value]) => [key, (value ?? 0) * level])) as ResourceCost;
}

type Studying = Pick<GameState, 'mastery' | 'techs' | 'playerResources' | 'localStocks' | 'foundationKits'>;
export type StudyCheck = { ok: true; cost: ResourceCost; xp: number } | { ok: false; reason: string };

const eraOf = (state: Studying, owner: string): Era => normalizeEra(state.techs?.[owner]?.era);

/** O dono pode estudar o ofício agora? Recusa ofício desconhecido, nível no teto da era e falta de recurso na metrópole. */
export function canStudy(state: Studying, owner: string, craft: string): StudyCheck {
  if (!craftById(craft)) return { ok: false, reason: 'Ofício desconhecido.' };
  const id = craft as MasteryId;
  const mastery = normalizeMastery(state.mastery?.[owner]) ?? newMastery();
  const level = mastery.level[id];
  const cap = STUDY_CAP[eraOf(state, owner)];
  if (level >= cap) return { ok: false, reason: `O estudo chega ao nível ${cap} nesta era; avance de era ou pratique o ofício.` };
  const cost = studyCost(id, level);
  if (!canPayAt(state, owner, HOME, cost)) return { ok: false, reason: 'Recursos insuficientes na metrópole.' };
  return { ok: true, cost, xp: Math.ceil(xpToNext(level) * STUDY_FRACTION) };
}

/** Aplica o estudo: debita a metrópole e credita o XP. Recusado, devolve o estado intacto. */
export function studyCraft<T extends Studying>(state: T, owner: string, craft: string): { state: T; check: StudyCheck } {
  const check = canStudy(state, owner, craft);
  if (!check.ok) return { state, check };
  const paid = debitAt(state, owner, HOME, check.cost);
  if (!paid) return { state, check: { ok: false, reason: 'Recursos insuficientes na metrópole.' } };
  return { state: { ...paid, mastery: creditAll(paid.mastery, [{ owner, event: { kind: 'study', craft: craft as MasteryId, xp: check.xp } }]) }, check };
}

/** Nível do ofício do dono (1 sem registro). */
export const craftLevel = (table: MasteryTable | undefined, owner: string, craft: MasteryId): number =>
  normalizeMastery(table?.[owner])?.level[craft] ?? MASTERY_START_LEVEL;

/** Níveis de todos os ofícios do dono (id → nível), para as exigências de era. */
export const craftLevels = (table: MasteryTable | undefined, owner: string): Record<MasteryId, number> =>
  Object.fromEntries(MASTERY_IDS.map((craft) => [craft, craftLevel(table, owner, craft)])) as Record<MasteryId, number>;

/** O dono domina o ofício da receita no nível exigido? É a regra que o host aplica antes de produzir. */
export const canUseRecipe = (table: MasteryTable | undefined, owner: string, recipe: RecipeDef): boolean =>
  craftLevel(table, owner, recipe.craft) >= recipe.requires.craftLevel;

/** A IA reavalia o estudo a cada intervalo de jogo. */
export const BOT_STUDY_INTERVAL_SECONDS = 30;
/** Ofícios de economia que a IA estuda, do mais útil ao menos. */
const BOT_STUDY_ORDER: readonly MasteryId[] = ['carpintaria', 'agricultura', 'mineracao', 'cantaria'];

/**
 * Ofício que a IA estuda agora: o de menor nível entre os de economia que ela pode estudar, desde que sobre na metrópole o
 * dobro do custo (a IA não gasta a reserva). `null` se nenhum.
 */
export function botStudyChoice(state: Studying, owner: string): MasteryId | null {
  const mastery = normalizeMastery(state.mastery?.[owner]) ?? newMastery();
  const options = BOT_STUDY_ORDER
    .filter((craft) => {
      const check = canStudy(state, owner, craft);
      if (!check.ok) return false;
      const doubled = Object.fromEntries(Object.entries(check.cost).map(([key, value]) => [key, (value ?? 0) * 2])) as ResourceCost;
      return canPayAt(state, owner, HOME, doubled);
    })
    .sort((a, b) => mastery.level[a] - mastery.level[b]);
  return options[0] ?? null;
}
