import { describe, expect, it } from 'vitest';
import {
  ERA_LABEL,
  ERA_ORDER,
  ERA_UPGRADES,
  UNIT_ERA,
  eraCraftShortfall,
  normalizeEra,
  MAX_RESEARCH_QUEUE,
  TECH_DEFS,
  advanceResearch,
  createTechState,
  eraReached,
  gatherMultiplier,
  researchBlock,
  researchTarget,
  startResearch,
  techMultiplier,
  unitDamageMultiplier,
} from '../../src/game/tech';
import type { PlayerResources } from '../../src/game/engine';

const rich = (overrides: Partial<PlayerResources> = {}): PlayerResources => ({
  wood: 999,
  food: 999,
  gold: 999,
  stone: 0,
  planks: 0,
  pop: 3,
  maxPop: 15,
  ...overrides,
});

/** Ofícios no nível exigido para a Era do Bronze. */
const bronzeCrafts = { mineracao: 2, carpintaria: 2 };

const poor = (): PlayerResources => ({ wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: 0, maxPop: 15 });

describe('research catalog', () => {
  it('offers five eras beyond the Stone Age and the technologies', () => {
    expect(ERA_UPGRADES.map((upgrade) => upgrade.era)).toEqual(['bronze', 'ferro', 'medieval', 'navegacoes', 'industrial']);
    expect(TECH_DEFS.length).toBeGreaterThanOrEqual(6);
    expect(eraReached('bronze', 'pedra')).toBe(true);
    expect(eraReached('pedra', 'bronze')).toBe(false);
  });

  it('resolves technology and era targets by id', () => {
    expect(researchTarget('irrigation')?.category).toBe('economia');
    expect(researchTarget('era:bronze')?.category).toBe('era');
    expect(researchTarget('era:bronze')?.cost).toEqual({ wood: 100, gold: 50 });
    expect(researchTarget('does-not-exist')).toBeNull();
  });
});

describe('researchBlock', () => {
  it('allows an affordable technology of the current era', () => {
    expect(researchBlock(createTechState(), 'irrigation', rich())).toBeNull();
  });

  it('blocks unaffordable research', () => {
    expect(researchBlock(createTechState(), 'irrigation', poor())).toBe('cost');
  });

  it('blocks technologies locked behind a later era', () => {
    expect(researchBlock(createTechState(), 'cartography', rich())).toBe('era');
    expect(researchBlock(createTechState(), 'era:bronze', rich(), bronzeCrafts)).toBeNull();
  });

  it('blocks technologies with an unmet prerequisite', () => {
    const commercial = { ...createTechState(), era: 'navegacoes' as const };
    expect(researchBlock(commercial, 'cartography', rich())).toBe('requires');
    expect(researchBlock({ ...commercial, completed: ['coinage'] }, 'cartography', rich())).toBeNull();
  });

  it('blocks repeats and a full queue', () => {
    expect(researchBlock({ ...createTechState(), completed: ['irrigation'] }, 'irrigation', rich())).toBe('already');
    expect(researchBlock({ ...createTechState(), era: 'bronze' }, 'era:bronze', rich())).toBe('already');
    const busy = {
      ...createTechState(),
      queue: [
        { id: 'coinage', progress: 10 },
        { id: 'rifling', progress: 20 },
        { id: 'irrigation', progress: 30 },
      ],
    };
    expect(researchBlock(busy, 'musketeer_corps', rich())).toBe('busy');
    expect(busy.queue).toHaveLength(MAX_RESEARCH_QUEUE);
  });

  it('rejects unknown research ids', () => {
    expect(researchBlock(createTechState(), 'nope', rich())).toBe('unknown');
  });
});

describe('startResearch', () => {
  it('charges the cost and enqueues the item', () => {
    const result = startResearch(createTechState(), 'irrigation', rich({ wood: 200, gold: 100 }));
    expect(result).not.toBeNull();
    expect(result?.resources).toEqual({ wood: 50, food: 999, gold: 40, stone: 0, planks: 0, pop: 3, maxPop: 15 });
    expect(result?.techState.queue).toEqual([{ id: 'irrigation', progress: 0 }]);
  });

  it('returns null when the research is blocked', () => {
    expect(startResearch(createTechState(), 'irrigation', poor())).toBeNull();
  });
});

describe('advanceResearch', () => {
  it('progresses the queue item and completes the technology', () => {
    const started = startResearch(createTechState(), 'irrigation', rich())!.techState;
    const halfway = advanceResearch(started, 10); // irrigation leva 20s
    expect(halfway.queue[0].progress).toBeCloseTo(50);
    expect(halfway.completed).toEqual([]);

    const done = advanceResearch(halfway, 10);
    expect(done.queue).toEqual([]);
    expect(done.completed).toEqual(['irrigation']);
  });

  it('promotes the era when an era upgrade finishes', () => {
    const started = startResearch(createTechState(), 'era:bronze', rich(), bronzeCrafts)!.techState;
    const done = advanceResearch(started, ERA_UPGRADES[0].durationSeconds);
    expect(done.era).toBe('bronze');
    expect(done.queue).toEqual([]);
  });

  it('keeps the remaining queue intact and advances only the head', () => {
    const state = {
      ...createTechState(),
      queue: [
        { id: 'irrigation', progress: 0 },
        { id: 'coinage', progress: 0 },
      ],
    };
    const advanced = advanceResearch(state, 5);
    expect(advanced.queue[0].progress).toBeCloseTo(25);
    expect(advanced.queue[1].progress).toBe(0);
  });
});

