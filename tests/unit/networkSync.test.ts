import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  GAME_STATE_COMPRESSION_OPTIONS,
  GAME_STATE_COMPRESSION_THRESHOLD_BYTES,
} from '../../src/game/networkSync';

describe('game state network compression', () => {
  it('enables thresholded compression for both supported Socket.IO transports', () => {
    expect(GAME_STATE_COMPRESSION_OPTIONS).toEqual({
      httpCompression: { threshold: GAME_STATE_COMPRESSION_THRESHOLD_BYTES },
      perMessageDeflate: { threshold: GAME_STATE_COMPRESSION_THRESHOLD_BYTES },
    });
  });

  it('substantially reduces a representative four-player state payload', () => {
    const gameState = {
      units: Array.from({ length: 160 }, (_, index) => ({
        id: `unit-${index}`,
        type: index % 2 === 0 ? 'villager' : 'soldier',
        owner: `player${(index % 4) + 1}`,
        position: { x: (index * 17) % 60, z: (index * 29) % 60 },
        targetPosition: { x: (index * 31) % 60, z: (index * 11) % 60 },
        targetEntityId: null,
        health: 100,
        maxHealth: 100,
        attackDamage: 10,
        state: 'moving',
        gatheringResource: null,
      })),
      buildings: Array.from({ length: 24 }, (_, index) => ({
        id: `building-${index}`,
        type: index % 3 === 0 ? 'town_center' : 'house',
        owner: `player${(index % 4) + 1}`,
        position: { x: (index * 13) % 60, z: (index * 23) % 60 },
        health: 400,
        maxHealth: 450,
        isComplete: true,
        trainingQueue: [],
      })),
      resourceNodes: Array.from({ length: 180 }, (_, index) => ({
        id: `resource-${index}`,
        type: index % 2 === 0 ? 'tree' : 'gold_mine',
        position: { x: (index * 7) % 60, z: (index * 19) % 60 },
        remaining: 150,
        maxCapacity: 160,
      })),
      playerResources: Object.fromEntries(
        Array.from({ length: 4 }, (_, index) => [`player${index + 1}`, {
          wood: 500,
          food: 500,
          gold: 300,
          stone: 250,
          planks: 100,
          pop: 20,
          maxPop: 30,
        }])
      ),
    };

    const serialized = Buffer.from(JSON.stringify(gameState));
    const compressed = deflateSync(serialized);

    expect(serialized.byteLength).toBeGreaterThan(GAME_STATE_COMPRESSION_THRESHOLD_BYTES);
    expect(compressed.byteLength).toBeLessThan(serialized.byteLength * 0.5);
  });
});

describe('game state serialization round-trip', () => {
  it('preserves the world seed and embarked passengers through JSON', () => {
    const gameState = {
      mapSeed: 4242,
      units: [
        {
          id: 'boat-1', type: 'trade_boat', owner: 'player1', position: { x: 30, z: 30 },
          targetPosition: null, targetEntityId: null, health: 220, maxHealth: 220, attackDamage: 12, state: 'idle',
          passengers: [
            {
              id: 'villager-9', type: 'villager', owner: 'player1', position: { x: 30, z: 30 },
              targetPosition: null, targetEntityId: null, health: 50, maxHealth: 50, attackDamage: 2, state: 'idle',
            },
          ],
        },
        {
          id: 'villager-7', type: 'villager', owner: 'player1', position: { x: 21, z: 20 },
          targetPosition: { x: 30, z: 30 }, targetEntityId: null, health: 50, maxHealth: 50, attackDamage: 2,
          state: 'moving', embarkTargetId: 'boat-1',
        },
      ],
      buildings: [],
      resourceNodes: [],
      playerResources: {},
    };

    const restored = JSON.parse(JSON.stringify(gameState));

    expect(restored.mapSeed).toBe(4242);
    expect(restored.units[0].passengers).toHaveLength(1);
    expect(restored.units[0].passengers[0].id).toBe('villager-9');
    expect(restored.units[0].passengers[0].embarkTargetId).toBeUndefined();
    expect(restored.units[1].embarkTargetId).toBe('boat-1');
  });
});
