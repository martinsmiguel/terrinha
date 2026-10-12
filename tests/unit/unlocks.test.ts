import { describe, expect, it } from 'vitest';
import { BUILDING_CATALOG, type BuildingType } from '../../src/game/buildingCatalog';
import { MASTERY_IDS, newMastery, type MasteryId } from '../../src/game/mastery';
import type { Building, GameState, UnitType } from '../../src/game/model';
import { isAuthorizedPlayerCommand } from '../../src/game/networkCommands';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';
import { createTechState, TECH_DEFS, UNIT_ERA, type Era } from '../../src/game/tech';
import {
  BUILDING_UNLOCKS, UNIT_UNLOCKS, describeMissing, isUnlocked, missingFor, validateUnlocks, type Unlock, type UnlockTarget,
} from '../../src/game/unlocks';

const rich = { wood: 5000, food: 5000, gold: 5000, stone: 5000, planks: 500, pop: 4, maxPop: 50 };
const building = (type: Building['type'], owner = 'player1', id = `${type}-${owner}`): Building => ({
  id, type, owner, position: { x: 10, z: 10 }, health: 800, maxHealth: 800, isComplete: true, trainingQueue: [],
});
const world = (extra: Partial<GameState> = {}): GameState => ({
  units: [], buildings: [building('town_center'), building('town_center', 'player2')], resourceNodes: [],
  playerResources: { player1: { ...rich }, player2: { ...rich } }, techs: { player1: createTechState(), player2: createTechState() }, ...extra,
});
const levels = (crafts: Partial<Record<MasteryId, number>> = {}) => ({ ...newMastery(), level: { ...newMastery().level, ...crafts } });

/** Estado mínimo que cumpre exatamente a exigência do alvo: a era dele, os ofícios no nível, a pesquisa e a construção. */
const meeting = (era: Era, unlock: Unlock): GameState => world({
  techs: { player1: { era, completed: unlock.tech ? [unlock.tech] : [], queue: [] }, player2: createTechState() },
  mastery: { player1: levels(unlock.crafts) },
  buildings: [building('town_center'), ...(unlock.building ? [building(unlock.building)] : [])],
});

const BUILDABLE = Object.keys(BUILDING_CATALOG) as BuildingType[];
const UNITS = Object.keys(UNIT_ERA) as UnitType[];

describe('desbloqueios: tudo alcançável a partir do início', () => {
  it('o registro é coerente: ofício no teto de estudo da era, pesquisa e construção existentes e sem ciclo', () => {
    expect(validateUnlocks()).toEqual([]);
  });

  it('na Pedra, sem ofício, o básico já está liberado: casa, fazenda, cais, quartel, aldeão, mosqueteiro e barco de pesca', () => {
    const start = world();
    for (const type of ['house', 'farm', 'dock', 'barracks'] as const) expect(missingFor(start, 'player1', { kind: 'building', type })).toEqual([]);
    for (const type of ['villager', 'soldier', 'fishing_boat', 'colonial_transport'] as const) expect(missingFor(start, 'player1', { kind: 'unit', type })).toEqual([]);
  });

  it('cada construção e unidade libera exatamente quando sua exigência é cumprida', () => {
    const targets: [UnlockTarget, Era, Unlock][] = [
      ...BUILDABLE.map((type) => [{ kind: 'building', type }, BUILDING_CATALOG[type].era, BUILDING_UNLOCKS[type] ?? {}] as [UnlockTarget, Era, Unlock]),
      ...UNITS.map((type) => [{ kind: 'unit', type }, UNIT_ERA[type], UNIT_UNLOCKS[type] ?? {}] as [UnlockTarget, Era, Unlock]),
    ];
    for (const [target, era, unlock] of targets) {
      expect(missingFor(meeting(era, unlock), 'player1', target), `${target.kind} ${target.type}`).toEqual([]);
    }
  });

  it('uma peça habilita a outra: o posto avançado espera o cais; a torre, o quartel', () => {
    const ferro = { techs: { player1: { era: 'ferro' as const, completed: [], queue: [] }, player2: createTechState() }, mastery: { player1: levels({ cantaria: 3 }) } };
    expect(missingFor(world(), 'player1', { kind: 'building', type: 'outpost' })).toEqual([{ kind: 'building', building: 'dock' }]);
    expect(isUnlocked(world({ buildings: [building('dock')] }), 'player1', { kind: 'building', type: 'outpost' })).toBe(true);
    expect(missingFor(world(ferro), 'player1', { kind: 'building', type: 'tower' })).toEqual([{ kind: 'building', building: 'barracks' }]);
    // Construção em obra ou destruída não conta.
    const obra = { ...building('dock'), isComplete: false };
    expect(isUnlocked(world({ buildings: [obra] }), 'player1', { kind: 'building', type: 'outpost' })).toBe(false);
  });

  it('descreve o que falta em uma linha', () => {
    expect(describeMissing(missingFor(world(), 'player1', { kind: 'unit', type: 'cavalry' }))).toBe('Era do Ferro · Guerra 1/2');
    expect(describeMissing(missingFor(world(), 'player1', { kind: 'unit', type: 'warship' }))).toBe('Era das Navegações · Navegação 1/4 · Cartografia');
  });

  it('estados antigos sem ofícios nem era valem como Pedra no nível 1', () => {
    const legacy = world({ techs: { player1: { era: 'colonial' as never, completed: [], queue: [] } }, mastery: undefined });
    expect(missingFor(legacy, 'player1', { kind: 'building', type: 'sawmill' })).toEqual([{ kind: 'craft', craft: 'carpintaria', level: 1, required: 2 }]);
  });
});

