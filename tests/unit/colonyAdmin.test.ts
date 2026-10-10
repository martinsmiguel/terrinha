import { describe, expect, it } from 'vitest';
import { HOME, localityOverview, stockAt, tradeAt, type LocalityResolver } from '../../src/game/depots';
import type { Building, GameState } from '../../src/game/model';
import { isAuthorizedPlayerCommand } from '../../src/game/networkCommands';
import { resolveNavigationTarget } from '../../src/game/worldMap';

/** Ilha 0 é a natal (x < 100); ilha 1 é uma colônia; ilha 2 não tem posto. */
const localityOf: LocalityResolver = (_owner, position) => (position.x < 100 ? HOME : position.x < 200 ? '1' : '2');
const islands = [
  { index: 0, name: 'Natal', center: { x: 50, z: 50 } },
  { index: 1, name: 'Colônia Norte', center: { x: 150, z: 50 } },
  { index: 2, name: 'Ilha Vazia', center: { x: 250, z: 50 } },
  { index: 3, name: 'Ilha Oculta', center: { x: 350, z: 50 } },
];
const post = (overrides: Partial<Building> = {}): Building => ({
  id: 'post', type: 'outpost', owner: 'player1', position: { x: 150, z: 60 }, health: 900, maxHealth: 900, isComplete: true, trainingQueue: [], ...overrides,
});
const market = (overrides: Partial<Building> = {}): Building => ({
  id: 'mk', type: 'market', owner: 'player1', position: { x: 152, z: 55 }, health: 750, maxHealth: 750, isComplete: true, trainingQueue: [], ...overrides,
});
const rich = { wood: 500, food: 400, gold: 300, stone: 200, planks: 100, pop: 3, maxPop: 20 };
const base = (overrides: Partial<GameState> = {}): GameState => ({
  units: [], buildings: [post(), market()], resourceNodes: [], mapSize: 400,
  playerResources: { player1: rich, player2: rich },
  localStocks: { player1: { '1': { wood: 40, food: 30, gold: 20, stone: 10, planks: 5 } } },
  ...overrides,
});
const known = (island: { index: number }) => island.index !== 3;
const overview = (state: GameState) => localityOverview(state, 'player1', islands, localityOf, known);

describe('visão de metrópole, colônias e regiões', () => {
  it('lista metrópole, colônia com posto e região conhecida sem posto; oculta ilha desconhecida', () => {
    const { rows } = overview(base());
    expect(rows.map((row) => [row.island.name, row.kind])).toEqual([['Natal', 'metropole'], ['Colônia Norte', 'colonia'], ['Ilha Vazia', 'regiao']]);
    expect(rows[2].stock).toBeNull();
    expect(rows[2].reason).toMatch(/Sem posto/);
  });

  it('saldo aplicável e total do império são distintos, sem duplicar estoque por região', () => {
    const { rows, total } = overview(base());
    expect(rows[0].stock!.wood).toBe(500); // metrópole
    expect(rows[1].stock!.wood).toBe(40); // só o saldo da colônia
    expect(total.wood).toBe(540); // 500 + 40, cada estoque uma vez
    expect(total.stone).toBe(210);
    // uma segunda ilha sem posto nem estoque não altera o total
    expect(overview(base({ buildings: [post(), market()] })).total).toEqual(total);
  });

  it('posto, depósitos, posse e produção bloqueada com o motivo', () => {
    const building = overview(base({ buildings: [post({ isComplete: false, health: 90 }), market()] })).rows[1];
    expect(building).toMatchObject({ completeDepots: 0, productionBlocked: true });
    expect(building.outposts).toHaveLength(1);
    expect(building.reason).toMatch(/Posto em obras/);
    const ok = overview(base()).rows[1];
    expect(ok).toMatchObject({ completeDepots: 1, productionBlocked: false });
    expect(ok.reason).toBeUndefined();
  });

  it('postos de outro dono não aparecem na administração do jogador', () => {
    const rows = overview(base({ buildings: [post({ owner: 'player2' }), market()] })).rows;
    expect(rows.find((row) => row.kind === 'colonia')).toBeUndefined();
  });

  it('foco vai ao posto concluído, ou ao centro da ilha sem posto, sem mudar o estado', () => {
    const state = base();
    const before = JSON.stringify(state);
    const { rows } = overview(state);
    expect(rows[1].focus).toEqual({ x: 150, z: 60 });
    expect(rows[2].focus).toEqual({ x: 250, z: 50 });
    expect(JSON.stringify(state)).toBe(before);
    // a regra única de descoberta continua mandando: ponto não explorado é recusado
    const query = { mapSize: 400, visibility: new Uint8Array(400 * 400) };
    expect(resolveNavigationTarget({ kind: 'point', x: 150, z: 60 }, query).ok).toBe(false);
  });
});

describe('câmbio local pelo mercado da colônia', () => {
  const terrain = { canStandAt: () => true, localityOf };
  const sell = { type: 'trade', resource: 'wood', action: 'sell', amount: 30, marketId: 'mk' };

  it('usa o saldo da ilha do mercado e não toca a metrópole', () => {
    const result = tradeAt(base(), 'player1', '1', 'wood', 'sell', 30);
    expect(result.ok).toBe(true);
    expect(stockAt(result.state, 'player1', '1').wood).toBe(10);
    expect(stockAt(result.state, 'player1', '1').gold).toBeGreaterThan(20);
    expect(result.state.playerResources.player1).toEqual(rich);
  });

  it('o host autoriza só mercado próprio, concluído e com saldo local', () => {
    const state = base();
    expect(isAuthorizedPlayerCommand(state, sell, 'player1', undefined, terrain)).toBe(true);
    expect(isAuthorizedPlayerCommand(state, sell, 'player2', undefined, terrain)).toBe(false);
    expect(isAuthorizedPlayerCommand(state, { ...sell, amount: 400 }, 'player1', undefined, terrain)).toBe(false); // metrópole rica, colônia não
    expect(isAuthorizedPlayerCommand(base({ buildings: [post(), market({ isComplete: false })] }), sell, 'player1', undefined, terrain)).toBe(false);
    expect(isAuthorizedPlayerCommand(state, { ...sell, marketId: 'nao-existe' }, 'player1', undefined, terrain)).toBe(false);
    expect(isAuthorizedPlayerCommand(state, { type: 'trade', resource: 'wood', action: 'sell', amount: 30 }, 'player1', undefined, terrain)).toBe(true); // sem mercado: metrópole
  });
});
