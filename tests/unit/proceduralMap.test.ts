import { describe, expect, it } from 'vitest';
import { generateProceduralTerrain } from '../../src/game/proceduralMap';

describe('generateProceduralTerrain', () => {
  const makeMap = (seed: number) => {
    return generateProceduralTerrain(60, seed);
  };

  it('produces the same terrain and resource placement for the same seed', () => {
    const first = makeMap(12345);
    const second = makeMap(12345);
    const samplePoints = [
      [2, 2], [8, 30], [18, 20], [30, 30], [42, 40], [51, 30], [58, 58],
    ] as const;

    expect(first.seed).toBe(second.seed);
    expect(samplePoints.map(([x, z]) => first.getCellAt(x, z))).toEqual(
      samplePoints.map(([x, z]) => second.getCellAt(x, z))
    );
    expect(first.resourceNodes.map(({ id, type, position, remaining }) => ({ id, type, position, remaining })))
      .toEqual(second.resourceNodes.map(({ id, type, position, remaining }) => ({ id, type, position, remaining })));
    expect(Array.from(first.terrainMesh.geometry.attributes.position.array)).toEqual(
      Array.from(second.terrainMesh.geometry.attributes.position.array)
    );
  });

  it('changes terrain when the seed changes', () => {
    const first = makeMap(12345);
    const second = makeMap(54321);

    expect(Array.from(first.terrainMesh.geometry.attributes.position.array)).not.toEqual(
      Array.from(second.terrainMesh.geometry.attributes.position.array)
    );
  });
});
