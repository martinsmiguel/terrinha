import { describe, expect, it } from 'vitest';
import {
  BODIES, BOAT_DRAFT, BOAT_DRAFT_MARGIN, BOAT_REQUIRED_DEPTH, boatCanFloat, bodyOf, canStand, classifyForBody, moveCost, speedFactor,
  type Surface,
} from '../../src/game/bodyModel';

const dry: Surface = { water: 'none', depth: 0, cliff: false };
const water = (kind: Surface['water'], depth: number): Surface => ({ water: kind, depth, cliff: false });

describe('corpos e calado (padrões de projeto)', () => {
  it('humano 1,8/0,35/0,81; montaria 1,6/0,6/0,72; carroça 1,4/0,8/0,35', () => {
    expect(BODIES.human).toEqual({ height: 1.8, radius: 0.35, wadeDepth: 0.81 });
    expect(BODIES.mount).toEqual({ height: 1.6, radius: 0.6, wadeDepth: 0.72 });
    expect(BODIES.cart).toEqual({ height: 1.4, radius: 0.8, wadeDepth: 0.35 });
  });
  it('o barco precisa de calado 0,8 mais margem 0,2 de água', () => {
    expect(BOAT_DRAFT).toBe(0.8);
    expect(BOAT_DRAFT_MARGIN).toBe(0.2);
    expect(BOAT_REQUIRED_DEPTH).toBeCloseTo(1.0, 10);
  });
  it('cada tipo de unidade usa o corpo certo', () => {
    expect(['villager', 'soldier'].map((t) => bodyOf(t as never))).toEqual(['human', 'human']);
    expect(bodyOf('cavalry')).toBe('mount');
    expect(bodyOf('wagon')).toBe('cart');
    expect(['fishing_boat', 'trade_boat', 'warship'].map((t) => bodyOf(t as never))).toEqual(['boat', 'boat', 'boat']);
  });
});

describe('superfície por corpo', () => {
  it('terra seca é seca para todos; rochedo bloqueia todos', () => {
    for (const body of ['human', 'mount', 'cart'] as const) {
      expect(classifyForBody(dry, body)).toBe('dry');
      expect(classifyForBody({ ...dry, cliff: true }, body)).toBe('blocked');
    }
  });

  it('água rasa apoia os pés até o limite de vau de cada corpo; além disso o fundo bloqueia', () => {
    const at = (depth: number) => water('ocean', depth);
    expect(classifyForBody(at(0.3), 'cart')).toBe('shallow');
    expect(classifyForBody(at(0.5), 'cart')).toBe('blocked'); // carroça: 0,35
    expect(classifyForBody(at(0.7), 'mount')).toBe('shallow');
    expect(classifyForBody(at(0.8), 'mount')).toBe('blocked'); // montaria: 0,72
    expect(classifyForBody(at(0.8), 'human')).toBe('shallow');
    expect(classifyForBody(at(0.82), 'human')).toBe('blocked'); // humano: 0,81
  });

  it('o raso desacelera até metade no limite do vau, e quanto mais fundo mais devagar e mais caro na rota', () => {
    const shallow = (depth: number) => water('river', depth);
    expect(speedFactor(dry, 'human')).toBe(1);
    expect(speedFactor(shallow(0.4), 'human')).toBeLessThan(1);
    expect(speedFactor(shallow(0.81), 'human')).toBeCloseTo(0.5, 6);
    expect(speedFactor(shallow(0.2), 'human')).toBeGreaterThan(speedFactor(shallow(0.6), 'human'));
    expect(moveCost(dry, 'human')).toBe(1);
    expect(moveCost(shallow(0.4), 'human')).toBeGreaterThan(1);
    expect(moveCost(shallow(0.6), 'human')).toBeGreaterThan(moveCost(shallow(0.2), 'human'));
    expect(moveCost(water('lake', 1.4), 'human')).toBe(Number.POSITIVE_INFINITY);
  });

  it('barco: só oceano com 1,0 de fundo; raso de costa, lagos e rios o prendem fora', () => {
    expect(boatCanFloat(water('ocean', 1.0))).toBe(true);
    expect(boatCanFloat(water('ocean', 0.99))).toBe(false);
    expect(boatCanFloat(water('ocean', 3))).toBe(true);
    expect(boatCanFloat(water('lake', 3))).toBe(false);
    expect(boatCanFloat(water('river', 3))).toBe(false);
    expect(boatCanFloat(dry)).toBe(false);
    expect(canStand(water('ocean', 3), 'human')).toBe(false); // fundo demais para qualquer corpo terrestre
    expect(speedFactor(water('ocean', 3), 'boat')).toBe(1);
  });
});
