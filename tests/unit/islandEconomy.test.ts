import { describe, expect, it } from 'vitest';
import { computeArchipelago, resourcePlanFor, type IslandProfile } from '../../src/game/archipelago';
import { BUILDING_CATALOG } from '../../src/game/buildingCatalog';
import { checkBuildingPlacementValid } from '../../src/game/buildingGhost';
import { ERA_UPGRADES } from '../../src/game/tech';
import {
  CORE_BUILDINGS, FARM_MIN_FERTILITY, ISLAND_ECONOMY, MAX_TREE_CAPACITY, MIN_NATIVE_TREES, NATIVE_FERTILITY_FLOOR, NODE_CAPACITY,
  economyPlanFor, economyTotals, evaluateNativeEconomy, farmPlacementReason, fertilityOf, journeyCost, journeyNeeds, resourceScale,
  treeCapacityFor,
} from '../../src/game/islandEconomy';
import { generateProceduralTerrain } from '../../src/game/proceduralMap';

const PROFILES: IslandProfile[] = ['floresta', 'arida', 'glacial', 'montanhosa', 'ruintas'];
// Sementes espalhadas: o gerador congruencial é fraco para sementes muito pequenas.
const SEEDS = [10007, 52723, 91570, 31337, 70001, 24680];

describe('o que a jornada natal exige', () => {
  it('sai dos dados do jogo: três eras, cadeia mínima de produção, barco de pesca e aldeões', () => {
    const cost = journeyCost();
    const eras = ERA_UPGRADES.reduce((total, era) => total + (era.cost.wood ?? 0), 0);
    const buildings = CORE_BUILDINGS.reduce((total, type) => total + BUILDING_CATALOG[type].cost.wood, 0);
    expect(cost.wood).toBe(eras + buildings + 75 + 25 * 2); // barco de pesca + madeira das 25 tábuas
    expect(cost.gold).toBe(ERA_UPGRADES.reduce((total, era) => total + (era.cost.gold ?? 0), 0) + 30 + 25 + 50);
    expect(cost.food).toBe(8 * 50);
  });

  it('desconta o suprimento inicial e acrescenta 25% de margem', () => {
    expect(journeyNeeds()).toEqual({ wood: 1850, food: 63, gold: 819, stone: 300 });
  });
});

describe('rendimento e fertilidade declarados', () => {
  it('todo perfil tem papel e fertilidade declarados; o visual não define rendimento fora da tabela', () => {
    for (const profile of PROFILES) {
      expect(ISLAND_ECONOMY[profile].role.length).toBeGreaterThan(0);
      expect(ISLAND_ECONOMY[profile].fertility).toBeGreaterThanOrEqual(0);
    }
    expect(ISLAND_ECONOMY.floresta.fertility).toBeGreaterThan(ISLAND_ECONOMY.arida.fertility);
    expect(ISLAND_ECONOMY.montanhosa.fertility).toBeLessThan(FARM_MIN_FERTILITY);
  });

  it('a ilha natal nunca fica sem cultivo (piso), mas a neutra vulcânica fica', () => {
    for (const profile of PROFILES) {
      expect(fertilityOf(profile, 'native')).toBeGreaterThanOrEqual(NATIVE_FERTILITY_FLOOR);
      expect(farmPlacementReason(fertilityOf(profile, 'native'))).toBeNull();
    }
    expect(farmPlacementReason(fertilityOf('montanhosa', 'neutral'))).toMatch(/infértil/);
    expect(farmPlacementReason(fertilityOf('floresta', 'neutral'))).toBeNull();
  });

  it('o preview e o host usam a mesma regra: fazenda recusada em solo infértil, aceita em solo fértil', () => {
    const barren = () => 0.1;
    const rich = () => 1.2;
    const check = (fertility?: () => number) =>
      checkBuildingPlacementValid('farm', 30, 30, [], [], 60, () => false, () => false, () => 0, () => false, fertility);
    expect(check(barren)).toMatchObject({ isValid: false, reason: expect.stringMatching(/infértil/) });
    expect(check(rich).isValid).toBe(true);
    expect(check().isValid).toBe(true); // sem informação de solo nada é bloqueado
    const house = checkBuildingPlacementValid('house', 30, 30, [], [], 60, () => false, () => false, () => 0, () => false, barren);
    expect(house.isValid).toBe(true); // só a fazenda tem o papel de cultivo
  });
});

