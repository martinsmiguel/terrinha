import { CRAFT_DEFS } from './crafts';
import { applyContinuousRecipe } from './itemGraph';
import { itemById, type ItemBalance, type ItemId } from './items';
import { craftLevel, type MasteryId, type MasteryTable } from './mastery';
import type { Building } from './model';
import { recipesAt, type RecipeDef } from './recipes';
import { ERA_LABEL, eraReached, normalizeEra, type TechState } from './tech';

/**
 * Produção por receita (card #178): cada construção que é estação de receitas usa a escolhida pelo dono
 * (`Building.recipeId`) ou a padrão da estação; a receita só roda com a era e o nível de ofício exigidos. Pura, sem DOM.
 */

export interface ProductionState {
  techs?: Record<string, TechState>;
  mastery?: MasteryTable;
}

/** Receitas que a construção pode usar (vazio: não é estação). */
export const stationRecipes = (type: Building['type']): RecipeDef[] => recipesAt(type);

/** Receita em uso: a escolhida, se ainda for desta estação, ou a padrão; `undefined` = construção parada. */
export const activeRecipe = (building: Pick<Building, 'type' | 'recipeId'>): RecipeDef | undefined => {
  const options = stationRecipes(building.type);
  return options.find((recipe) => recipe.id === building.recipeId) ?? (building.recipeId ? undefined : options.find((recipe) => recipe.default));
};

/** O que falta ao dono para usar a receita (texto curto), ou `null` se pode. */
export function recipeLock(state: ProductionState, owner: string, recipe: RecipeDef): string | null {
  const missing: string[] = [];
  if (!eraReached(normalizeEra(state.techs?.[owner]?.era), recipe.requires.era)) missing.push(ERA_LABEL[recipe.requires.era]);
  const level = craftLevel(state.mastery, owner, recipe.craft as MasteryId);
  const craftName = CRAFT_DEFS.find((craft) => craft.id === recipe.craft)?.name ?? recipe.craft;
  if (level < recipe.requires.craftLevel) missing.push(`${craftName} ${level}/${recipe.requires.craftLevel}`);
  return missing.length > 0 ? missing.join(' · ') : null;
}

export interface Produced { craft: MasteryId; recipe: string; item: ItemId; amount: number }

/**
 * Roda um passo das receitas de `stations` (construções do dono numa mesma localidade, já filtradas por concluída e de
 * pé) sobre o saldo daquela localidade. Receitas iguais somam estações; receitas sem exigência cumprida não rodam.
 */
export function runStations<T extends ItemBalance>(bag: T, stations: readonly Building[], owner: string, state: ProductionState): { bag: T; produced: Produced[] } {
  const groups = new Map<string, { recipe: RecipeDef; count: number }>();
  for (const station of stations) {
    const recipe = activeRecipe(station);
    if (!recipe) continue;
    const group = groups.get(recipe.id) ?? { recipe, count: 0 };
    group.count += 1;
    groups.set(recipe.id, group);
  }
  let next = bag;
  const produced: Produced[] = [];
  for (const { recipe, count } of groups.values()) {
    if (recipeLock(state, owner, recipe)) continue;
    const output = recipe.outputs[0].item;
    const before = next[output] ?? 0;
    next = applyContinuousRecipe(next, recipe, count);
    const amount = (next[output] ?? 0) - before;
    if (amount > 0) produced.push({ craft: recipe.craft as MasteryId, recipe: recipe.id, item: output, amount });
  }
  return { bag: next, produced };
}

/** Ferramenta de pedra (card #178): com ao menos uma no estoque da metrópole, a coleta rende mais e a ferramenta gasta. */
export const STONE_TOOL_GATHER_BONUS = 1.2;
/** Desgaste por passo de cada aldeão coletando com ferramenta (1 ferramenta a cada 100 s de trabalho). */
export const STONE_TOOL_WEAR_PER_TICK = 0.0005;

export const hasStoneTool = (resources: ItemBalance | undefined): boolean => (resources?.stone_tool ?? 0) >= 1;

/** Pode o dono pôr esta receita nesta construção? Construção própria, estação da receita e exigências cumpridas. */
export function canSetRecipe(
  state: ProductionState & { buildings: readonly Building[] }, owner: string, buildingId: string, recipeId: string
): { ok: true } | { ok: false; reason: string } {
  const building = state.buildings.find((candidate) => candidate.id === buildingId && candidate.owner === owner && candidate.health > 0);
  if (!building) return { ok: false, reason: 'Construção não encontrada.' };
  const recipe = stationRecipes(building.type).find((candidate) => candidate.id === recipeId);
  if (!recipe) return { ok: false, reason: 'Esta construção não faz essa receita.' };
  const lock = recipeLock(state, owner, recipe);
  return lock ? { ok: false, reason: `Receita bloqueada: falta ${lock}.` } : { ok: true };
}

/** Troca a receita da construção (validada por `canSetRecipe`); recusa devolve o mesmo estado. */
export function setRecipe<T extends ProductionState & { buildings: Building[] }>(state: T, owner: string, buildingId: string, recipeId: string): T {
  if (!canSetRecipe(state, owner, buildingId, recipeId).ok) return state;
  return { ...state, buildings: state.buildings.map((building) => (building.id === buildingId ? { ...building, recipeId } : building)) };
}

/** Receita em uma linha, por 100 passos (5 s) de uma estação: "10 Madeira → 2 Cabo de ferramenta". */
export const describeRecipe = (recipe: RecipeDef): string => {
  const per = (amount: number) => Math.round(amount * 100 * 100) / 100;
  const name = (id: string) => itemById(id)?.name ?? id;
  const inputs = recipe.inputs.map((input) => `${per(input.amount)} ${'item' in input ? name(input.item) : input.tag}`).join(' + ');
  const outputs = recipe.outputs.map((output) => `${per(output.amount)} ${name(output.item)}`).join(' + ');
  return `${inputs} → ${outputs} / 5 s`;
};
