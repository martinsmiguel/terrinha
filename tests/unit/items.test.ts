import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COST_CHIP_CLASS, COST_LABEL, COST_SHORT, refinePlanks, SAWMILL_PLANKS_PER_TICK, SAWMILL_WOOD_PER_TICK, type MarketResourceType } from '../../src/game/economy';
import { applyContinuousRecipe, consumeInput, validateItemGraph } from '../../src/game/itemGraph';
import { ITEM_IDS, emptyItems, isItemId, itemById, itemsWithTag, type ItemDef } from '../../src/game/items';
import type { PlayerResources } from '../../src/game/model';
import { RECIPE_DEFS, planksFromWood, type RecipeDef } from '../../src/game/recipes';

const registered = (folder: string) => readdirSync(join(__dirname, '../../src/game', folder)).filter((f) => f.endsWith('.ts') && !['index.ts', 'types.ts'].includes(f));

describe('registro de itens e receitas', () => {
  it('todo arquivo da pasta de itens está registrado, um item por arquivo', () => {
    const files = registered('items').map((f) => f.replace('.ts', '')).sort();
    expect(files).toEqual([...ITEM_IDS].sort());
  });

  it('todo arquivo da pasta de receitas está registrado', () => {
    expect(registered('recipes')).toHaveLength(RECIPE_DEFS.length);
  });

  it('os 5 recursos de antes migraram com a mesma ordem, nomes, abreviações e cores', () => {
    expect(ITEM_IDS).toEqual(['wood', 'food', 'gold', 'stone', 'planks']);
    expect(COST_LABEL).toEqual({ wood: 'Madeira', food: 'Comida', gold: 'Ouro', stone: 'Pedra', planks: 'Tábuas' });
    expect(COST_SHORT).toEqual({ wood: 'M', food: 'C', gold: 'O', stone: 'P', planks: 'T' });
    expect(COST_CHIP_CLASS).toEqual({
      wood: 'text-amber-400 font-bold', food: 'text-red-300 font-bold', gold: 'text-yellow-300 font-bold',
      stone: 'text-slate-300 font-bold', planks: 'text-orange-300 font-bold',
    });
  });

  it('as constantes da serralheria vêm da receita, com os números de antes', () => {
    expect(SAWMILL_WOOD_PER_TICK).toBe(0.1);
    expect(SAWMILL_PLANKS_PER_TICK).toBe(0.05);
    expect(planksFromWood.station).toBe('sawmill');
  });

  it('os itens do mercado são os etiquetados como comercializáveis', () => {
    const market: MarketResourceType[] = ['wood', 'food', 'stone'];
    expect(itemsWithTag('comercializável').map((i) => i.id).sort()).toEqual([...market].sort());
  });

  it('consultas básicas', () => {
    expect(itemById('planks')?.source).toBe('refino');
    expect(isItemId('wood')).toBe(true);
    expect(isItemId('mana')).toBe(false);
    expect(emptyItems()).toEqual({ wood: 0, food: 0, gold: 0, stone: 0, planks: 0 });
  });
});

