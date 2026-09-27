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

  it('changes the generated resource layout when the seed changes', () => {
    const first = generateProceduralTerrain(60, 24680);
    const second = generateProceduralTerrain(60, 13579);

    expect(first.resourceNodes.map(({ position }) => position)).not.toEqual(
      second.resourceNodes.map(({ position }) => position)
    );
  });
});
