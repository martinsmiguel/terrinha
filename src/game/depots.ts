import type { Building, GameState } from './model';
import { refinePlanks, tradeResource, type MarketResourceType, type ResourceCost } from './economy';

/** Localidade da metrópole: o estoque dela é `playerResources` (pesquisa e capital usam este). */
export const HOME = 'home';

export interface StockBag { wood: number; food: number; gold: number; stone: number; planks: number }
/** Estoques das localidades coloniais: dono → ilha → saldo. A metrópole não aparece aqui. */
export type LocalStocks = Record<string, Record<string, StockBag>>;
/** Ilha onde uma posição está, do ponto de vista de um dono: `HOME` na natal, o id da ilha nas demais. */
export type LocalityResolver = (owner: string, position: { x: number; z: number }) => string;

const KEYS = ['wood', 'food', 'gold', 'stone', 'planks'] as const;
const emptyBag = (): StockBag => ({ wood: 0, food: 0, gold: 0, stone: 0, planks: 0 });
const bagOf = (source: Partial<StockBag>): StockBag => ({ ...emptyBag(), ...source });
const covers = (bag: StockBag, cost: ResourceCost): boolean => KEYS.every((key) => bag[key] >= (cost[key] ?? 0));
const sub = (bag: StockBag, cost: ResourceCost): StockBag => bagOf(Object.fromEntries(KEYS.map((key) => [key, bag[key] - (cost[key] ?? 0)])));
const add = (bag: StockBag, cost: ResourceCost): StockBag => bagOf(Object.fromEntries(KEYS.map((key) => [key, bag[key] + (cost[key] ?? 0)])));
const isEmptyCost = (cost: ResourceCost): boolean => KEYS.every((key) => (cost[key] ?? 0) === 0);

type Stocked = Pick<GameState, 'playerResources' | 'localStocks' | 'foundationKits'>;

/** Resolve a ilha de uma posição pelo centro e raio das ilhas; a natal do dono vira `HOME`. */
export function makeLocalityResolver(
  islands: readonly { index: number; center: { x: number; z: number }; baseRadius: number }[],
  homeIndexOf: (owner: string) => number
): LocalityResolver {
  return (owner, position) => {
    let best: { index: number; gap: number } | null = null;
    for (const island of islands) {
      const gap = Math.hypot(position.x - island.center.x, position.z - island.center.z) - island.baseRadius * 1.3;
      if (gap <= 0 && (!best || gap < best.gap)) best = { index: island.index, gap };
    }
    if (!best) return HOME;
    return best.index === homeIndexOf(owner) ? HOME : String(best.index);
  };
}

/** Postos do dono (vivos) numa localidade colonial. `complete` exige posto concluído. */
export function depotsIn(buildings: readonly Building[], owner: string, locality: string, resolve: LocalityResolver, complete: boolean): Building[] {
  return buildings.filter((building) =>
    building.type === 'outpost' && building.owner === owner && building.health > 0 && (!complete || building.isComplete)
    && resolve(owner, building.position) === locality);
}

export function stockAt(state: Stocked, owner: string, locality: string): StockBag {
  if (locality === HOME) return bagOf(state.playerResources[owner] ?? {});
  return state.localStocks?.[owner]?.[locality] ?? emptyBag();
}

function withStock<T extends Stocked>(state: T, owner: string, locality: string, bag: StockBag): T {
  if (locality === HOME) {
    const current = state.playerResources[owner];
    return { ...state, playerResources: { ...state.playerResources, [owner]: { ...current, ...bag } } };
  }
  return { ...state, localStocks: { ...state.localStocks, [owner]: { ...state.localStocks?.[owner], [locality]: bag } } };
}

/** Pagamento local: só o estoque da própria localidade paga; o agregado da metrópole não cobre ação colonial. */
export function canPayAt(state: Stocked, owner: string, locality: string, cost: ResourceCost): boolean {
  return covers(stockAt(state, owner, locality), cost);
}

/** Debita na localidade; devolve null (sem alterar nada) se o saldo local não cobre. */
export function debitAt<T extends Stocked>(state: T, owner: string, locality: string, cost: ResourceCost): T | null {
  const bag = stockAt(state, owner, locality);
  if (!covers(bag, cost)) return null;
  return withStock(state, owner, locality, sub(bag, cost));
}

