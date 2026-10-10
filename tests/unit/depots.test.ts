import { describe, expect, it } from 'vitest';
import { applyBuildingFoundation } from '../../src/game/buildingOrders';
import {
  HOME, canPayAt, creditAt, debitAt, depotsIn, landKit, productionPaused, reconcileDepots, refineAt, refundAt, stockAt, tradeAt,
  transferBetween, type LocalityResolver,
} from '../../src/game/depots';
import type { Building, GameState } from '../../src/game/model';
import { isAuthorizedPlayerCommand, payerLocality } from '../../src/game/networkCommands';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';
import { updateOwnerVision } from '../../src/game/visionAuthority';

/** x < 100 é a natal; o resto é a ilha colonial "1". */
const localityOf: LocalityResolver = (_owner, position) => (position.x < 100 ? HOME : '1');
const rich = { wood: 1000, food: 1000, gold: 1000, stone: 1000, planks: 1000, pop: 1, maxPop: 10 };
const poorHome = { wood: 10, food: 10, gold: 10, stone: 10, planks: 0, pop: 1, maxPop: 10 };
const outpost = (overrides: Partial<Building> = {}): Building => ({
  id: 'o1', type: 'outpost', owner: 'player1', position: { x: 150, z: 50 }, health: 900, maxHealth: 900, isComplete: true, trainingQueue: [], ...overrides,
});
const base = (overrides: Partial<GameState> = {}): GameState => ({
  units: [], buildings: [outpost()], resourceNodes: [], mapSize: 192,
  playerResources: { player1: rich, player2: poorHome }, ...overrides,
});
const withLocal = (state: GameState, wood = 200): GameState =>
  ({ ...state, localStocks: { player1: { '1': { wood, food: 0, gold: 0, stone: 100, planks: 0 } } } });

describe('estoque por dono e ilha', () => {
  it('ação local só é paga pelo estoque local; o agregado da metrópole não cobre', () => {
    const state = base();
    expect(canPayAt(state, 'player1', '1', { wood: 10 })).toBe(false);
    expect(debitAt(state, 'player1', '1', { wood: 10 })).toBeNull();
    const funded = withLocal(state);
    expect(canPayAt(funded, 'player1', '1', { wood: 150 })).toBe(true);
    const paid = debitAt(funded, 'player1', '1', { wood: 150 })!;
    expect(stockAt(paid, 'player1', '1').wood).toBe(50);
    expect(paid.playerResources.player1.wood).toBe(1000); // metrópole intacta
  });

  it('estoques de donos diferentes na mesma ilha são independentes', () => {
    const state = withLocal(base());
    expect(stockAt(state, 'player2', '1').wood).toBe(0);
  });
});

describe('depósito provisório e produção', () => {
  it('kit desembarcado passa uma vez para o estoque local e não é clonado ao repetir', () => {
    const state = base({ buildings: [outpost({ isComplete: false, health: 90 })], foundationKits: { player1: { wood: 400, stone: 200 } } });
    const once = landKit(state, 'player1', '1', true);
    expect(stockAt(once, 'player1', '1')).toMatchObject({ wood: 400, stone: 200 });
    expect(once.foundationKits?.player1).toBeUndefined();
    expect(landKit(once, 'player1', '1', true)).toBe(once);
    expect(stockAt(landKit(once, 'player1', '1', true), 'player1', '1').wood).toBe(400);
  });

  it('sem posto na ilha o kit não desembarca', () => {
    const state = base({ foundationKits: { player1: { wood: 400, stone: 200 } } });
    expect(landKit(state, 'player1', '1', false)).toBe(state);
  });

  it('sem posto concluído não há coleta nem produção; com ele, sim', () => {
    const provisional = base({ buildings: [outpost({ isComplete: false })] });
    expect(productionPaused(provisional.buildings, 'player1', '1', localityOf)).toBe(true);
    expect(creditAt(provisional, 'player1', '1', { wood: 20 }, false)).toBe(provisional);
    const complete = base();
    expect(productionPaused(complete.buildings, 'player1', '1', localityOf)).toBe(false);
    expect(stockAt(creditAt(complete, 'player1', '1', { wood: 20 }, true), 'player1', '1').wood).toBe(20);
  });
});

