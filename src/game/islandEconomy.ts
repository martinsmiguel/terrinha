import { resourcePlanFor, type IslandKind, type IslandProfile, type IslandResourcePlan } from './archipelago';
import { BUILDING_CATALOG } from './buildingCatalog';
import { UNIT_COSTS, type ResourceCost } from './economy';
import { ERA_UPGRADES } from './tech';

/** Suprimento inicial de cada jogador (o kit de fundação fica à parte). */
export const STARTING_SUPPLY = { wood: 350, food: 350, gold: 200, stone: 100, planks: 0 } as const;

/** Capacidade de cada tipo de nó de recurso; o cardume renova até este valor sem crédito extra. */
export const NODE_CAPACITY = { tree: 160, gold_mine: 900, stone: 700, food_bush: 450, fish_school: 600 } as const;

/** Rendimento e fertilidade DECLARADOS de cada perfil: o visual da ilha não implica nenhum rendimento fora desta tabela. */
export interface IslandEconomyProfile {
  role: string;
  /** Multiplicador da produção das fazendas na ilha (1 = padrão). */
  fertility: number;
  description: string;
}

export const ISLAND_ECONOMY: Record<IslandProfile, IslandEconomyProfile> = {
  floresta: { role: 'madeireira e agrícola', fertility: 1.2, description: 'Planície verdejante: muita madeira e a maior fertilidade.' },
  ruintas: { role: 'balanceada', fertility: 1.0, description: 'Mistura de madeira, ouro e pedra com fertilidade padrão.' },
  arida: { role: 'aurífera', fertility: 0.6, description: 'Duas minas de ouro; solo seco, fazendas rendem menos.' },
  glacial: { role: 'pedreira', fertility: 0.5, description: 'Duas pedreiras; solo frio, fazendas rendem pouco.' },
  montanhosa: { role: 'mineradora', fertility: 0.25, description: 'Ouro e pedra em abundância; sem capacidade de cultivo fora da ilha natal.' },
};

/** Fertilidade mínima para erguer fazendas. Abaixo disso o solo é infértil. */
export const FARM_MIN_FERTILITY = 0.3;
/** Piso das ilhas natais: nenhuma natal fica sem cultivo, mesmo a vulcânica. */
export const NATIVE_FERTILITY_FLOOR = 0.4;

export function fertilityOf(profile: IslandProfile, kind: IslandKind): number {
  const declared = ISLAND_ECONOMY[profile].fertility;
  return kind === 'native' ? Math.max(declared, NATIVE_FERTILITY_FLOOR) : declared;
}

/** Papel econômico da fazenda: só em solo fértil. Vale no preview e no host. */
export function farmPlacementReason(fertility: number): string | null {
  return fertility >= FARM_MIN_FERTILITY ? null : 'Solo infértil: fazendas só rendem em ilhas com capacidade de cultivo.';
}

/** Escala dos recursos com o mundo: 1 em 60, crescendo com o lado até no máximo 4 (custo de nós e malhas). */
export function resourceScale(mapSize: number): number {
  return Math.min(4, Math.max(1, Math.round(mapSize / 60)));
}

/** Árvores mínimas de uma ilha natal; a madeira que falta para a jornada vem da capacidade por árvore. */
export const MIN_NATIVE_TREES = 6;
/** Capacidade máxima de uma árvore ao reforçar a madeira de uma ilha pequena (4x a padrão). */
export const MAX_TREE_CAPACITY = 640;

/**
 * Capacidade por árvore para que uma ilha natal com `trees` árvores some a madeira exigida pela jornada. O padrão
 * (160) vale quando o número de árvores já basta; ilhas pequenas ganham árvores mais ricas, não mais árvores.
 */
export function treeCapacityFor(trees: number, woodNeeded: number): number {
  if (trees <= 0) return NODE_CAPACITY.tree;
  return Math.min(MAX_TREE_CAPACITY, Math.max(NODE_CAPACITY.tree, Math.ceil(woodNeeded / trees)));
}

/**
 * Plano de recursos da ilha. Natal: o plano do perfil escalado com o mundo, com piso de madeira para sustentar a
 * jornada. Neutra: plano enxuto que dobra a especialidade do perfil (vantagem), sem nunca monopolizar um insumo básico,
 * pois as natais sempre têm os cinco.
 */