describe('CONTROLE NEGATIVO: exigência impossível', () => {
  it('ofício acima do teto, pesquisa de era posterior, construção desconhecida e ciclo são apontados', () => {
    expect(validateUnlocks({ house: { crafts: { carpintaria: 99 } } }, {})).toEqual([expect.stringContaining('acima do teto')]);
    expect(validateUnlocks({}, { villager: { tech: 'steam_mills' } })).toEqual([expect.stringContaining('era posterior')]);
    expect(validateUnlocks({}, { villager: { tech: 'alquimia' } })).toEqual([expect.stringContaining('pesquisa desconhecida')]);
    expect(validateUnlocks({ house: { building: 'mine' } }, {})).toEqual([expect.stringContaining('era posterior')]);
    expect(validateUnlocks({ house: { building: 'farm' }, farm: { building: 'house' } }, {}).some((e) => e.includes('Ciclo'))).toBe(true);
    expect(validateUnlocks({ house: { crafts: { alquimia: 2 } as never } }, {})).toEqual([expect.stringContaining('ofício desconhecido')]);
  });

  it('o host recusa construir e treinar o que está bloqueado, com recurso de sobra, e aceita depois do desbloqueio', () => {
    const mine = { type: 'build', buildingType: 'mine', owner: 'player1', position: { x: 12, z: 12 } };
    expect(isAuthorizedPlayerCommand(world(), mine, 'player1')).toBe(false);
    const bronze = world({ techs: { player1: { era: 'bronze', completed: [], queue: [] }, player2: createTechState() }, mastery: { player1: levels({ mineracao: 2 }) } });
    expect(isAuthorizedPlayerCommand(bronze, mine, 'player1')).toBe(true);

    const withBarracks = world({ buildings: [building('town_center'), building('barracks')] });
    const cavalry = { type: 'train', buildingId: 'barracks-player1', unitType: 'cavalry' };
    expect(isAuthorizedPlayerCommand(withBarracks, { ...cavalry, unitType: 'soldier' }, 'player1')).toBe(true);
    expect(isAuthorizedPlayerCommand(withBarracks, cavalry, 'player1')).toBe(false);
    const ferro = { ...withBarracks, techs: { player1: { era: 'ferro' as const, completed: [], queue: [] } }, mastery: { player1: levels({ guerra: 2 }) } };
    expect(isAuthorizedPlayerCommand(ferro, cavalry, 'player1')).toBe(true);
  });
});

describe('a IA segue as mesmas travas', () => {
  const ctx: SimulationContext = {
    playerSlot: 'player1', mode: 'single', activeSlots: ['player1', 'player2'], gatherRadiusLimit: 999, sustainableForestryEnabled: false,
    buildingDefinitions: {}, random: () => 0.5, createId: () => 'id',
  };

  it('com os ofícios do Bronze e recursos, avança de era pelo comando de pesquisa; sem eles, fica na Pedra', () => {
    const ready = world({ elapsed: 29.97, mastery: { player2: levels({ mineracao: 2, carpintaria: 2 }) } });
    const after = tickGameState(tickGameState(ready, ctx).state, ctx).state;
    expect(after.techs?.player2.queue.map((item) => item.id)).toContain('era:bronze');
    expect(after.playerResources.player2.wood).toBeLessThan(rich.wood);

    const behind = tickGameState(tickGameState(world({ elapsed: 29.97 }), ctx).state, ctx).state;
    expect(behind.techs?.player2.queue.some((item) => item.id.startsWith('era:'))).toBe(false);
  });

  it('no turno da cavalaria bloqueada, o quartel da IA treina mosqueteiro', () => {
    const soldiers = [0, 1].map((i) => ({
      id: `s${i}`, type: 'soldier' as const, owner: 'player2', position: { x: 80, z: 10 }, targetPosition: null, targetEntityId: null,
      health: 100, maxHealth: 100, attackDamage: 8, state: 'idle' as const,
    }));
    const villagers = [0, 1, 2, 3, 4, 5].map((i) => ({ ...soldiers[0], id: `v${i}`, type: 'villager' as const }));
    const state = world({
      units: [...soldiers, ...villagers],
      buildings: [building('town_center'), { ...building('town_center', 'player2'), trainingQueue: [{ unitType: 'villager', progress: 0 }] }, building('barracks', 'player2')],
    });
    const next = tickGameState(state, ctx).state;
    expect(next.buildings.find((b) => b.type === 'barracks')?.trainingQueue.map((item) => item.unitType)).toEqual(['soldier']);
  });

  it('todas as pesquisas exigidas existem', () => {
    const techs = [...Object.values(BUILDING_UNLOCKS), ...Object.values(UNIT_UNLOCKS)].map((unlock) => unlock?.tech).filter(Boolean);
    for (const id of techs) expect(TECH_DEFS.map((tech) => tech.id)).toContain(id);
    expect(MASTERY_IDS.length).toBeGreaterThan(0);
  });
});
