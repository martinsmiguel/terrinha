import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CRAFT_IDS, isCraftId } from '../../src/game/crafts';
import {
  STUDY_CAP, botStudyChoice, canStudy, canUseRecipe, creditXp, newMastery, normalizeMastery, studyCraft, xpToNext, type MasteryState,
} from '../../src/game/mastery';
import type { Building, GameState, ResourceNode, Unit } from '../../src/game/model';

type ResourceNodeType = ResourceNode['type'];
import { isAuthorizedPlayerCommand, isValidNetworkCommand } from '../../src/game/networkCommands';
import { planksFromWood, type RecipeDef } from '../../src/game/recipes';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';
import { canBuyTalent } from '../../src/game/talents';
import { createTechState } from '../../src/game/tech';

const rich = { wood: 5000, food: 5000, gold: 5000, stone: 5000, planks: 0, pop: 4, maxPop: 50 };
const capital = (owner: string, x: number): Building => ({ id: `tc-${owner}`, type: 'town_center', owner, position: { x, z: 5 }, health: 2400, maxHealth: 2400, isComplete: true, trainingQueue: [] });
const villager = (id: string, target: string, x = 10): Unit => ({
  id, type: 'villager', owner: 'player1', position: { x, z: 10 }, targetPosition: null, targetEntityId: target, health: 100, maxHealth: 100, attackDamage: 8, state: 'gathering', gatherRadiusLimit: 999,
});
const ctx = (mode: 'host' | 'single' = 'host'): SimulationContext => ({
  playerSlot: 'player1', mode, activeSlots: ['player1', 'player2'], gatherRadiusLimit: 999, sustainableForestryEnabled: false, buildingDefinitions: {}, random: () => 0.5, createId: () => 'id',
});
const world = (extra: Partial<GameState> = {}): GameState => ({
  units: [], buildings: [capital('player1', 5), capital('player2', 90)], resourceNodes: [], playerResources: { player1: { ...rich }, player2: { ...rich } },
  techs: { player1: createTechState(), player2: createTechState() }, ...extra,
});
const run = (state: GameState, ticks: number, mode: 'host' | 'single' = 'host') => { let s = state; for (let i = 0; i < ticks; i += 1) s = tickGameState(s, ctx(mode)).state; return s; };

describe('registro de ofícios', () => {
  it('cada ofício em seu arquivo, todos registrados, ids únicos', () => {
    const files = readdirSync(join(__dirname, '../../src/game/crafts')).filter((f) => f.endsWith('.ts') && !['index.ts', 'types.ts'].includes(f)).map((f) => f.replace('.ts', ''));
    expect(files.sort()).toEqual([...CRAFT_IDS].sort());
    expect(new Set(CRAFT_IDS).size).toBe(CRAFT_IDS.length);
    expect(CRAFT_IDS).toEqual(expect.arrayContaining(['carpintaria', 'cantaria', 'mineracao', 'agricultura', 'navegacao', 'comercio', 'guerra']));
  });
});

describe('aprender fazendo', () => {
  const gather = (type: ResourceNodeType, workers = 1, ticks = 100) => {
    const nodes = Array.from({ length: workers }, (_, i) => ({ id: `n${i}`, type, position: { x: 10.5 + i * 3, z: 10 }, remaining: 10000 }));
    const units = nodes.map((node, i) => villager(`v${i}`, node.id, 10 + i * 3));
    return run(world({ units, resourceNodes: nodes }), ticks).mastery!.player1;
  };

  it('cada recurso coletado treina o seu ofício', () => {
    expect(gather('tree').xp.carpintaria).toBeGreaterThan(0);
    expect(gather('stone').xp.cantaria).toBeGreaterThan(0);
    expect(gather('gold_mine').xp.mineracao).toBeGreaterThan(0);
    expect(gather('food_bush').xp.agricultura).toBeGreaterThan(0);
    expect(gather('tree').xp.cantaria).toBe(0);
  });

  it('mais trabalhadores no ofício aceleram o ganho', () => {
    const one = gather('tree', 1, 60).xp.carpintaria;
    const three = gather('tree', 3, 60).xp.carpintaria;
    expect(three).toBeGreaterThan(one * 2.5);
  });

  it('a produção por receita treina o ofício declarado na receita', () => {
    const sawmill: Building = { id: 's', type: 'sawmill', owner: 'player1', position: { x: 20, z: 20 }, health: 500, maxHealth: 500, isComplete: true, trainingQueue: [] };
    const state = run(world({ buildings: [capital('player1', 5), capital('player2', 90), sawmill] }), 50);
    expect(state.playerResources.player1.planks).toBeGreaterThan(0);
    expect(planksFromWood.craft).toBe('carpintaria');
    expect(state.mastery!.player1.xp.carpintaria).toBeGreaterThan(0);
  });
});

