import { describe, expect, it } from 'vitest';
import { evaluateMatch, hasTownCenter, localOutcome, townCenterOwners } from '../../src/game/victory';
import type { Building } from '../../src/game/engine';

const townCenter = (owner: string, health = 2400): Building => ({
  id: `tc-${owner}`,
  type: 'town_center',
  owner,
  position: { x: 30, z: 30 },
  health,
  maxHealth: 2400,
  isComplete: true,
  trainingQueue: [],
});

const house = (owner: string): Building => ({
  id: `house-${owner}`,
  type: 'house',
  owner,
  position: { x: 10, z: 10 },
  health: 450,
  maxHealth: 450,
  isComplete: true,
  trainingQueue: [],
});

const contenders = ['player1', 'player2'];

describe('townCenterOwners', () => {
  it('lists only owners with a town center still standing', () => {
    expect(townCenterOwners([townCenter('player1'), townCenter('player2'), house('player3')])).toEqual([
      'player1',
      'player2',
    ]);
  });

  it('ignores a town center with no health', () => {
    expect(townCenterOwners([townCenter('player1', 0), townCenter('player2')])).toEqual(['player2']);
  });
});

describe('evaluateMatch', () => {
  it('keeps running while both town centers stand', () => {
    expect(evaluateMatch([townCenter('player1'), townCenter('player2')], contenders)).toEqual({
      status: 'running',
    });
  });

  it('finishes with the last surviving owner as winner', () => {
    const buildings = [house('player1'), townCenter('player2')];
    expect(evaluateMatch(buildings, contenders)).toEqual({ status: 'finished', winner: 'player2' });
  });

  it('treats a draw with no town centers left as a finished match without winner', () => {
    expect(evaluateMatch([house('player1')], contenders)).toEqual({ status: 'finished', winner: null });
  });

  it('ignores owners outside the contender list', () => {
    const buildings = [townCenter('player1'), townCenter('player2'), townCenter('player3')];
    expect(evaluateMatch(buildings, ['player1', 'player2'])).toEqual({ status: 'running' });
    expect(evaluateMatch(buildings, ['player1'])).toEqual({ status: 'finished', winner: 'player1' });
  });
});

describe('localOutcome', () => {
  it('is running while the local town center stands and rivals remain', () => {
    expect(localOutcome('player1', [townCenter('player1'), townCenter('player2')], contenders)).toBe(
      'running'
    );
  });

  it('is defeat as soon as the local town center falls', () => {
    expect(localOutcome('player1', [townCenter('player2'), house('player1')], contenders)).toBe('defeat');
  });

  it('is victory when the rival town center falls', () => {
    expect(localOutcome('player1', [townCenter('player1'), house('player2')], contenders)).toBe('victory');
  });

  it('is defeat when every town center is destroyed', () => {
    expect(localOutcome('player1', [house('player1'), house('player2')], contenders)).toBe('defeat');
  });

  it('hasTownCenter agrees with localOutcome', () => {
    expect(hasTownCenter([townCenter('player1')], 'player1')).toBe(true);
    expect(hasTownCenter([townCenter('player1')], 'player2')).toBe(false);
  });
});
