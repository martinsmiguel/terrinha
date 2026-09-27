import { describe, expect, it } from 'vitest';
import { generateProceduralTerrain } from '../../src/game/proceduralMap';

describe('generateProceduralTerrain', () => {
  it('produces the same resource layout and terrain for the same seed', () => {
    const first = generateProceduralTerrain(60, 24680);
    const second = generateProceduralTerrain(60, 24680);

    const resourceLayout = (map: typeof first) =>
      map.resourceNodes.map(({ id, type, position, remaining }) => ({ id, type, position, remaining }));

    expect(resourceLayout(first)).toEqual(resourceLayout(second));
    expect(first.getHeightAt(20, 30)).toBe(second.getHeightAt(20, 30));
  });

  it('offers four dry, resource-free spawn plateaus for up to four players', () => {
    const map = generateProceduralTerrain(60, 24680);
    const spawns = [map.player1Spawn, map.player2Spawn, map.player3Spawn, map.player4Spawn];

    expect(spawns).toEqual([
      { x: 18, z: 20 },
      { x: 42, z: 40 },
      { x: 18, z: 40 },
      { x: 42, z: 20 },
    ]);

    spawns.forEach((spawn) => {
      expect(map.isWaterAt(spawn.x, spawn.z)).toBe(false);
      expect(map.isCliffAt(spawn.x, spawn.z)).toBe(false);
      const closestResource = Math.min(
        ...map.resourceNodes.map((node) => Math.hypot(node.position.x - spawn.x, node.position.z - spawn.z))
      );
      expect(closestResource).toBeGreaterThan(4.5);
    });
  });

  it('changes the generated resource layout when the seed changes', () => {
    const first = generateProceduralTerrain(60, 24680);
    const second = generateProceduralTerrain(60, 13579);

    expect(first.resourceNodes.map(({ position }) => position)).not.toEqual(
      second.resourceNodes.map(({ position }) => position)
    );
  });

  it('produces the same terrain mesh geometry for the same seed', () => {
    const first = generateProceduralTerrain(60, 12345);
    const second = generateProceduralTerrain(60, 12345);

    expect(first.seed).toBe(second.seed);
    expect(Array.from(first.terrainMesh.geometry.attributes.position.array)).toEqual(
      Array.from(second.terrainMesh.geometry.attributes.position.array)
    );
  });

  it('changes the terrain mesh when the seed changes', () => {
    const first = generateProceduralTerrain(60, 12345);
    const second = generateProceduralTerrain(60, 54321);

    expect(Array.from(first.terrainMesh.geometry.attributes.position.array)).not.toEqual(
      Array.from(second.terrainMesh.geometry.attributes.position.array)
    );
  });
});