/** Crédito de produção/coleta: numa colônia só vale com posto concluído (`activeDepot`). Sem ele, nada entra. */
export function creditAt<T extends Stocked>(state: T, owner: string, locality: string, amount: ResourceCost, activeDepot: boolean): T {
  if (isEmptyCost(amount) || (locality !== HOME && !activeDepot)) return state;
  return withStock(state, owner, locality, add(stockAt(state, owner, locality), amount));
}

/**
 * Devolve (cancelamento, reembolso) à origem exata do débito. Se a localidade perdeu o último posto,
 * nada é devolvido e a quantidade é informada em `lost`.
 */
export function refundAt<T extends Stocked>(state: T, owner: string, locality: string, amount: ResourceCost, hasDepot: boolean): { state: T; lost: ResourceCost } {
  if (locality !== HOME && !hasDepot) return { state, lost: amount };
  return { state: withStock(state, owner, locality, add(stockAt(state, owner, locality), amount)), lost: {} };
}

/** Move quantidade entre duas localidades, sem criar nem perder nada; recusa se a origem não cobre. */
export function transferBetween<T extends Stocked>(
  state: T, owner: string, from: string, to: string, amount: ResourceCost, toHasActiveDepot: boolean
): T | null {
  if (from === to) return state;
  if (to !== HOME && !toHasActiveDepot) return null;
  const debited = debitAt(state, owner, from, amount);
  if (!debited) return null;
  return creditAt(debited, owner, to, amount, toHasActiveDepot);
}

/**
 * Kit desembarcado vira depósito provisório: o suprimento reservado passa uma só vez para o estoque local da ilha
 * (que já tenha um posto, mesmo em obras). Repetir não clona; sem coleta nem produção até o posto concluir.
 */
export function landKit<T extends Stocked>(state: T, owner: string, locality: string, hasProvisionalDepot: boolean): T {
  const kit = state.foundationKits?.[owner];
  if (!kit || locality === HOME || !hasProvisionalDepot) return state;
  const rest = { ...state.foundationKits };
  delete rest[owner];
  return withStock({ ...state, foundationKits: rest }, owner, locality, add(stockAt(state, owner, locality), kit));
}

/** Perde o estoque de localidades coloniais que ficaram sem nenhum posto vivo. Devolve o que foi perdido. */
export function reconcileDepots<T extends Stocked & { buildings: readonly Building[] }>(
  state: T, resolve: LocalityResolver
): { state: T; lost: { owner: string; locality: string; stock: StockBag }[] } {
  const lost: { owner: string; locality: string; stock: StockBag }[] = [];
  let next = state;
  for (const [owner, byLocality] of Object.entries(state.localStocks ?? {})) {
    for (const [locality, stock] of Object.entries(byLocality)) {
      if (depotsIn(state.buildings, owner, locality, resolve, false).length > 0) continue;
      lost.push({ owner, locality, stock });
      const remaining = { ...next.localStocks?.[owner] };
      delete remaining[locality];
      next = { ...next, localStocks: { ...next.localStocks, [owner]: remaining } };
    }
  }
  return lost.length === 0 ? { state, lost } : { state: next, lost };
}

/** Produção local pausa quando a localidade colonial não tem posto concluído. */
export function productionPaused(buildings: readonly Building[], owner: string, locality: string, resolve: LocalityResolver): boolean {
  return locality !== HOME && depotsIn(buildings, owner, locality, resolve, true).length === 0;
}

/** Refino de tábuas e câmbio usam o estoque da própria localidade. */
export function refineAt<T extends Stocked>(state: T, owner: string, locality: string, sawmills: number): T {
  const bag = stockAt(state, owner, locality);
  const refined = refinePlanks({ ...bag, pop: 0, maxPop: 0 }, sawmills);
  if (refined === undefined) return state;
  return withStock(state, owner, locality, bagOf(refined));
}

export function tradeAt<T extends Stocked>(
  state: T, owner: string, locality: string, type: MarketResourceType, action: 'buy' | 'sell', amount: number
): { state: T; ok: boolean; reason?: string } {
  const bag = stockAt(state, owner, locality);
  const outcome = tradeResource({ ...bag, pop: 0, maxPop: 0 }, type, action, amount);
  if (!outcome.ok || !outcome.next) return { state, ok: false, reason: outcome.reason };
  return { state: withStock(state, owner, locality, bagOf(outcome.next)), ok: true };
}