describe('plano de recursos por ilha', () => {
  it('a escala cresce com o mundo e para em 4', () => {
    expect([60, 120, 192, 384, 768].map(resourceScale)).toEqual([1, 2, 3, 4, 4]);
  });

  it('toda natal planeja pelo menos 6 árvores, ouro, pedra, pomar e cardume, em qualquer perfil e tamanho', () => {
    for (const size of [60, 192, 768]) {
      for (const profile of PROFILES) {
        const plan = economyPlanFor(profile, size, 'native');
        expect(plan.treeClusters * plan.treesPerCluster).toBeGreaterThanOrEqual(MIN_NATIVE_TREES);
        expect(plan.gold).toBeGreaterThanOrEqual(1);
        expect(plan.stone).toBeGreaterThanOrEqual(1);
        expect(plan.bush).toBeGreaterThanOrEqual(1);
        expect(plan.fish).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('a neutra dobra a especialidade do perfil sem monopolizar insumo básico: as natais sempre têm os quatro', () => {
    for (const profile of PROFILES) {
      const base = resourcePlanFor(profile);
      const neutral = economyPlanFor(profile, 60, 'neutral');
      const specialty = Math.max(neutral.gold, neutral.stone, neutral.treeClusters);
      expect(specialty).toBeGreaterThanOrEqual(Math.max(base.gold, base.stone, 1));
      const native = economyPlanFor(profile, 60, 'native');
      expect(native.gold > 0 && native.stone > 0 && native.treeClusters > 0 && native.bush + native.fish > 0).toBe(true);
    }
  });

  it('árvores de ilhas pequenas ganham capacidade, nunca acima de 4x; árvores suficientes mantêm 160', () => {
    expect(treeCapacityFor(24, 1850)).toBe(NODE_CAPACITY.tree);
    expect(treeCapacityFor(6, 1850)).toBeGreaterThan(NODE_CAPACITY.tree);
    expect(treeCapacityFor(6, 1850) * 6).toBeGreaterThanOrEqual(1850);
    expect(treeCapacityFor(1, 99999)).toBe(MAX_TREE_CAPACITY);
    expect(treeCapacityFor(0, 1850)).toBe(NODE_CAPACITY.tree);
  });
});

describe('veredito econômico: controles negativos', () => {
  const node = (type: string, remaining: number) => ({ type, remaining });
  const enough = [node('tree', 1900), node('gold_mine', 900), node('stone', 700), node('food_bush', 450), node('fish_school', 600)];

  it('uma ilha com tudo passa', () => {
    expect(evaluateNativeEconomy(enough)).toMatchObject({ viable: true, missing: [] });
  });

  it('falta de cada insumo reprova e nomeia o que falta', () => {
    for (const [type, input] of [['tree', 'wood'], ['gold_mine', 'gold'], ['stone', 'stone']] as const) {
      const verdict = evaluateNativeEconomy(enough.filter((entry) => entry.type !== type));
      expect(verdict.viable).toBe(false);
      expect(verdict.missing).toContain(input);
    }
    expect(evaluateNativeEconomy([node('tree', 1000), ...enough.slice(1)]).missing).toEqual(['wood']);
    expect(economyTotals(enough)).toEqual({ wood: 1900, food: 1050, gold: 900, stone: 700 });
  });
});

describe('economia das ilhas em mapas reais (tabela por perfil e semente)', () => {
  for (const size of [60, 192]) {
    it(`mundo ${size}: toda natal sustenta a jornada com os próprios recursos, e a especialização aparece`, () => {
      const wood: Record<string, number[]> = {};
      const gold: Record<string, number[]> = {};
      for (const seed of SEEDS) {
        const map = generateProceduralTerrain(size, seed);
        expect(map.viable, `semente ${seed} -> ${map.seed}: ${map.viabilityReasons.join('; ')}`).toBe(true);
        map.islands.filter((island) => island.kind === 'native').forEach((island, index) => {
          const verdict = map.economy[index];
          expect(verdict.viable, `semente ${map.seed} natal ${index} (${island.profile}): falta ${verdict.missing}`).toBe(true);
          (wood[island.profile] ??= []).push(verdict.totals.wood);
          (gold[island.profile] ??= []).push(verdict.totals.gold);
        });
      }
      const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
      expect(mean(wood.floresta)).toBeGreaterThan(Math.max(...Object.entries(wood).filter(([p]) => p !== 'floresta').map(([, v]) => mean(v))));
      const goldProfiles = Object.entries(gold).filter(([p]) => p !== 'floresta' && p !== 'glacial');
      for (const [, values] of goldProfiles) expect(mean(values)).toBeGreaterThanOrEqual(mean(gold.floresta));
    });
  }

  it('o rendimento observado é o declarado: os totais saem do plano do perfil, sem modificador oculto', () => {
    const map = generateProceduralTerrain(60, 52723);
    map.islands.filter((island) => island.kind === 'native').forEach((island) => {
      const plan = economyPlanFor(island.profile, 60, 'native');
      const own = map.resourceNodes.filter((node) => new RegExp(`-${island.index}-`).test(node.id));
      const count = (type: string) => own.filter((node) => node.type === type).length;
      expect(count('gold_mine')).toBeLessThanOrEqual(plan.gold);
      expect(count('stone')).toBeLessThanOrEqual(plan.stone);
      expect(own.filter((node) => node.type === 'gold_mine').every((node) => node.remaining === NODE_CAPACITY.gold_mine)).toBe(true);
      expect(own.filter((node) => node.type === 'fish_school').every((node) => node.remaining === NODE_CAPACITY.fish_school)).toBe(true);
    });
  });

  it('as neutras são pequenas e ricas na especialidade, sem tirar insumo das natais', () => {
    const map = generateProceduralTerrain(192, 52723);
    for (const index of [4, 5]) {
      const own = map.resourceNodes.filter((node) => new RegExp(`-${index}-`).test(node.id));
      expect(own.length, `neutra ${index} sem recursos`).toBeGreaterThan(0);
      expect(own.some((node) => node.type === 'fish_school')).toBe(true);
    }
    expect(map.economy.every((verdict) => verdict.viable)).toBe(true);
  });

  it('a fertilidade vem do perfil da ilha onde a fazenda está e é 0 no oceano', () => {
    const map = generateProceduralTerrain(60, 52723);
    const native = map.islands[0];
    expect(map.fertilityAt(native.center.x, native.center.z)).toBeCloseTo(fertilityOf(native.profile, 'native'));
    expect(map.fertilityAt(1, 1)).toBe(0);
    for (const island of computeArchipelago(60, map.seed).islands) {
      expect(map.fertilityAt(island.center.x, island.center.z)).toBeCloseTo(fertilityOf(island.profile, island.kind));
    }
  });
});
