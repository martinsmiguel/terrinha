import { describe, expect, it } from 'vitest';
import { evaluateCapitalSite } from '../../src/game/capitalSite';
import type { GameState, Unit } from '../../src/game/engine';
import { CAPITAL_MIN_SITES, FOUNDATION_KIT, findCapitalSites, lifePhase } from '../../src/game/foundation';
import { generateProceduralTerrain } from '../../src/game/proceduralMap';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';

const WORLDS: [number, number][] = [[60, 1234], [192, 5555], [384, 31337]];
const OPPORTUNITY_RADIUS = 30;
const WOOD_RADIUS = 28;
const resources = { wood: 100, food: 100, gold: 50, stone: 0, planks: 0, pop: 3, maxPop: 15 };

describe('escolha da sede no mundo ampliado', () => {
  it.each(WORLDS)('mundo %i (seed %i): cada natal tem ≥3 sítios válidos e distintos, cada um com oportunidades por perto', (size, seed) => {
    const map = generateProceduralTerrain(size, seed);
    const terrain = {
      mapSize: map.mapSize, buildings: [], nodes: map.resourceNodes, isWaterAt: map.isWaterAt, isCliffAt: map.isCliffAt,
      getHeightAt: map.getHeightAt, isImpassableAt: map.isImpassableAt,
    };
    for (const spawn of [map.player1Spawn, map.player2Spawn, map.player3Spawn, map.player4Spawn]) {
      const sites = findCapitalSites(
        spawn,
        (x, z) => evaluateCapitalSite({ x, z }, terrain, { from: spawn, kit: FOUNDATION_KIT }).valid,
        { maxRadius: 30, minSpacing: 4 }
      );
      expect(sites.length).toBeGreaterThanOrEqual(CAPITAL_MIN_SITES);
      for (const site of sites) {
        const near = (radius: number) => map.resourceNodes.filter((node) => Math.hypot(node.position.x - site.x, node.position.z - site.z) <= radius);
        const kinds = new Set(near(OPPORTUNITY_RADIUS).map((node) => node.id.replace(/-\d+.*$/, '').replace(/-\d+$/, '')));
        expect(kinds.size, `poucos tipos de recurso perto de ${JSON.stringify(site)}: ${[...kinds]}`).toBeGreaterThanOrEqual(3);
        expect(near(WOOD_RADIUS).some((node) => node.id.startsWith('tree')), `sem madeira a ${WOOD_RADIUS} de ${JSON.stringify(site)}`).toBe(true);
      }
    }
  });
});

describe('convidado desconectado antes de fundar', () => {
  const wagon = (owner: string, x: number): Unit => ({
    id: `wagon-${owner}`, type: 'wagon' as Unit['type'], owner, position: { x, z: 10 }, targetPosition: { x: x + 20, z: 10 },
    targetEntityId: null, health: 300, maxHealth: 300, attackDamage: 0, state: 'moving',
  });
  const ctx = (activeSlots: string[]): SimulationContext => ({
    playerSlot: 'player1', mode: 'host', activeSlots, gatherRadiusLimit: 14, sustainableForestryEnabled: false,
    buildingDefinitions: {}, random: () => 0.9, createId: () => 'id',
  });

  it('a carroça do convidado que saiu segue com a última ordem, sem eliminá-lo nem acionar IA', () => {
    let state: GameState = {
      units: [wagon('player1', 10), wagon('player2', 20), wagon('player3', 30)],
      buildings: [],
      resourceNodes: [],
      playerResources: { player1: resources, player2: resources, player3: resources },
    };
    // player2 saiu: o host o remove dos slots ativos; os outros dois continuam.
    for (let tick = 0; tick < 10; tick += 1) state = tickGameState(state, ctx(['player1', 'player3'])).state;
    const left = state.units.find((unit) => unit.id === 'wagon-player2')!;
    expect(left.targetPosition).toEqual({ x: 40, z: 10 });
    expect(left.position.x).toBeGreaterThan(20);
    expect(lifePhase('player2', state.buildings, state.units)).toBe('arriving');
    expect(state.buildings).toHaveLength(0);
    expect(state.units.filter((unit) => unit.owner === 'player2')).toHaveLength(1);
  });
});
