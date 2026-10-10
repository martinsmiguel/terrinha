import { describe, expect, it } from 'vitest';
import { CAPITAL_MIN_SITES } from '../../src/game/foundation';
import { generateProceduralTerrain } from '../../src/game/proceduralMap';
import { MAP_SIZE } from '../../src/game/model';
import { DEFAULT_WORLD_SIZE, WORLD_SIZE_OPTIONS, parseWorldSize } from '../../src/game/worldConfig';
import { proveWorld } from '../../src/game/worldProofs';

const SEEDS = [4242, 1, 42];

function walkableLand(size: number, seed: number) {
  const map = generateProceduralTerrain(size, seed);
  let cells = 0;
  for (let x = 0; x < size; x += 1) for (let z = 0; z < size; z += 1) if (!map.isWaterAt(x + 0.5, z + 0.5) && !map.isImpassableAt(x + 0.5, z + 0.5)) cells += 1;
  return { map, cells, useful: proveWorld(map, { islands: map.islands }).islands.map((island) => island.usefulArea) };
}

describe('mundo padrão do lobby', () => {
  it('é oferecido no lobby, é aceito pela rede e mantém os tamanhos antigos disponíveis', () => {
    expect(WORLD_SIZE_OPTIONS.some((option) => option.size === DEFAULT_WORLD_SIZE)).toBe(true);
    expect(WORLD_SIZE_OPTIONS.some((option) => option.size === MAP_SIZE)).toBe(true);
    expect(parseWorldSize(DEFAULT_WORLD_SIZE)).toBe(DEFAULT_WORLD_SIZE);
  });

  it('as ilhas têm pelo menos 20x a área das do mundo de 60, medido no mapa gerado', () => {
    for (const seed of SEEDS) {
      const small = walkableLand(MAP_SIZE, seed);
      const large = walkableLand(DEFAULT_WORLD_SIZE, seed);
      expect(large.cells / small.cells, `terra caminhável, semente ${seed}`).toBeGreaterThanOrEqual(20);
      const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
      expect(sum(large.useful) / sum(small.useful), `área útil das natais, semente ${seed}`).toBeGreaterThanOrEqual(20);
    }
  }, 60000);

  it('toda semente gera mundo viável, com sítios de capital em cada natal', () => {
    for (const seed of SEEDS) {
      const { map } = walkableLand(DEFAULT_WORLD_SIZE, seed);
      expect(map.viable, `semente ${seed}: ${map.viabilityReasons.join('; ')}`).toBe(true);
      expect(map.capitalSites.every((count) => count >= CAPITAL_MIN_SITES)).toBe(true);
    }
  }, 60000);
});