export function economyPlanFor(profile: IslandProfile, mapSize: number, kind: IslandKind): IslandResourcePlan {
  const base = resourcePlanFor(profile);
  const scale = resourceScale(mapSize);
  const up = (count: number) => (count > 0 ? Math.max(1, Math.ceil(count * scale)) : 0);

  if (kind === 'native') {
    const plan = { ...base, treeClusters: up(base.treeClusters), gold: up(base.gold), stone: up(base.stone), bush: up(base.bush), fish: up(base.fish) };
    const treesNeeded = MIN_NATIVE_TREES;
    while (plan.treeClusters * plan.treesPerCluster < treesNeeded) plan.treeClusters += 1;
    return plan;
  }

  const specialty = Math.max(base.gold, base.stone) >= base.treeClusters ? (base.gold >= base.stone ? 'gold' : 'stone') : 'trees';
  return {
    treeClusters: specialty === 'trees' ? up(base.treeClusters) : 1,
    treesPerCluster: base.treesPerCluster,
    gold: specialty === 'gold' ? up(base.gold * 2) : Math.min(1, base.gold),
    stone: specialty === 'stone' ? up(base.stone * 2) : Math.min(1, base.stone),
    bush: Math.min(1, base.bush),
    fish: up(base.fish),
  };
}

export type BasicInput = 'wood' | 'food' | 'gold' | 'stone';

/** Soma dos recursos básicos de um conjunto de nós (capacidade restante). */
export function economyTotals(nodes: readonly { type: string; remaining: number }[]): Record<BasicInput, number> {
  const sum = (types: string[]) => nodes.filter((node) => types.includes(node.type)).reduce((total, node) => total + node.remaining, 0);
  return { wood: sum(['tree']), food: sum(['food_bush', 'fish_school']), gold: sum(['gold_mine']), stone: sum(['stone']) };
}

/** Edifícios e unidades mínimos da cadeia: refino (serralheria), mineração, fazenda, câmbio (mercado) e pesca (cais e barco). */
export const CORE_BUILDINGS = ['house', 'house', 'house', 'barracks', 'sawmill', 'mine', 'market', 'farm', 'dock'] as const;

const add = (total: Required<ResourceCost>, cost: ResourceCost) => {
  for (const key of ['wood', 'food', 'gold', 'stone', 'planks'] as const) total[key] += cost[key] ?? 0;
};

/** O que a jornada natal gasta: três eras, a cadeia mínima de produção, 2 barcos de pesca e 8 aldeões. */
export function journeyCost(): Required<ResourceCost> {
  const total: Required<ResourceCost> = { wood: 0, food: 0, gold: 0, stone: 0, planks: 0 };
  for (const era of ERA_UPGRADES) add(total, era.cost);
  for (const type of CORE_BUILDINGS) add(total, BUILDING_CATALOG[type].cost);
  add(total, { wood: UNIT_COSTS.fishing_boat.wood, planks: UNIT_COSTS.fishing_boat.planks });
  for (let i = 0; i < 8; i += 1) add(total, UNIT_COSTS.villager);
  // Tábuas vêm da refinaria: 2 madeiras por tábua.
  total.wood += (total.planks ?? 0) * 2;
  return total;
}

/** Quanto a ilha natal precisa fornecer: o custo da jornada menos o suprimento inicial, com 25% de margem. */
export function journeyNeeds(): Record<BasicInput, number> {
  const cost = journeyCost();
  const net = (needed: number, start: number) => Math.max(0, needed - start);
  return {
    wood: Math.ceil(net(cost.wood, STARTING_SUPPLY.wood) * 1.25),
    food: Math.ceil(net(cost.food, STARTING_SUPPLY.food) * 1.25),
    gold: Math.ceil(net(cost.gold, STARTING_SUPPLY.gold) * 1.25),
    // Pedra não entra na cadeia mínima; exige-se o bastante para torres e câmbio.
    stone: 300,
  };
}

export interface EconomyVerdict {
  needs: Record<BasicInput, number>;
  totals: Record<BasicInput, number>;
  missing: BasicInput[];
  viable: boolean;
}

/** A ilha natal sustenta a jornada com os próprios recursos (sem frete)? */
export function evaluateNativeEconomy(nodes: readonly { type: string; remaining: number }[]): EconomyVerdict {
  const needs = journeyNeeds();
  const totals = economyTotals(nodes);
  const missing = (Object.keys(needs) as BasicInput[]).filter((input) => totals[input] < needs[input]);
  return { needs, totals, missing, viable: missing.length === 0 };
}
