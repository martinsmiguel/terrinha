import { BUILDING_CATALOG, type BuildingType } from './buildingCatalog';
import { CRAFT_DEFS } from './crafts';
import { STUDY_CAP, craftLevel, type MasteryId, type MasteryTable } from './mastery';
import type { Building, UnitType } from './model';
import { ERA_LABEL, ERA_ORDER, TECH_DEFS, UNIT_ERA, eraIndex, eraReached, normalizeEra, type Era, type TechState } from './tech';

/**
 * Desbloqueios (card #177): cada construção e unidade exige uma era (declarada no catálogo e em `UNIT_ERA`) e, quando faz
 * sentido, nível de ofício, pesquisa concluída e construção própria de pé. Uma peça habilita a outra. Regra pura, sem DOM.
 */

export type Buildable = BuildingType;

/** Exigências além da era. */
export interface Unlock {
  crafts?: Readonly<Partial<Record<MasteryId, number>>>;
  /** Id de tecnologia (`TECH_DEFS`) concluída. */
  tech?: string;
  /** Construção própria concluída e de pé. */
  building?: Buildable;
}

export const BUILDING_UNLOCKS: Readonly<Partial<Record<Buildable, Unlock>>> = {
  sawmill: { crafts: { carpintaria: 2 } },
  outpost: { building: 'dock' },
  mine: { crafts: { mineracao: 2 } },
  market: { crafts: { comercio: 2 } },
  tower: { crafts: { cantaria: 3 }, building: 'barracks' },
  bridge: { crafts: { carpintaria: 3 } },
};

/** Nome de cada unidade, para avisos de desbloqueio. */
export const UNIT_LABEL: Record<UnitType, string> = {
  villager: 'Aldeão', wagon: 'Carroça', fishing_boat: 'Barco de Pesca', soldier: 'Mosqueteiro', colonial_transport: 'Transporte Colonial',
  trade_boat: 'Barco Mercante', cavalry: 'Cavalaria', warship: 'Barco de Guerra',
};

export const UNIT_UNLOCKS: Readonly<Partial<Record<UnitType, Unlock>>> = {
  trade_boat: { crafts: { comercio: 2 } },
  cavalry: { crafts: { guerra: 2 } },
  warship: { crafts: { navegacao: 4 }, tech: 'cartography' },
};

export type UnlockTarget = { kind: 'building'; type: Buildable } | { kind: 'unit'; type: UnitType };

export type Missing =
  | { kind: 'era'; era: Era }
  | { kind: 'craft'; craft: MasteryId; level: number; required: number }
  | { kind: 'tech'; tech: string }
  | { kind: 'building'; building: Buildable };

/** O que o estado precisa ter para avaliar desbloqueios. */
export interface UnlockState {
  buildings: readonly Building[];
  techs?: Record<string, TechState>;
  mastery?: MasteryTable;
}

const requirementOf = (target: UnlockTarget): { era: Era; unlock: Unlock } =>
  target.kind === 'building'
    ? { era: BUILDING_CATALOG[target.type].era, unlock: BUILDING_UNLOCKS[target.type] ?? {} }
    : { era: UNIT_ERA[target.type], unlock: UNIT_UNLOCKS[target.type] ?? {} };

/** O que falta ao dono para construir ou treinar o alvo; vazio quando está desbloqueado. */
export function missingFor(state: UnlockState, owner: string, target: UnlockTarget): Missing[] {
  const { era, unlock } = requirementOf(target);
  const tech = state.techs?.[owner];
  const missing: Missing[] = [];
  if (!eraReached(normalizeEra(tech?.era), era)) missing.push({ kind: 'era', era });
  for (const [craft, required] of Object.entries(unlock.crafts ?? {}) as [MasteryId, number][]) {
    const level = craftLevel(state.mastery, owner, craft);
    if (level < required) missing.push({ kind: 'craft', craft, level, required });
  }
  if (unlock.tech && !tech?.completed.includes(unlock.tech)) missing.push({ kind: 'tech', tech: unlock.tech });
  if (unlock.building && !state.buildings.some((b) => b.owner === owner && b.type === unlock.building && b.isComplete && b.health > 0)) {
    missing.push({ kind: 'building', building: unlock.building });
  }
  return missing;
}