describe('conservação de quantidade e origem', () => {
  it('transferência entre localidades não cria nem perde nada e recusa saldo insuficiente', () => {
    const state = base();
    const moved = transferBetween(state, 'player1', HOME, '1', { wood: 300 }, true)!;
    expect(stockAt(moved, 'player1', HOME).wood + stockAt(moved, 'player1', '1').wood).toBe(1000);
    expect(transferBetween(state, 'player1', '1', HOME, { wood: 1 }, true)).toBeNull();
    expect(transferBetween(state, 'player1', HOME, '1', { wood: 300 }, false)).toBeNull();
  });

  it('cancelamento devolve à origem exata; sem posto na origem, a devolução se perde sem duplicar', () => {
    const funded = withLocal(base());
    const paid = debitAt(funded, 'player1', '1', { wood: 100 })!;
    const back = refundAt(paid, 'player1', '1', { wood: 100 }, true);
    expect(stockAt(back.state, 'player1', '1').wood).toBe(200);
    expect(back.state.playerResources.player1.wood).toBe(1000);
    const lost = refundAt(paid, 'player1', '1', { wood: 100 }, false);
    expect(lost.lost).toEqual({ wood: 100 });
    expect(lost.state).toBe(paid);
  });

  it('vários depósitos preservam o saldo; só o último destruído perde o estoque local, uma única vez', () => {
    const two = withLocal(base({ buildings: [outpost({ id: 'a' }), outpost({ id: 'b', position: { x: 180, z: 50 } })] }));
    const oneDown = { ...two, buildings: [outpost({ id: 'a', health: 0 }), two.buildings[1]] };
    expect(reconcileDepots(oneDown, localityOf).lost).toHaveLength(0);
    expect(stockAt(oneDown, 'player1', '1').wood).toBe(200);
    const allDown = { ...two, buildings: two.buildings.map((building) => ({ ...building, health: 0 })) };
    const first = reconcileDepots(allDown, localityOf);
    expect(first.lost).toEqual([{ owner: 'player1', locality: '1', stock: expect.objectContaining({ wood: 200 }) }]);
    expect(stockAt(first.state, 'player1', '1').wood).toBe(0);
    expect(reconcileDepots(first.state, localityOf).lost).toHaveLength(0);
    expect(depotsIn(allDown.buildings, 'player1', '1', localityOf, false)).toHaveLength(0);
  });
});

describe('refino e câmbio locais', () => {
  it('refinam e negociam com o estoque da própria localidade', () => {
    const state = withLocal(base(), 200);
    const refined = refineAt(state, 'player1', '1', 1);
    expect(stockAt(refined, 'player1', '1').planks).toBeGreaterThan(0);
    expect(refined.playerResources.player1.planks).toBe(1000);
    const sold = tradeAt(state, 'player1', '1', 'wood', 'sell', 100);
    expect(sold.ok).toBe(true);
    expect(stockAt(sold.state, 'player1', '1').gold).toBeGreaterThan(0);
    expect(tradeAt(state, 'player1', '1', 'wood', 'sell', 500).ok).toBe(false);
  });
});

