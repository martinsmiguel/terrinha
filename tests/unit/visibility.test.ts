import { describe, expect, it } from 'vitest';
import {
  VISION_EXPLORED,
  VISION_UNEXPLORED,
  VISION_VISIBLE,
  createVisionGrid,
  exploredCount,
  gridSizeOf,
  expireVision,
  isExploredAt,
  isVisibleAt,
  revealVision,
  visionAt,
  visionRadiusFor,
} from '../../src/game/visibility';
import type { Building, Unit } from '../../src/game/engine';

const SIZE = 60;
const grid = () => createVisionGrid({ size: SIZE });

describe('createVisionGrid', () => {
  it('starts fully unexplored', () => {
    const fresh = grid();
    expect(fresh.length).toBe(SIZE * SIZE);
    expect(exploredCount(fresh)).toBe(0);
    expect(visionAt(fresh, 10, 10, { size: SIZE })).toBe(VISION_UNEXPLORED);
  });

  it('treats cells outside the map as unexplored', () => {
    const fresh = grid();
    expect(visionAt(fresh, -1, 0, { size: SIZE })).toBe(VISION_UNEXPLORED);
    expect(visionAt(fresh, SIZE, 0, { size: SIZE })).toBe(VISION_UNEXPLORED);
    expect(isExploredAt(fresh, 0, SIZE, { size: SIZE })).toBe(false);
  });
});

describe('revealVision', () => {
  it('marks the cells inside a source radius as visible', () => {
    const revealed = revealVision(grid(), [{ x: 30, z: 30, radius: 5 }], { size: SIZE });

    expect(visionAt(revealed, 30, 30, { size: SIZE })).toBe(VISION_VISIBLE);
    expect(visionAt(revealed, 33, 33, { size: SIZE })).toBe(VISION_VISIBLE);
    expect(visionAt(revealed, 30, 37, { size: SIZE })).toBe(VISION_UNEXPLORED);
  });

  it('keeps already explored cells explored once they leave vision', () => {
    const first = revealVision(grid(), [{ x: 30, z: 30, radius: 5 }], { size: SIZE });
    const expired = expireVision(first);
    const second = revealVision(expired, [{ x: 50, z: 50, radius: 5 }], { size: SIZE });

    expect(visionAt(second, 30, 30, { size: SIZE })).toBe(VISION_EXPLORED);
    expect(isExploredAt(second, 30, 30, { size: SIZE })).toBe(true);
    expect(isVisibleAt(second, 30, 30, { size: SIZE })).toBe(false);
    expect(visionAt(second, 50, 50, { size: SIZE })).toBe(VISION_VISIBLE);
  });

  it('never writes outside the grid for sources near the border', () => {
    const revealed = revealVision(grid(), [{ x: 0, z: 0, radius: 8 }], { size: SIZE });

    expect(visionAt(revealed, 0, 0, { size: SIZE })).toBe(VISION_VISIBLE);
    expect(revealed.length).toBe(SIZE * SIZE);
  });

  it('merges overlapping sources', () => {
    const revealed = revealVision(
      grid(),
      [
        { x: 10, z: 10, radius: 4 },
        { x: 14, z: 10, radius: 4 },
      ],
      { size: SIZE }
    );

    expect(visionAt(revealed, 12, 10, { size: SIZE })).toBe(VISION_VISIBLE);
    expect(exploredCount(revealed)).toBeGreaterThan(exploredCount(revealVision(grid(), [{ x: 10, z: 10, radius: 4 }], { size: SIZE })));
  });

  it('does not mutate the input grid', () => {
    const before = grid();
    revealVision(before, [{ x: 30, z: 30, radius: 5 }], { size: SIZE });

    expect(exploredCount(before)).toBe(0);
  });
});

describe('expireVision', () => {
  it('downgrades visible cells to explored and leaves the rest alone', () => {
    const revealed = revealVision(grid(), [{ x: 30, z: 30, radius: 4 }], { size: SIZE });
    const expired = expireVision(revealed);

    expect(visionAt(expired, 30, 30, { size: SIZE })).toBe(VISION_EXPLORED);
    expect(visionAt(expired, 0, 0, { size: SIZE })).toBe(VISION_UNEXPLORED);
    expect(exploredCount(expired)).toBe(exploredCount(revealed));
  });

  it('survives several reveal/expire rounds without losing history', () => {
    let state = grid();
    for (let round = 0; round < 5; round++) {
      state = expireVision(state);
      state = revealVision(state, [{ x: 10 + round, z: 10, radius: 3 }], { size: SIZE });
    }
    state = expireVision(state);

    expect(visionAt(state, 10, 10, { size: SIZE })).toBe(VISION_EXPLORED);
    expect(visionAt(state, 14, 10, { size: SIZE })).toBe(VISION_EXPLORED);
    expect(visionAt(state, 50, 50, { size: SIZE })).toBe(VISION_UNEXPLORED);
  });
});

describe('visionRadiusFor', () => {
  const unit = (type: Unit['type']): Unit =>
    ({
      id: 'u1',
      type,
      owner: 'player1',
      position: { x: 0, z: 0 },
      targetPosition: null,
      targetEntityId: null,
      health: 100,
      maxHealth: 100,
      attackDamage: 5,
      state: 'idle',
    }) as Unit;

  const building = (type: Building['type']): Building => ({
    id: 'b1',
    type,
    owner: 'player1',
    position: { x: 0, z: 0 },
    health: 500,
    maxHealth: 500,
    isComplete: true,
    trainingQueue: [],
  });

  it('gives soldiers a wider ring than villagers', () => {
    expect(visionRadiusFor(unit('soldier'))).toBe(11);
    expect(visionRadiusFor(unit('villager'))).toBe(8);
  });

  it('gives the town center the widest ring of all buildings', () => {
    expect(visionRadiusFor(building('town_center'))).toBe(16);
    expect(visionRadiusFor(building('barracks'))).toBe(12);
    expect(visionRadiusFor(building('house'))).toBe(9);
  });
});

describe('performance', () => {
  it('reveals a map full of sources inside the tick budget', () => {
    const sources = [];
    for (let i = 0; i < 120; i++) {
      sources.push({ x: (i % 20) * 3, z: Math.floor(i / 20) * 7, radius: 9 });
    }

    const startedAt = performance.now();
    let state = grid();
    for (let tick = 0; tick < 20; tick++) {
      state = expireVision(state);
      state = revealVision(state, sources, { size: SIZE });
    }
    const elapsed = performance.now() - startedAt;

    expect(elapsed).toBeLessThan(500);
    expect(isVisibleAt(state, 0, 0, { size: SIZE })).toBe(true);
  });
});

describe('grade de névoa em qualquer dimensão', () => {
  it('deduz o lado da própria grade e revela, explora e consulta em mundos maiores que 60', () => {
    for (const size of [60, 192, 768]) {
      const grid = createVisionGrid({ size });
      expect(gridSizeOf(grid)).toBe(size);
      const center = Math.floor(size / 2);
      const revealed = revealVision(grid, [{ x: center, z: center, radius: 5 }]);
      expect(isVisibleAt(revealed, center, center)).toBe(true);
      expect(isVisibleAt(revealed, center + 9, center)).toBe(false);
      const aged = expireVision(revealed);
      expect(isExploredAt(aged, center, center)).toBe(true);
      expect(isVisibleAt(aged, center, center)).toBe(false);
      expect(isExploredAt(aged, size - 1, size - 1)).toBe(false);
    }
  });
});