describe('tech effects', () => {
  it('stacks bonuses of the same statistic', () => {
    const withBoth = { ...createTechState(), completed: ['coinage', 'cartography'] };
    expect(techMultiplier(createTechState(), 'gold_gather')).toBe(1);
    expect(techMultiplier(withBoth, 'gold_gather')).toBeCloseTo(1.5);
    expect(techMultiplier(undefined, 'gold_gather')).toBe(1);
  });

  it('multiplies infantry and cavalry damage separately', () => {
    const militar = { ...createTechState(), completed: ['rifling', 'logistics'] };
    expect(unitDamageMultiplier(militar, 'soldier')).toBeCloseTo(1.25);
    expect(unitDamageMultiplier(militar, 'cavalry')).toBeCloseTo(1.3);
    expect(unitDamageMultiplier(militar, 'villager')).toBe(1);
    expect(unitDamageMultiplier(createTechState(), 'soldier')).toBe(1);
  });

  it('multiplies wood and gold gathering only', () => {
    const econ = { ...createTechState(), completed: ['irrigation'] };
    expect(gatherMultiplier(econ, 'tree')).toBeCloseTo(1.25);
    expect(gatherMultiplier(econ, 'gold_mine')).toBe(1);
    expect(gatherMultiplier(econ, 'stone')).toBe(1);
    expect(gatherMultiplier(econ, 'fish_school')).toBe(1);
  });
});

describe('eras da Pedra à Industrial (#175)', () => {
  it('seis eras em ordem, com nome, começando na Pedra', () => {
    expect(ERA_ORDER).toEqual(['pedra', 'bronze', 'ferro', 'medieval', 'navegacoes', 'industrial']);
    expect(createTechState().era).toBe('pedra');
    for (const era of ERA_ORDER) expect(ERA_LABEL[era]).toMatch(/^Era /);
  });

  it('mantém o custo total da jornada de eras de antes (madeira 800, ouro 750)', () => {
    const total = ERA_UPGRADES.reduce((sum, upgrade) => ({ wood: sum.wood + (upgrade.cost.wood ?? 0), gold: sum.gold + (upgrade.cost.gold ?? 0) }), { wood: 0, gold: 0 });
    expect(total).toEqual({ wood: 800, gold: 750 });
  });

  it('toda era exige ofícios e cada exigência cabe no teto de estudo da era anterior', async () => {
    const { STUDY_CAP, MASTERY_IDS } = await import('../../src/game/mastery');
    for (const upgrade of ERA_UPGRADES) {
      const previous = ERA_ORDER[ERA_ORDER.indexOf(upgrade.era) - 1];
      expect(Object.keys(upgrade.crafts).length).toBeGreaterThan(0);
      for (const [craft, level] of Object.entries(upgrade.crafts)) {
        expect(MASTERY_IDS).toContain(craft);
        expect(level).toBeLessThanOrEqual(STUDY_CAP[previous]);
      }
    }
  });

  it('a partir da Pedra, estudando até a exigência, chega à Industrial uma era por vez', () => {
    let state = createTechState();
    const crafts: Record<string, number> = {};
    for (const upgrade of ERA_UPGRADES) {
      expect(researchBlock(state, `era:${upgrade.era}`, rich(), crafts)).toBe('crafts');
      Object.assign(crafts, upgrade.crafts);
      const started = startResearch(state, `era:${upgrade.era}`, rich(), crafts);
      expect(started).not.toBeNull();
      state = advanceResearch(started!.techState, upgrade.durationSeconds);
      expect(state.era).toBe(upgrade.era);
    }
    expect(state.era).toBe('industrial');
  });

  it('CONTROLE NEGATIVO: sem ofício, ou pulando era, o avanço é recusado e nada é debitado', () => {
    expect(researchBlock(createTechState(), 'era:bronze', rich())).toBe('crafts');
    expect(eraCraftShortfall('bronze', { mineracao: 2 })).toEqual([{ craft: 'carpintaria', level: 1, required: 2 }]);
    expect(startResearch(createTechState(), 'era:bronze', rich(), { mineracao: 2 })).toBeNull();
    expect(researchBlock(createTechState(), 'era:ferro', rich(), { mineracao: 9, carpintaria: 9 })).toBe('era');
  });

  it('estados de antes do #175 continuam válidos: as eras antigas viram as novas', () => {
    expect(normalizeEra('colonial')).toBe('pedra');
    expect(normalizeEra('commercial')).toBe('navegacoes');
    expect(normalizeEra(undefined)).toBe('pedra');
    expect(normalizeEra('ferro')).toBe('ferro');
    const legacy = { ...createTechState(), era: 'commercial' as never };
    expect(researchBlock(legacy, 'cartography', rich(), {})).toBe('requires');
    expect(eraReached(legacy.era, 'medieval')).toBe(true);
  });

  it('toda unidade e todo edifício declaram a era', async () => {
    const { BUILDING_CATALOG } = await import('../../src/game/buildingCatalog');
    for (const era of Object.values(UNIT_ERA)) expect(ERA_ORDER).toContain(era);
    for (const def of Object.values(BUILDING_CATALOG)) expect(ERA_ORDER).toContain(def.era);
  });
});