describe('integração: obras, treino e tick', () => {
  const foundation = (position: { x: number; z: number }): Building => ({
    id: 'new', type: 'house', owner: 'player1', position, health: 45, maxHealth: 450, isComplete: false, buildProgress: 0, trainingQueue: [],
  });

  it('obra na colônia debita o estoque local; sem saldo local não constrói mesmo com a metrópole rica', () => {
    const funded = withLocal(base());
    const built = applyBuildingFoundation(funded, foundation({ x: 150, z: 60 }), { wood: 60 }, [], () => true, '1');
    expect(built.buildings).toHaveLength(2);
    expect(stockAt(built, 'player1', '1').wood).toBe(140);
    expect(built.playerResources.player1.wood).toBe(1000);
    const empty = applyBuildingFoundation(base(), foundation({ x: 150, z: 60 }), { wood: 60 }, [], () => true, '1');
    expect(empty.buildings).toHaveLength(1);
  });

  it('o primeiro posto de uma ilha sem depósito é pago pela metrópole; os seguintes, pelo local', () => {
    const none = base({ buildings: [] });
    expect(payerLocality(none, 'player1', 'outpost', { x: 150, z: 50 }, localityOf)).toBe(HOME);
    expect(payerLocality(base(), 'player1', 'outpost', { x: 190, z: 50 }, localityOf)).toBe('1');
    expect(payerLocality(base(), 'player1', 'house', { x: 20, z: 20 }, localityOf)).toBe(HOME);
  });

  it('autorização recusa treinar na colônia sem saldo local e aceita com saldo', () => {
    const dock: Building = { id: 'b', type: 'barracks', owner: 'player1', position: { x: 150, z: 55 }, health: 800, maxHealth: 800, isComplete: true, trainingQueue: [] };
    const state = base({ buildings: [outpost(), dock] });
    const vision = updateOwnerVision(undefined, state, ['player1', 'player2'], 192);
    const terrain = { canStandAt: () => true, localityOf };
    const order = { type: 'train', buildingId: 'b', unitType: 'soldier' };
    expect(isAuthorizedPlayerCommand(state, order, 'player1', vision, terrain)).toBe(false);
    const funded: GameState = { ...state, localStocks: { player1: { '1': { wood: 0, food: 200, gold: 200, stone: 0, planks: 0 } } } };
    expect(isAuthorizedPlayerCommand(funded, order, 'player1', vision, terrain)).toBe(true);
  });

  it('o tick perde o estoque local quando o último posto cai, uma vez só', () => {
    const state = withLocal(base({ buildings: [outpost({ health: 0 })] }));
    const ctx: SimulationContext = {
      playerSlot: 'player1', mode: 'host', activeSlots: ['player1'], gatherRadiusLimit: 14, sustainableForestryEnabled: false,
      buildingDefinitions: {}, random: () => 0.9, createId: () => 'id',
      map: { isWaterAt: () => false, isImpassableAt: () => false, isOceanAt: () => false, localityOf },
    };
    const first = tickGameState(state, ctx);
    expect(first.state.localStocks?.player1?.['1']).toBeUndefined();
    expect(first.effects.filter((effect) => effect.type === 'notification')).toHaveLength(1);
    expect(tickGameState(first.state, ctx).effects.filter((effect) => effect.type === 'notification')).toHaveLength(0);
  });

  it('serralheria colonial refina o estoque da ilha e não toca a metrópole; sem posto concluído, não refina', () => {
    const sawmill: Building = { id: 's', type: 'sawmill', owner: 'player1', position: { x: 150, z: 70 }, health: 550, maxHealth: 550, isComplete: true, trainingQueue: [] };
    const ctx: SimulationContext = {
      playerSlot: 'player1', mode: 'host', activeSlots: ['player1'], gatherRadiusLimit: 14, sustainableForestryEnabled: false,
      buildingDefinitions: {}, random: () => 0.9, createId: () => 'id',
      map: { isWaterAt: () => false, isImpassableAt: () => false, isOceanAt: () => false, localityOf },
    };
    const state = withLocal(base({ buildings: [outpost(), sawmill] }), 200);
    const after = tickGameState(state, ctx).state;
    expect(after.localStocks!.player1['1'].planks).toBeGreaterThan(0);
    expect(after.localStocks!.player1['1'].wood).toBeLessThan(200);
    expect(after.playerResources.player1.planks).toBe(1000);
    const paused = tickGameState(withLocal(base({ buildings: [outpost({ isComplete: false }), sawmill] }), 200), ctx).state;
    expect(paused.localStocks!.player1['1'].planks).toBe(0);
  });
});
