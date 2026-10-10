import { describe, expect, it } from 'vitest';
import { evaluateCapitalSite } from '../../src/game/capitalSite';
import { CAPITAL_MIN_SITES, FOUNDATION_KIT, findCapitalSites } from '../../src/game/foundation';
import { generateProceduralTerrain } from '../../src/game/proceduralMap';

const SEEDS = [1, 7, 42, 99, 1234, 5555, 12345, 31337, 777777, 4242424];

describe('sítios de capital no mapa procedural real', () => {
  it.each(SEEDS)('seed %i: todo ponto de chegada é válido e tem pelo menos três sítios distintos', (seed) => {
    const map = generateProceduralTerrain(60, seed);
    const terrain = {
      mapSize: 60, buildings: [], nodes: map.resourceNodes, isWaterAt: map.isWaterAt, isCliffAt: map.isCliffAt,
      getHeightAt: map.getHeightAt, isImpassableAt: map.isImpassableAt,
    };
    for (const spawn of [map.player1Spawn, map.player2Spawn, map.player3Spawn, map.player4Spawn]) {
      const arrival = evaluateCapitalSite(spawn, terrain, { from: spawn, kit: FOUNDATION_KIT });
      expect(arrival, `chegada em ${JSON.stringify(spawn)}: ${arrival.reasons.join('; ')}`).toMatchObject({ valid: true });
      const sites = findCapitalSites(
        spawn,
        (x, z) => evaluateCapitalSite({ x, z }, terrain, { from: spawn, kit: FOUNDATION_KIT }).valid,
        { maxRadius: 30, minSpacing: 4 }
      );
      expect(sites.length).toBeGreaterThanOrEqual(CAPITAL_MIN_SITES);
      expect(new Set(sites.map((site) => `${site.x},${site.z}`)).size).toBe(sites.length);
      expect(sites[0]).toEqual(spawn);
    }
  });
});
