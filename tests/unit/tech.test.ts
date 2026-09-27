import { describe, expect, it } from 'vitest';
import {
  ERA_UPGRADES,
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

const poor = (): PlayerResources => ({ wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: 0, maxPop: 15 });

describe('research catalog', () => {
  it('offers two eras beyond the starting one and seven technologies', () => {
    expect(ERA_UPGRADES.map((upgrade) => upgrade.era)).toEqual(['commercial', 'industrial']);
    expect(TECH_DEFS.length).toBeGreaterThanOrEqual(6);
    expect(eraReached('commercial', 'colonial')).toBe(true);
    expect(eraReached('colonial', 'commercial')).toBe(false);
  });

  it('resolves technology and era targets by id', () => {
    expect(researchTarget('irrigation')?.category).toBe('economia');
    expect(researchTarget('era:commercial')?.category).toBe('era');
    expect(researchTarget('era:commercial')?.cost).toEqual({ wood: 300, gold: 250 });
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
    expect(researchBlock(createTechState(), 'era:commercial', rich())).toBeNull();
  });

  it('blocks technologies with an unmet prerequisite', () => {
    const commercial = { ...createTechState(), era: 'commercial' as const };
    expect(researchBlock(commercial, 'cartography', rich())).toBe('requires');
    expect(researchBlock({ ...commercial, completed: ['coinage'] }, 'cartography', rich())).toBeNull();
  });

  it('blocks repeats and a full queue', () => {
    expect(researchBlock({ ...createTechState(), completed: ['irrigation'] }, 'irrigation', rich())).toBe('already');
    expect(researchBlock({ ...createTechState(), era: 'commercial' }, 'era:commercial', rich())).toBe('already');
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
    const started = startResearch(createTechState(), 'era:commercial', rich())!.techState;
    const done = advanceResearch(started, ERA_UPGRADES[0].durationSeconds);
    expect(done.era).toBe('commercial');
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
