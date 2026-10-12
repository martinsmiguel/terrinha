import { describe, expect, it } from 'vitest';
import { evaluateMatch, hasTownCenter, localOutcome, localResult, townCenterOwners } from '../../src/game/victory';
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
      players: contenders,
    });
  });

  it('finishes with the last surviving owner as winner', () => {
    const buildings = [house('player1'), townCenter('player2')];
    expect(evaluateMatch(buildings, contenders)).toEqual({ status: 'finished', winner: 'player2', players: contenders });
  });

  it('treats a draw with no town centers left as a finished match without winner', () => {
    expect(evaluateMatch([house('player1')], contenders)).toEqual({ status: 'finished', winner: null, players: contenders });
  });

  it('runs a three or four player match until the last rival town center falls', () => {
    const four = ['player1', 'player2', 'player3', 'player4'];
    expect(
      evaluateMatch([townCenter('player1'), townCenter('player2'), townCenter('player3'), house('player4')], four)
    ).toEqual({ status: 'running', players: four });
    expect(
      evaluateMatch([townCenter('player1'), house('player2'), house('player3'), house('player4')], four)
    ).toEqual({ status: 'finished', winner: 'player1', players: four });
    expect(evaluateMatch([house('player1'), house('player2'), house('player3'), house('player4')], four)).toEqual({
      status: 'finished',
      winner: null,
      players: four,
    });
  });

  it('ignores owners outside the contender list', () => {
    const buildings = [townCenter('player1'), townCenter('player2'), townCenter('player3')];
    expect(evaluateMatch(buildings, ['player1', 'player2'])).toEqual({
      status: 'running',
      players: ['player1', 'player2'],
    });
    expect(evaluateMatch(buildings, ['player1'])).toEqual({
      status: 'finished',
      winner: 'player1',
      players: ['player1'],
    });
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

describe('localResult (#190): vitória só pelo resultado do host', () => {
  const wagon = (owner: string) => ({ id: `w-${owner}`, type: 'wagon' as const, owner, position: { x: 1, z: 1 }, targetPosition: null, targetEntityId: null, health: 100, maxHealth: 100, attackDamage: 0, state: 'idle' as const });
  const running = (players: string[]) => ({ status: 'running' as const, players });

  it('host LAN sozinho: o host diz "em andamento", então não há vitória', () => {
    expect(localResult('player1', [], [wagon('player1')], running(['player1']))).toBe('running');
  });

  it('convidado que não vê o oponente pela névoa não vence por isso', () => {
    // O snapshot do convidado não traz a carroça nem a capital do host: antes isso parecia eliminação do rival.
    expect(localResult('player2', [], [wagon('player2')], running(['player1', 'player2']))).toBe('running');
  });

  it('antes do primeiro estado do host, ou fora da lista de jogadores, nada é julgado', () => {
    expect(localResult('player2', [], [], undefined)).toBe('running');
    expect(localResult('player2', [], [], running(['player1']))).toBe('running');
  });

  it('a própria eliminação é derrota; vitória e derrota finais vêm do host', () => {
    expect(localResult('player1', [], [], running(['player1', 'player2']))).toBe('defeat');
    const finished = (winner: string | null) => ({ status: 'finished' as const, winner, players: ['player1', 'player2'] });
    expect(localResult('player1', [townCenter('player1')], [], finished('player1'))).toBe('victory');
    expect(localResult('player2', [townCenter('player2')], [], finished('player1'))).toBe('defeat');
    expect(localResult('player1', [townCenter('player1')], [], finished(null))).toBe('defeat');
  });
});
