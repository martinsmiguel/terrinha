import { isCraftId } from './crafts';
import { ITEM_DEFS, ITEM_IDS, type ItemDef, type ItemId } from './items';
import { RECIPE_DEFS, type RecipeDef, type RecipeInput } from './recipes';

/**
 * Grafo de itens e receitas: validação (referências, etiquetas, ciclos e alcance a partir do que se coleta), consumo de
 * entradas por item ou por etiqueta e aplicação de receita contínua. Regra pura, sem DOM.
 */

const tagged = (items: readonly ItemDef[], tag: string): ItemDef[] => items.filter((item) => (item.tags as readonly string[]).includes(tag));
const inputItems = (items: readonly ItemDef[], input: RecipeInput): string[] =>
  'item' in input ? [input.item] : tagged(items, input.tag).map((item) => item.id);

/** Problemas do grafo; vazio quando todo item e toda receita fazem sentido. */
export function validateItemGraph(items: readonly ItemDef[] = ITEM_DEFS, recipes: readonly RecipeDef[] = RECIPE_DEFS): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) errors.push(`Item repetido: ${item.id}.`);
    ids.add(item.id);
  }
  const recipeIds = new Set<string>();
  for (const recipe of recipes) {
    if (recipeIds.has(recipe.id)) errors.push(`Receita repetida: ${recipe.id}.`);
    recipeIds.add(recipe.id);
    if (!isCraftId(recipe.craft)) errors.push(`${recipe.id}: ofício desconhecido ${recipe.craft}.`);
    if (!(recipe.requires.craftLevel >= 1)) errors.push(`${recipe.id}: nível de ofício inválido.`);
    if (recipe.inputs.length === 0) errors.push(`${recipe.id}: receita sem entrada.`);
    if (recipe.outputs.length === 0) errors.push(`${recipe.id}: receita sem saída.`);
    for (const input of recipe.inputs) {
      if (!(input.amount > 0)) errors.push(`${recipe.id}: quantidade de entrada inválida.`);
      if ('item' in input && !ids.has(input.item)) errors.push(`${recipe.id}: entrada desconhecida ${input.item}.`);
      if ('tag' in input && tagged(items, input.tag).length === 0) errors.push(`${recipe.id}: nenhum item com a etiqueta ${input.tag}.`);
    }
    for (const output of recipe.outputs) {
      if (!(output.amount > 0)) errors.push(`${recipe.id}: quantidade de saída inválida.`);
      if (!ids.has(output.item)) errors.push(`${recipe.id}: saída desconhecida ${output.item}.`);
    }
  }
  for (const item of items) {
    if (item.source === 'refino' && !recipes.some((recipe) => recipe.outputs.some((output) => output.item === item.id))) {
      errors.push(`${item.id}: item de refino sem receita que o produza.`);
    }
  }

  // Ciclo: aresta de cada item de entrada (com etiquetas expandidas) para cada item de saída.
  const edges = new Map<string, Set<string>>();
  for (const recipe of recipes) {
    for (const input of recipe.inputs) {
      for (const from of inputItems(items, input)) {
        const set = edges.get(from) ?? new Set<string>();
        for (const output of recipe.outputs) set.add(output.item);
        edges.set(from, set);
      }
    }
  }
  const state = new Map<string, 'aberto' | 'fechado'>();
  const visit = (node: string, path: string[]): void => {
    if (state.get(node) === 'fechado') return;
    if (state.get(node) === 'aberto') { errors.push(`Ciclo de receitas: ${[...path, node].join(' → ')}.`); return; }
    state.set(node, 'aberto');
    for (const next of edges.get(node) ?? []) visit(next, [...path, node]);
    state.set(node, 'fechado');
  };
  for (const id of ids) visit(id, []);

  // Alcance: começa no que se coleta e aplica receitas até não surgir nada novo.
  const reachable = new Set(items.filter((item) => item.source === 'coleta').map((item) => item.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const recipe of recipes) {
      const ready = recipe.inputs.every((input) => inputItems(items, input).some((id) => reachable.has(id)));
      if (!ready) continue;
      for (const output of recipe.outputs) {
        if (!reachable.has(output.item)) { reachable.add(output.item); grew = true; }
      }
    }
  }
  for (const item of items) if (!reachable.has(item.id)) errors.push(`${item.id}: inalcançável a partir dos itens coletáveis.`);
  return errors;
}

export type ItemBag = Record<ItemId, number>;

/** Quanto de cada entrada há no saldo (etiqueta = soma dos itens com ela). */
const available = (bag: ItemBag, input: RecipeInput): number =>
  'item' in input ? bag[input.item] ?? 0 : tagged(ITEM_DEFS, input.tag).reduce((sum, item) => sum + (bag[item.id as ItemId] ?? 0), 0);

/**
 * Consome `amount` de uma entrada. Por etiqueta, gasta os itens na ordem do registro até cobrir. Devolve o saldo novo ou
 * `null` se faltar.
 */
export function consumeInput(bag: ItemBag, input: RecipeInput, amount: number = input.amount): ItemBag | null {
  if (available(bag, input) + 1e-9 < amount) return null;
  const next = { ...bag };
  if ('item' in input) {
    next[input.item] -= amount;
    return next;
  }
  let left = amount;
  for (const item of tagged(ITEM_DEFS, input.tag)) {
    const id = item.id as ItemId;
    const take = Math.min(next[id] ?? 0, left);
    next[id] -= take;
    left -= take;
    if (left <= 1e-12) break;
  }
  return next;
}

/**
 * Aplica uma receita contínua por um passo com `stations` construções concluídas. Produz na proporção da entrada mais
 * escassa; sem entrada, não faz nada. Mantém exatamente a conta do refino de tábuas de antes do registro.
 */
export function applyContinuousRecipe<T extends ItemBag>(bag: T, recipe: RecipeDef, stations: number): T {
  if (stations <= 0 || recipe.inputs.length === 0) return bag;
  const caps = recipe.inputs.map((input) => input.amount * stations);
  const ratios = recipe.inputs.map((input, i) => available(bag, input) / caps[i]);
  const fraction = Math.min(1, ...ratios);
  if (!(fraction > 0)) return bag;
  // A entrada mais escassa gasta exatamente o que tem (sem resíduo de ponto flutuante); as outras, na mesma proporção.
  const consumption = recipe.inputs.map((input, i) => (ratios[i] <= fraction ? Math.min(available(bag, input), caps[i]) : caps[i] * fraction));
  let next: ItemBag = { ...bag };
  for (let i = 0; i < recipe.inputs.length; i += 1) {
    const consumed = consumeInput(next, recipe.inputs[i], consumption[i]);
    if (!consumed) return bag;
    next = consumed;
  }
  const reference = recipe.inputs[0];
  for (const output of recipe.outputs) next[output.item] = (next[output.item] ?? 0) + consumption[0] * (output.amount / reference.amount);
  return next as T;
}

/** Itens do registro, para quem precisa iterar sem importar a pasta. */
export { ITEM_IDS };
