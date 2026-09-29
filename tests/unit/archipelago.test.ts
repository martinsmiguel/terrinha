import { describe, expect, it } from 'vitest';
import {
  computeArchipelago,
  resourcePlanFor,
  type IslandProfile,
} from '../../src/game/archipelago';

const SEEDS = [24680, 13579, 777, 424242, 31337];

describe('computeArchipelago', () => {
  it('produz o mesmo layout para a mesma semente', () => {
    const first = computeArchipelago(60, 24680);
    const second = computeArchipelago(60, 24680);
    expect(first).toEqual(second);
  });

  it('muda o layout quando a semente muda', () => {
    const first = computeArchipelago(60, 24680);
    const second = computeArchipelago(60, 13579);
    expect(JSON.stringify(first)).not.toEqual(JSON.stringify(second));
  });

  it('sempre cria quatro ilhas com quatro perfis distintos', () => {
    SEEDS.forEach((seed) => {
      const layout = computeArchipelago(60, seed);
      expect(layout.islands).toHaveLength(4);
      const profiles = layout.islands.map((i) => i.profile);
      expect(new Set(profiles).size).toBe(4);
      expect(profiles).toContain('floresta');
    });
  });

  it('garante lago e rio endorreico na ilha de floresta (regra dos barcos)', () => {
    SEEDS.forEach((seed) => {
      const layout = computeArchipelago(60, seed);
      const floresta = layout.islands.find((i) => i.profile === 'floresta');
      expect(floresta).toBeDefined();
      expect(floresta!.lakes.length).toBeGreaterThanOrEqual(1);
      expect(floresta!.river).toBeDefined();
      expect(floresta!.river!.points.length).toBeGreaterThan(10);
    });
  });

  it('nascedouros ficam no centro fixo de cada ilha', () => {
    const layout = computeArchipelago(60, 24680);
    expect(layout.islands.map((i) => i.spawn)).toEqual([
      { x: 16, z: 16 },
      { x: 44, z: 44 },
      { x: 16, z: 44 },
      { x: 44, z: 16 },
    ]);
    layout.islands.forEach((island) => {
      expect(island.spawn).toEqual(island.center);
    });
  });
});

describe('resourcePlanFor', () => {
  it('oferece misturas economicas distintas por perfil', () => {
    const profiles: IslandProfile[] = ['floresta', 'arida', 'glacial', 'montanhosa', 'ruintas'];
    const plans = profiles.map((p) => JSON.stringify(resourcePlanFor(p)));
    expect(new Set(plans).size).toBe(profiles.length);
  });

  it('floresta e rica em arvores e arida e rica em ouro', () => {
    const floresta = resourcePlanFor('floresta');
    const arida = resourcePlanFor('arida');
    expect(floresta.treeClusters * floresta.treesPerCluster).toBeGreaterThan(
      arida.treeClusters * arida.treesPerCluster
    );
    expect(arida.gold).toBeGreaterThan(floresta.gold);
  });
});