export const isUnlocked = (state: UnlockState, owner: string, target: UnlockTarget): boolean => missingFor(state, owner, target).length === 0;

const craftName = (id: string): string => CRAFT_DEFS.find((craft) => craft.id === id)?.name ?? id;
const techName = (id: string): string => TECH_DEFS.find((tech) => tech.id === id)?.name ?? id;

/** Texto curto do que falta, para botão, dica e aviso. */
export const describeMissing = (missing: readonly Missing[]): string =>
  missing
    .map((entry) => {
      switch (entry.kind) {
        case 'era': return ERA_LABEL[entry.era];
        case 'craft': return `${craftName(entry.craft)} ${entry.level}/${entry.required}`;
        case 'tech': return techName(entry.tech);
        case 'building': return BUILDING_CATALOG[entry.building].name;
      }
    })
    .join(' · ');

/**
 * Problemas dos desbloqueios; vazio quando tudo é alcançável a partir do início: ofício dentro do teto de estudo da era,
 * pesquisa existente e da mesma era ou anterior, construção exigida desbloqueada até a mesma era e sem ciclo.
 */
export function validateUnlocks(
  buildings: Readonly<Partial<Record<Buildable, Unlock>>> = BUILDING_UNLOCKS,
  units: Readonly<Partial<Record<UnitType, Unlock>>> = UNIT_UNLOCKS
): string[] {
  const errors: string[] = [];
  const eraOfBuilding = (type: Buildable): Era => BUILDING_CATALOG[type].era;
  const check = (label: string, era: Era, unlock: Unlock) => {
    if (!ERA_ORDER.includes(era)) errors.push(`${label}: era desconhecida ${era}.`);
    for (const [craft, required] of Object.entries(unlock.crafts ?? {})) {
      if (!CRAFT_DEFS.some((def) => def.id === craft)) errors.push(`${label}: ofício desconhecido ${craft}.`);
      else if (!(required! >= 1 && required! <= STUDY_CAP[era])) errors.push(`${label}: ${craft} ${required} acima do teto de estudo da ${ERA_LABEL[era]}.`);
    }
    if (unlock.tech) {
      const tech = TECH_DEFS.find((def) => def.id === unlock.tech);
      if (!tech) errors.push(`${label}: pesquisa desconhecida ${unlock.tech}.`);
      else if (eraIndex(tech.era) > eraIndex(era)) errors.push(`${label}: pesquisa ${tech.id} só existe numa era posterior.`);
    }
    if (unlock.building) {
      if (!(unlock.building in BUILDING_CATALOG)) errors.push(`${label}: construção desconhecida ${unlock.building}.`);
      else if (eraIndex(eraOfBuilding(unlock.building)) > eraIndex(era)) errors.push(`${label}: exige ${unlock.building}, de era posterior.`);
    }
  };
  for (const [type, unlock] of Object.entries(buildings) as [Buildable, Unlock][]) check(`edifício ${type}`, eraOfBuilding(type), unlock);
  for (const [type, unlock] of Object.entries(units) as [UnitType, Unlock][]) check(`unidade ${type}`, UNIT_ERA[type], unlock);

  // Ciclo entre construções exigidas.
  for (const start of Object.keys(buildings) as Buildable[]) {
    const seen = new Set<Buildable>();
    let current: Buildable | undefined = start;
    while (current) {
      if (seen.has(current)) { errors.push(`Ciclo de construções exigidas a partir de ${start}.`); break; }
      seen.add(current);
      current = buildings[current]?.building;
    }
  }
  return errors;
}
