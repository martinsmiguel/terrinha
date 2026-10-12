import { BUILDING_CATALOG } from './buildingCatalog';
import { CRAFT_DEFS, type CraftId } from './crafts';
import { itemById } from './items';
import { craftLevel, type MasteryTable } from './mastery';
import { describeRecipe } from './production';
import { RECIPE_DEFS, type RecipeDef } from './recipes';
import { ERA_LABEL, ERA_ORDER, ERA_UPGRADES, UNIT_ERA, eraIndex, type Era } from './tech';
import { BUILDING_UNLOCKS, UNIT_LABEL, UNIT_UNLOCKS } from './unlocks';

/**
 * Livro de receitas e próximos desbloqueios dos ofícios (card #179): tudo lido dos registros (itens, receitas, ofícios,
 * desbloqueios e eras), para a progressão não ficar invisível. Regra pura, sem DOM.
 */

const craftName = (id: string): string => CRAFT_DEFS.find((craft) => craft.id === id)?.name ?? id;
const stationName = (type: string): string =>
  type === 'town_center' ? 'Centro da Vila' : BUILDING_CATALOG[type as keyof typeof BUILDING_CATALOG]?.name ?? type;
const itemName = (id: string): string => itemById(id)?.name ?? id;

export interface BookEntry {
  id: string;
  name: string;
  station: string;
  craft: string;
  craftName: string;
  era: Era;
  eraLabel: string;
  level: number;
  /** "10 Madeira → 5 Tábuas / 5 s". */
  formula: string;
  inputs: string[];
  outputs: string[];
  /** Receitas que usam o que esta produz: o que ela destrava na cadeia. */
  unlocks: string[];
}

const entryOf = (recipe: RecipeDef): BookEntry => {
  const outputs = recipe.outputs.map((output) => output.item as string);
  return {
    id: recipe.id,
    name: recipe.name,
    station: stationName(recipe.station),
    craft: recipe.craft,
    craftName: craftName(recipe.craft),
    era: recipe.requires.era,
    eraLabel: ERA_LABEL[recipe.requires.era],
    level: recipe.requires.craftLevel,
    formula: describeRecipe(recipe),
    inputs: recipe.inputs.map((input) => ('item' in input ? itemName(input.item) : `qualquer ${input.tag}`)),
    outputs: outputs.map(itemName),
    unlocks: RECIPE_DEFS.filter((other) => other.id !== recipe.id && other.inputs.some((input) =>
      'item' in input ? outputs.includes(input.item) : outputs.some((id) => (itemById(id)?.tags as readonly string[] | undefined)?.includes(input.tag))))
      .map((other) => other.name),
  };
};

/** Sem acento e em minúsculas, para a busca achar "carvao" e "Carvão". */
export const normalizeSearch = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export interface BookFilter {
  query?: string;
  era?: Era | 'todas';
  craft?: string | 'todos';
}

/** Receitas do registro, em ordem de era e nível, filtradas por texto (nome, estação, ofício, itens), era e ofício. */
export function recipeBook(filter: BookFilter = {}, recipes: readonly RecipeDef[] = RECIPE_DEFS): BookEntry[] {
  const query = normalizeSearch(filter.query ?? '');
  return recipes
    .map(entryOf)
    .filter((entry) => !filter.era || filter.era === 'todas' || entry.era === filter.era)
    .filter((entry) => !filter.craft || filter.craft === 'todos' || entry.craft === filter.craft)
    .filter((entry) => !query || normalizeSearch([entry.name, entry.station, entry.craftName, entry.eraLabel, ...entry.inputs, ...entry.outputs].join(' ')).includes(query))
    .sort((a, b) => eraIndex(a.era) - eraIndex(b.era) || a.level - b.level || a.name.localeCompare(b.name));
}

export interface CraftUnlock {
  level: number;
  kind: 'receita' | 'construção' | 'unidade' | 'era';
  name: string;
  /** Era também exigida (se houver). */
  era?: Era;
}

/** Tudo o que um nível de ofício destrava no registro, do menor nível ao maior. */
export function craftUnlocks(craft: CraftId): CraftUnlock[] {
  const list: CraftUnlock[] = [];
  for (const recipe of RECIPE_DEFS) {
    if (recipe.craft === craft && recipe.requires.craftLevel > 1) list.push({ level: recipe.requires.craftLevel, kind: 'receita', name: recipe.name, era: recipe.requires.era });
  }
  for (const [type, unlock] of Object.entries(BUILDING_UNLOCKS)) {
    const level = unlock?.crafts?.[craft];
    if (level) list.push({ level, kind: 'construção', name: BUILDING_CATALOG[type as keyof typeof BUILDING_CATALOG].name, era: BUILDING_CATALOG[type as keyof typeof BUILDING_CATALOG].era });
  }
  for (const [type, unlock] of Object.entries(UNIT_UNLOCKS)) {
    const level = unlock?.crafts?.[craft];
    if (level) list.push({ level, kind: 'unidade', name: UNIT_LABEL[type as keyof typeof UNIT_LABEL], era: UNIT_ERA[type as keyof typeof UNIT_ERA] });
  }
  for (const upgrade of ERA_UPGRADES) {
    const level = upgrade.crafts[craft];
    if (level) list.push({ level, kind: 'era', name: upgrade.name });
  }
  return list.sort((a, b) => a.level - b.level || (a.era && b.era ? eraIndex(a.era) - eraIndex(b.era) : 0) || a.name.localeCompare(b.name));
}

/** O próximo nível do ofício que destrava algo para o dono, com o que destrava; `null` se não houver mais nada. */
export function nextCraftUnlock(table: MasteryTable | undefined, owner: string, craft: CraftId): { level: number; current: number; items: CraftUnlock[] } | null {
  const current = craftLevel(table, owner, craft);
  const ahead = craftUnlocks(craft).filter((unlock) => unlock.level > current);
  if (ahead.length === 0) return null;
  const level = ahead[0].level;
  return { level, current, items: ahead.filter((unlock) => unlock.level === level) };
}

export const describeUnlock = (unlock: CraftUnlock): string =>
  `${unlock.name}${unlock.era && unlock.era !== ERA_ORDER[0] && unlock.kind !== 'era' ? ` (${ERA_LABEL[unlock.era]})` : ''}`;