describe('estudo pago', () => {
  it('debita a metrópole e dá metade do XP do nível; duas sessões sobem o nível', () => {
    const start = world();
    const once = studyCraft(start, 'player1', 'carpintaria');
    expect(once.check).toMatchObject({ ok: true, xp: Math.ceil(xpToNext(1) / 2) });
    expect(once.state.playerResources.player1.wood).toBe(rich.wood - 60);
    const twice = studyCraft(once.state, 'player1', 'carpintaria');
    expect(twice.state.mastery!.player1.level.carpintaria).toBe(2);
    expect(twice.state.mastery!.player1.points).toBe(1);
  });

  it('o estudo para no teto da era; o trabalho pode passar dele', () => {
    const capped: MasteryState = { ...newMastery(), level: { ...newMastery().level, carpintaria: STUDY_CAP.colonial } };
    const state = world({ mastery: { player1: capped } });
    expect(canStudy(state, 'player1', 'carpintaria')).toMatchObject({ ok: false });
    const later = world({ mastery: { player1: capped }, techs: { player1: { ...createTechState(), era: 'commercial' }, player2: createTechState() } });
    expect(canStudy(later, 'player1', 'carpintaria').ok).toBe(true);
    let worked = capped;
    for (let i = 0; i < 40; i += 1) worked = creditXp(worked, { kind: 'extraction', amount: 1000, item: 'wood' });
    expect(worked.level.carpintaria).toBeGreaterThan(STUDY_CAP.colonial);
  });

  it('o custo cresce com o nível', () => {
    const lvl2: MasteryState = { ...newMastery(), level: { ...newMastery().level, cantaria: 2 } };
    const check = canStudy(world({ mastery: { player1: lvl2 } }), 'player1', 'cantaria');
    expect(check.ok && check.cost).toEqual({ stone: 80, gold: 40 });
  });

  it('CONTROLE NEGATIVO: ofício desconhecido, sem recurso e formato inválido são recusados no host, sem debitar', () => {
    const poor = world({ playerResources: { player1: { ...rich, wood: 0, gold: 0 }, player2: { ...rich } } });
    expect(canStudy(poor, 'player1', 'carpintaria')).toMatchObject({ ok: false });
    expect(studyCraft(poor, 'player1', 'carpintaria').state).toBe(poor);
    expect(canStudy(world(), 'player1', 'alquimia')).toMatchObject({ ok: false });
    expect(isValidNetworkCommand({ type: 'study_craft', craft: 'alquimia' })).toBe(false);
    expect(isValidNetworkCommand({ type: 'study_craft', craft: 'carpintaria', extra: 1 })).toBe(false);
    expect(isAuthorizedPlayerCommand(poor, { type: 'study_craft', craft: 'carpintaria' }, 'player1')).toBe(false);
    expect(isAuthorizedPlayerCommand(world(), { type: 'study_craft', craft: 'carpintaria' }, 'player1')).toBe(true);
  });
});

describe('receitas por nível de ofício', () => {
  it('a receita só vale com o ofício no nível exigido', () => {
    const advanced: RecipeDef = { ...planksFromWood, id: 'viga', requires: { era: 'colonial', craftLevel: 2 } };
    const table = { player1: newMastery() };
    expect(canUseRecipe(table, 'player1', planksFromWood)).toBe(true);
    expect(canUseRecipe(table, 'player1', advanced)).toBe(false);
    const up = { player1: { ...newMastery(), level: { ...newMastery().level, carpintaria: 2 } } };
    expect(canUseRecipe(up, 'player1', advanced)).toBe(true);
  });
});

describe('curva e IA', () => {
  it('a curva de XP cresce mais que linear', () => {
    for (let level = 1; level < 9; level += 1) {
      expect(xpToNext(level + 1) - xpToNext(level)).toBeGreaterThan(xpToNext(level) - (level > 1 ? xpToNext(level - 1) : 0));
    }
  });

  it('a IA escolhe o ofício de economia mais atrasado e guarda reserva', () => {
    const behind: MasteryState = { ...newMastery(), level: { ...newMastery().level, carpintaria: 2, agricultura: 2, mineracao: 2, cantaria: 1 } };
    expect(botStudyChoice(world({ mastery: { player2: behind } }), 'player2')).toBe('cantaria');
    const tight = world({ playerResources: { player1: { ...rich }, player2: { ...rich, wood: 70, food: 70, gold: 30, stone: 50 } } });
    expect(botStudyChoice(tight, 'player2')).toBeNull(); // pagaria, mas não sobraria a reserva
  });

  it('na simulação a IA estuda sozinha a cada intervalo, pagando da própria metrópole', () => {
    const before = world({ elapsed: 29.97 });
    const after = run(before, 2, 'single');
    expect(after.mastery?.player2).toBeDefined();
    const studied = Object.values(after.mastery!.player2.xp).some((xp) => xp > 0);
    expect(studied).toBe(true);
    expect(after.playerResources.player2.gold).toBeLessThan(rich.gold);
    expect(after.mastery?.player1).toBeUndefined(); // o jogador humano não estuda sozinho
  });
});

describe('migração das maestrias antigas', () => {
  it('cada ofício herda o nível da maestria de origem; pontos e talentos comprados continuam', () => {
    const legacy = {
      xp: { exploration: 5, seafaring: 7, extraction: 3, settlement: 1, combat: 2 },
      level: { exploration: 3, seafaring: 4, extraction: 2, settlement: 1, combat: 2 },
      points: 4, credited: { 'discovery:0,0': true as const },
    } as unknown as MasteryState;
    const migrated = normalizeMastery(legacy)!;
    expect(migrated.level).toMatchObject({ exploracao: 3, navegacao: 4, agricultura: 2, carpintaria: 2, cantaria: 2, mineracao: 2, colonizacao: 1, guerra: 2, comercio: 1 });
    expect(migrated.points).toBe(4);
    expect(migrated.credited).toEqual({ 'discovery:0,0': true });
    expect(Object.keys(migrated.level).every(isCraftId)).toBe(true);
    // 'brisa' exige Navegação 2: segue comprável com o estado antigo
    const state = world({ mastery: { player1: legacy }, talents: { player1: [] } });
    expect(canBuyTalent(state, 'player1', 'brisa').ok).toBe(true);
    expect(normalizeMastery(migrated)).toBe(migrated); // já migrado não muda
  });
});