describe('grafo de itens', () => {
  it('o grafo real é válido: sem ciclo, sem referência quebrada, tudo alcançável a partir da coleta', () => {
    expect(validateItemGraph()).toEqual([]);
  });

  const raw = (id: string, tags: string[] = []): ItemDef => ({ id, name: id, short: id[0], era: 'pedra', source: 'coleta', tags, chipClass: '' });
  const refined = (id: string, tags: string[] = []): ItemDef => ({ ...raw(id, tags), source: 'refino' });
  const recipe = (id: string, inputs: RecipeDef['inputs'], outputs: RecipeDef['outputs']): RecipeDef => ({ id, name: id, station: 'oficina', mode: 'contínua', inputs, outputs, craft: 'carpintaria', requires: { era: 'pedra', craftLevel: 1 } });

  it('CONTROLE NEGATIVO: ciclo de receitas é recusado', () => {
    const items = [raw('a'), refined('b'), refined('c')];
    const recipes = [recipe('ab', [{ item: 'a' as never, amount: 1 }], [{ item: 'b' as never, amount: 1 }]),
      recipe('bc', [{ item: 'b' as never, amount: 1 }], [{ item: 'c' as never, amount: 1 }]),
      recipe('cb', [{ item: 'c' as never, amount: 1 }], [{ item: 'b' as never, amount: 1 }])];
    expect(validateItemGraph(items, recipes).join(' ')).toContain('Ciclo');
  });

  it('CONTROLE NEGATIVO: item refinado inalcançável e item refinado sem receita', () => {
    const items = [raw('a'), refined('b'), refined('orfao')];
    const recipes = [recipe('xb', [{ item: 'x' as never, amount: 1 }], [{ item: 'b' as never, amount: 1 }])];
    const errors = validateItemGraph(items, recipes).join(' ');
    expect(errors).toContain('entrada desconhecida x');
    expect(errors).toContain('b: inalcançável');
    expect(errors).toContain('orfao: item de refino sem receita');
  });

  it('CONTROLE NEGATIVO: etiqueta sem item, saída desconhecida, quantidade inválida e repetidos', () => {
    const items = [raw('a'), raw('a')];
    const recipes = [recipe('r', [{ tag: 'fantasma', amount: 1 }, { item: 'a' as never, amount: 0 }], [{ item: 'z' as never, amount: 1 }]), recipe('r', [], [])];
    const errors = validateItemGraph(items, recipes).join(' ');
    for (const piece of ['Item repetido', 'Receita repetida', 'etiqueta fantasma', 'saída desconhecida z', 'quantidade de entrada inválida', 'sem entrada', 'sem saída']) {
      expect(errors, piece).toContain(piece);
    }
  });

  it('entrada por etiqueta torna alcançável o que dela depende', () => {
    const items = [raw('lenha', ['combustível']), refined('brasa')];
    const recipes = [recipe('queima', [{ tag: 'combustível', amount: 1 }], [{ item: 'brasa' as never, amount: 1 }])];
    expect(validateItemGraph(items, recipes)).toEqual([]);
  });
});

describe('consumo e receita contínua', () => {
  const bag = (extra: Partial<Record<string, number>> = {}) => ({ ...emptyItems(), ...extra });

  it('consome por etiqueta na ordem do registro e recusa quando falta', () => {
    const madeira = { tag: 'madeira', amount: 12 } as const; // madeira e tábuas têm a etiqueta `madeira`
    expect(consumeInput(bag({ wood: 10, planks: 5 }), madeira)).toMatchObject({ wood: 0, planks: 3 });
    expect(consumeInput(bag({ wood: 5, planks: 5 }), madeira)).toBeNull();
    expect(consumeInput(bag({ wood: 5 }), { item: 'wood', amount: 3 })).toMatchObject({ wood: 2 });
  });

  it('o refino de tábuas é numericamente idêntico à conta de antes do registro, e a madeira nunca fica negativa', () => {
    const old = (r: PlayerResources, sawmills: number): PlayerResources => {
      if (sawmills <= 0) return r;
      const woodUsed = Math.min(r.wood, sawmills * 0.1);
      if (woodUsed <= 0) return r;
      return { ...r, wood: r.wood - woodUsed, planks: r.planks + woodUsed * (0.05 / 0.1) };
    };
    const base: PlayerResources = { wood: 0, food: 3, gold: 4, stone: 5, planks: 7, pop: 2, maxPop: 9 };
    for (const wood of [0, 0.03, 0.1, 0.17, 0.3, 1, 7.77, 1234.5]) {
      for (const sawmills of [0, 1, 2, 3, 7]) {
        const input = { ...base, wood };
        const next = refinePlanks(input, sawmills);
        expect(next, `madeira ${wood}, serralherias ${sawmills}`).toEqual(old(input, sawmills));
        expect(next.wood).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('receita com duas entradas produz na proporção da mais escassa', () => {
    const r: RecipeDef = { id: 'x', name: 'x', station: 's', mode: 'contínua', inputs: [{ item: 'wood', amount: 2 }, { item: 'stone', amount: 1 }], outputs: [{ item: 'planks', amount: 4 }], craft: 'carpintaria', requires: { era: 'pedra', craftLevel: 1 } };
    const next = applyContinuousRecipe(bag({ wood: 10, stone: 0.5 }), r, 1);
    expect(next).toMatchObject({ wood: 9, stone: 0, planks: 2 });
  });
});
