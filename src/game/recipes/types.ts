import type { CraftId } from '../crafts';
import type { ItemId } from '../items';
import type { Era } from '../tech';

/** Entrada de receita: um item específico ou qualquer item com a etiqueta (ex.: `combustível`). */
export type RecipeInput = { item: ItemId; amount: number } | { tag: string; amount: number };
export interface RecipeOutput { item: ItemId; amount: number }

/**
 * Receita: em qual construção acontece, entradas → saídas e o que a destrava. Um arquivo por receita em `src/game/recipes/`.
 * `contínua`: as quantidades valem por passo de simulação e por construção concluída (refino passivo).
 */
export interface RecipeDef {
  id: string;
  name: string;
  /** Tipo da construção onde a receita acontece. */
  station: string;
  mode: 'contínua';
  inputs: readonly RecipeInput[];
  outputs: readonly RecipeOutput[];
  /** Ofício treinado por esta produção. */
  craft: CraftId;
  /** Receita que a construção usa enquanto o dono não escolhe outra (uma por estação, no máximo). */
  default?: true;
  /** Exigências para usar a receita: era e nível mínimo do ofício.*/
  requires: { era: Era; craftLevel: number };
}
