import { describe, expect, it } from 'vitest';
import { computeArchipelago } from '../../src/game/archipelago';
import { generateProceduralTerrain, MAX_SEED_ATTEMPTS } from '../../src/game/proceduralMap';
import { CAPITAL_MIN_SITES } from '../../src/game/foundation';
import { proofThresholds, proveNativeIsland, proveWorld, REFERENCE_WORLD_SIZE, type WorldQueries } from '../../src/game/worldProofs';

describe('limiares das provas', () => {
  it('em 768 são as metas absolutas do card e escalam com a área nos demais tamanhos', () => {
    const reference = proofThresholds(REFERENCE_WORLD_SIZE);
    expect(reference.minUsefulArea).toBe(12000);
    expect(reference.districtSize).toBe(64);
    expect(reference.minRegions).toBe(4);
    expect(reference.minCoasts).toBe(2);
    expect(proofThresholds(384).minUsefulArea).toBeCloseTo(3000, 5);
    expect(proofThresholds(60).districtSize).toBeGreaterThanOrEqual(4);
  });
});

describe('provas das ilhas natais em mapas reais', () => {
  it.each([60, 192, 384])('mundo %i: toda ilha natal passa em área, janela de capital, regiões e costas', (size) => {
    const map = generateProceduralTerrain(size, 4242);
    const proof = proveWorld(map, { islands: map.islands });
    expect(proof.islands).toHaveLength(4);
    for (const island of proof.islands) {
      expect(island.checks, `ilha ${island.island}: ${JSON.stringify(island)}`).toEqual({ area: true, capitalWindow: true, regions: true, coasts: true });
    }
    expect(proof.viable).toBe(true);
  }, 60000);

  it('em 768 a área útil de cada natal passa de 12000 e há janela de capital de 64x64', () => {
    const map = generateProceduralTerrain(768, 4242);
    const proof = proveWorld(map, { islands: map.islands });
    for (const island of proof.islands) {
      expect(island.usefulArea).toBeGreaterThanOrEqual(12000);
      expect(island.capitalWindowUseful).toBeGreaterThanOrEqual(64 * 64 * 0.5);
      expect(island.regions).toBeGreaterThanOrEqual(4);
      expect(island.coasts).toBeGreaterThanOrEqual(2);
    }
    expect(map.capitalSites.every((count) => count >= CAPITAL_MIN_SITES)).toBe(true);
  }, 120000);
});

describe('controles negativos das provas', () => {
  const layout = computeArchipelago(192, 7);
  const island = layout.islands[0];
  const world = (overrides: Partial<WorldQueries> = {}): WorldQueries => ({
    mapSize: 192,
    isWaterAt: () => false,
    isCliffAt: () => false,
    isImpassableAt: () => false,
    isOceanAt: () => false,
    getHeightAt: () => 0,
    ...overrides,
  });
  const nearIsland = (x: number, z: number) => Math.hypot(x - island.center.x, z - island.center.z) <= island.baseRadius;

  it('uma ilha só de oceano reprova em tudo', () => {
    const proof = proveNativeIsland(world({ isImpassableAt: () => true, isWaterAt: () => true, isOceanAt: () => true }), island);
    expect(proof.passes).toBe(false);
    expect(proof.checks).toEqual({ area: false, capitalWindow: false, regions: false, coasts: false });
  });

  it('terra pequena demais reprova em área e janela de capital', () => {
    const tiny = (x: number, z: number) => Math.hypot(x - island.spawn.x, z - island.spawn.z) <= 6;
    const proof = proveNativeIsland(world({ isImpassableAt: (x, z) => !tiny(x, z), isWaterAt: (x, z) => !tiny(x, z) }), island);
    expect(proof.checks.area).toBe(false);
    expect(proof.checks.capitalWindow).toBe(false);
  });

  it('ilha cortada por um rochedo contínuo deixa de ter quatro regiões ligadas por terra', () => {
    const proof = proveNativeIsland(
      world({ isCliffAt: (x, z) => nearIsland(x, z) && Math.abs(x - island.spawn.x) < 2 && z > island.spawn.z }),
      island
    );
    expect(proof.regions).toBeLessThan(4);
    expect(proof.checks.regions).toBe(false);
  });

  it('ampliar só o oceano não atende: terra isolada do nascedouro por água não conta', () => {
    const proof = proveNativeIsland(
      world({ isWaterAt: (x, z) => Math.hypot(x - island.spawn.x, z - island.spawn.z) > 3 && Math.hypot(x - island.spawn.x, z - island.spawn.z) < 4 }),
      island
    );
    expect(proof.usefulArea).toBeLessThan(40);
    expect(proof.passes).toBe(false);
  });
});

describe('rejeição limitada de sementes inviáveis', () => {
  it('um mundo gerado sempre é viável e a semente usada o recria na primeira tentativa', () => {
    for (const seed of [1, 12, 19, 777]) {
      const map = generateProceduralTerrain(60, seed);
      expect(map.viable, `semente pedida ${seed} -> usada ${map.seed}`).toBe(true);
      expect(map.seedAttempts).toBeLessThanOrEqual(MAX_SEED_ATTEMPTS);
      expect(map.capitalSites.every((count) => count >= CAPITAL_MIN_SITES)).toBe(true);
      const again = generateProceduralTerrain(60, map.seed);
      expect(again.seed).toBe(map.seed);
      expect(again.seedAttempts).toBe(1);
      expect(again.player1Spawn).toEqual(map.player1Spawn);
      expect(again.resourceNodes.map((node) => node.id)).toEqual(map.resourceNodes.map((node) => node.id));
    }
  });

  it('sementes inviáveis são realmente puladas: alguma semente pedida usa outra semente', () => {
    const substituted = [1, 12, 13, 19, 31337].filter((seed) => generateProceduralTerrain(60, seed).seed !== seed);
    expect(substituted.length).toBeGreaterThan(0);
  });
});
