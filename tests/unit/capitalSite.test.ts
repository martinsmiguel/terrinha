import { describe, expect, it } from 'vitest';
import { evaluateCapitalSite, type CapitalSiteTerrain } from '../../src/game/capitalSite';
import type { Building, ResourceNode } from '../../src/game/model';

const open: CapitalSiteTerrain = { mapSize: 60, buildings: [], nodes: [], isWaterAt: () => false, isCliffAt: () => false, getHeightAt: () => 0, isImpassableAt: () => false };
const kit = { wood: 400, stone: 200 };
const house = (x: number, z: number): Building => ({ id: 'h', type: 'house', owner: 'player1', position: { x, z }, health: 1, maxHealth: 1, isComplete: true, trainingQueue: [] });
const tree = (x: number, z: number): ResourceNode => ({ id: 't', type: 'tree', position: { x, z }, remaining: 10 });

describe('evaluateCapitalSite', () => {
  it('aceita terreno aberto, plano, acessível e com kit completo', () => {
    expect(evaluateCapitalSite({ x: 30, z: 30 }, open, { from: { x: 20, z: 20 }, kit })).toEqual({ valid: true, space: true, terrain: true, access: true, discovered: true, kit: true, reasons: [] });
  });

  it('recusa fora do mapa, sobre edifício ou recurso e com coordenadas não finitas', () => {
    expect(evaluateCapitalSite({ x: 2, z: 30 }, open).space).toBe(false);
    expect(evaluateCapitalSite({ x: 30, z: 30 }, { ...open, buildings: [house(31, 30)] }).space).toBe(false);
    expect(evaluateCapitalSite({ x: 30, z: 30 }, { ...open, nodes: [tree(30, 31)] }).space).toBe(false);
    expect(evaluateCapitalSite({ x: Number.NaN, z: 30 }, open).valid).toBe(false);
  });

  it('recusa água ou rochedo sob o centro e declive forte nos cantos', () => {
    expect(evaluateCapitalSite({ x: 30, z: 30 }, { ...open, isWaterAt: (x) => x >= 30 }).terrain).toBe(false);
    expect(evaluateCapitalSite({ x: 30, z: 30 }, { ...open, isWaterAt: (x) => x > 40 }).terrain).toBe(true);
    expect(evaluateCapitalSite({ x: 30, z: 30 }, { ...open, isCliffAt: (x, z) => x === 30 && z === 30 }).terrain).toBe(false);
    expect(evaluateCapitalSite({ x: 30, z: 30 }, { ...open, getHeightAt: (x) => (x > 31 ? 2 : 0) }).terrain).toBe(false);
  });

  it('informa acesso: sem caminho por terra a carroça não alcança o sítio', () => {
    const wall = { ...open, isImpassableAt: (x: number) => x >= 25 && x < 27 };
    const report = evaluateCapitalSite({ x: 40, z: 30 }, wall, { from: { x: 10, z: 30 }, kit });
    expect(report.access).toBe(false);
    expect(report.valid).toBe(false);
    expect(report.reasons).toContain('A carroça não alcança este sítio por terra');
  });

  it('exige o kit completo e não considera acesso quando a origem é desconhecida', () => {
    expect(evaluateCapitalSite({ x: 30, z: 30 }, open, { kit: { wood: 399, stone: 200 } }).kit).toBe(false);
    expect(evaluateCapitalSite({ x: 30, z: 30 }, open, { kit: { wood: 400, stone: 199 } }).valid).toBe(false);
    expect(evaluateCapitalSite({ x: 30, z: 30 }, open).access).toBe(true);
  });

  it('carroça já no sítio tem acesso garantido (sem caminho a percorrer)', () => {
    const report = evaluateCapitalSite({ x: 30, z: 30 }, open, { from: { x: 30.2, z: 30 }, kit });
    expect(report.access).toBe(true);
    expect(report.valid).toBe(true);
  });

  it('exige sítio explorado quando há névoa e ignora a névoa quando ela não é informada', () => {
    const fogged = { ...open, isDiscovered: (x: number) => x < 35 };
    expect(evaluateCapitalSite({ x: 30, z: 30 }, fogged).discovered).toBe(true);
    const unseen = evaluateCapitalSite({ x: 40, z: 30 }, fogged);
    expect(unseen).toMatchObject({ discovered: false, valid: false });
    expect(unseen.reasons).toContain('Sítio ainda não explorado');
    expect(evaluateCapitalSite({ x: 40, z: 30 }, open).discovered).toBe(true);
  });
});

