import { planksFromWood } from './planks';
import type { RecipeDef } from './types';

export type { RecipeDef, RecipeInput, RecipeOutput } from './types';

/** Registro das receitas. Acrescentar uma receita = criar o arquivo e incluí-lo aqui (conferido por `items.test.ts`). */
export const RECIPE_DEFS: readonly RecipeDef[] = [planksFromWood];

export const recipeById = (id: string): RecipeDef | undefined => RECIPE_DEFS.find((recipe) => recipe.id === id);
export const recipesAt = (station: string): RecipeDef[] => RECIPE_DEFS.filter((recipe) => recipe.station === station);
export { planksFromWood };
