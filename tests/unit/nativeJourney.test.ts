import { describe, expect, it } from 'vitest';
import type { Building, GameState, Unit } from '../../src/game/model';
import { generateProceduralTerrain } from '../../src/game/proceduralMap';
import { STARTING_SUPPLY, journeyCost, journeyNeeds } from '../../src/game/islandEconomy';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';
import { MARKET_RATES, goldGainForSell } from '../../src/game/economy';

/**
 * Jornada natal de ponta a ponta: aldeões de verdade andam e coletam num mapa procedural real. Prova que a ilha natal
 * entrega o que três eras, a cadeia mínima e o refino exigem sem nenhum frete, e não só que existam nós suficientes.
 */
const SEEDS = [52723, 10007, 91570];
const TICKS = 4000; // 200 s de partida

describe('jornada natal sem frete', () => {
  it.each(SEEDS)('semente %i: oito aldeões cobrem o custo da jornada só com recursos da própria ilha', (seed) => {
    const map = generateProceduralTerrain(60, seed);
    const island = map.islands[0];
    const own = map.resourceNodes.filter((node) => new RegExp(`-${island.index}-`).test(node.id) && node.type !== 'fish_school');
    const nearest = (type: string, count: number) =>
      own.filter((node) => node.type === type)
        .sort((a, b) => Math.hypot(a.position.x - map.player1Spawn.x, a.position.z - map.player1Spawn.z) - Math.hypot(b.position.x - map.player1Spawn.x, b.position.z - map.player1Spawn.z))
        .slice(0, count);

    // Oito aldeões: até 2 no ouro, 1 na pedra, 1 no pomar; o resto na madeira (ilhas com uma só mina põem mais na lenha).
    const specialists = [...nearest('gold_mine', 2), ...nearest('stone', 1), ...nearest('food_bush', 1)];
    const targets = [...nearest('tree', 8 - specialists.length), ...specialists];
    expect(targets.length).toBe(8);
    const villagers: Unit[] = targets.map((node, index): Unit => ({
      id: `v${index}`, type: 'villager', owner: 'player1', position: { x: map.player1Spawn.x + (index % 4) * 0.5, z: map.player1Spawn.z + Math.floor(index / 4) * 0.5 },
      targetPosition: null, targetEntityId: node.id, health: 100, maxHealth: 100, attackDamage: 5, state: 'gathering',
      gatherRadiusLimit: 999,
    }));
    const capital: Building = { id: 'capital', type: 'town_center', owner: 'player1', position: { ...map.player1Spawn }, health: 2400, maxHealth: 2400, isComplete: true, trainingQueue: [] };
    let state: GameState = {
      units: villagers, buildings: [capital], resourceNodes: map.resourceNodes.map((node) => ({ ...node, position: { ...node.position } })),
      playerResources: { player1: { ...STARTING_SUPPLY, pop: 8, maxPop: 99 } },
    };
    const ctx: SimulationContext = {
      playerSlot: 'player1', mode: 'host', map, pathCache: new Map(), gatherRadiusLimit: 999, sustainableForestryEnabled: false,
      buildingDefinitions: {}, random: () => 0.5, createId: () => 'x', activeSlots: ['player1'],
    };
    for (let tick = 0; tick < TICKS; tick += 1) state = tickGameState(state, ctx).state;

    const cost = journeyCost();
    const resources = state.playerResources.player1;
    expect(resources.wood, `semente ${map.seed}`).toBeGreaterThanOrEqual(cost.wood);
    expect(resources.gold, `semente ${map.seed}`).toBeGreaterThanOrEqual(cost.gold);
    expect(resources.food).toBeGreaterThanOrEqual(cost.food);
    expect(resources.stone).toBeGreaterThanOrEqual(journeyNeeds().stone);
  }, 120000);

  it('o câmbio converte excedente da própria ilha em ouro sem barco: madeira, comida e pedra vendem no mercado', () => {
    for (const type of ['wood', 'food', 'stone'] as const) {
      expect(MARKET_RATES[type].sellPrice).toBeGreaterThan(0);
      expect(goldGainForSell(type, 100)).toBeGreaterThan(0);
    }
  });
});
