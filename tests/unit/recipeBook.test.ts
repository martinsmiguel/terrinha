import { describe, expect, it } from 'vitest';
import { newMastery } from '../../src/game/mastery';
import { RECIPE_DEFS, type RecipeDef } from '../../src/game/recipes';
import { craftUnlocks, describeUnlock, nextCraftUnlock, normalizeSearch, recipeBook } from '../../src/game/recipeBook';

const ids = (entries: { id: string }[]) => entries.map((entry) => entry.id);
const at = (level: number) => ({ player1: { ...newMastery(), level: { ...newMastery().level, carpintaria: level } } });

describe('livro de receitas (#179)', () => {
  it('lê todas as receitas do registro, em ordem de era e nível, com estação, ofício e fórmula', () => {
    const all = recipeBook();
    expect(all).toHaveLength(RECIPE_DEFS.length);
    expect(ids(all).at(-1)).toBe('charcoal-from-firewood'); // única do Bronze
    const handle = all.find((entry) => entry.id === 'tool-handle-from-wood')!;
    expect(handle).toMatchObject({ station: 'Serralheria & Madeireira', craftName: 'Carpintaria', level: 2, eraLabel: 'Era da Pedra', inputs: ['Madeira'], outputs: ['Cabo de ferramenta'] });
    expect(handle.unlocks).toEqual(['Ferramenta de pedra']);
    expect(all.find((entry) => entry.id === 'firewood-from-wood')!.unlocks).toEqual(['Carvão vegetal']);
  });

  it('busca sem acento por nome, item ou construção', () => {
    expect(normalizeSearch('  Carvão ')).toBe('carvao');
    expect(ids(recipeBook({ query: 'carvao' }))).toEqual(['charcoal-from-firewood']);
    expect(ids(recipeBook({ query: 'centro da vila' }))).toEqual(['stone-tool']);
    expect(ids(recipeBook({ query: 'lenha' })).sort()).toEqual(['charcoal-from-firewood', 'firewood-from-wood']); // produz ou consome
  });

  it('filtra por era e por ofício, e combina com a busca', () => {
    expect(ids(recipeBook({ era: 'bronze' }))).toEqual(['charcoal-from-firewood']);
    expect(ids(recipeBook({ craft: 'cantaria' }))).toEqual(['stone-tool']);
    expect(ids(recipeBook({ era: 'pedra', craft: 'carpintaria', query: 'tab' }))).toEqual(['planks-from-wood']);
  });

  it('CONTROLE NEGATIVO: busca sem resultado e era sem receita devolvem vazio', () => {
    expect(recipeBook({ query: 'mana arcana' })).toEqual([]);
    expect(recipeBook({ era: 'industrial' })).toEqual([]);
  });

  it('uma receita nova no registro aparece no livro sem mexer na interface', () => {
    const extra: RecipeDef = { ...RECIPE_DEFS[0], id: 'teste', name: 'Receita de teste' };
    expect(ids(recipeBook({ query: 'receita de teste' }, [...RECIPE_DEFS, extra]))).toEqual(['teste']);
  });
});

describe('próximos desbloqueios dos ofícios', () => {
  it('reúne receitas, construções, unidades e eras que cada nível do ofício abre', () => {
    const carpentry = craftUnlocks('carpintaria');
    expect(carpentry.filter((unlock) => unlock.level === 2).map((unlock) => `${unlock.kind}:${unlock.name}`).sort()).toEqual(
      ['construção:Serralheria & Madeireira', 'era:Era do Bronze', 'receita:Cabo de ferramenta', 'receita:Carvão vegetal'].sort()
    );
    expect(carpentry.map((unlock) => unlock.level)).toEqual([...carpentry.map((unlock) => unlock.level)].sort((a, b) => a - b));
  });

  it('mostra o próximo nível que abre algo, a partir do nível atual do dono', () => {
    const fromOne = nextCraftUnlock(at(1), 'player1', 'carpintaria')!;
    expect(fromOne.level).toBe(2);
    expect(fromOne.items.map(describeUnlock)).toContain('Carvão vegetal (Era do Bronze)');
    expect(nextCraftUnlock(at(2), 'player1', 'carpintaria')!.level).toBe(3);
    expect(nextCraftUnlock(at(10), 'player1', 'carpintaria')).toBeNull();
    expect(nextCraftUnlock(undefined, 'player1', 'guerra')!.items.map((unlock) => unlock.name)).toContain('Cavalaria');
  });
});
