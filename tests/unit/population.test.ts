import { describe, expect, it } from 'vitest';
import { applyPopDelta, countDeathsByOwner } from '../../src/game/population';

const table = () => ({
  player1: { wood: 100, food: 100, gold: 50, stone: 0, planks: 0, pop: 3, maxPop: 15 },
  player2: { wood: 100, food: 100, gold: 50, stone: 0, planks: 0, pop: 1, maxPop: 10 },
});

describe('countDeathsByOwner', () => {
  it('agrupa apenas unidades com health <= 0 por dono', () => {
    const units = [
      { owner: 'player1', health: 0 },
      { owner: 'player1', health: 42 },
      { owner: 'player1', health: -5 },
      { owner: 'player2', health: 0 },
    ];
    expect(countDeathsByOwner(units)).toEqual({ player1: 2, player2: 1 });
  });

  it('retorna objeto vazio quando nao ha mortes', () => {
    expect(countDeathsByOwner([{ owner: 'player1', health: 10 }])).toEqual({});
  });
});

describe('applyPopDelta', () => {
  it('nascimento incrementa a populacao', () => {
    const next = applyPopDelta(table(), 'player1', 1);
    expect(next.player1.pop).toBe(4);
  });

  it('morte decrementa a populacao', () => {
    const next = applyPopDelta(table(), 'player1', -1);
    expect(next.player1.pop).toBe(2);
  });

  it('nunca fica negativa', () => {
    const next = applyPopDelta(table(), 'player2', -99);
    expect(next.player2.pop).toBe(0);
  });

  it('nunca passa do maxPop', () => {
    const next = applyPopDelta(table(), 'player2', 99);
    expect(next.player2.pop).toBe(next.player2.maxPop);
  });

  it('ignora jogador desconhecido', () => {
    const resources = table();
    expect(applyPopDelta(resources, 'player9', -1)).toBe(resources);
  });

  it('nao altera o estado original (imutabilidade)', () => {
    const resources = table();
    applyPopDelta(resources, 'player1', -1);
    expect(resources.player1.pop).toBe(3);
  });
});
