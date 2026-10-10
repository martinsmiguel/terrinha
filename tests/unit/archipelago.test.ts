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

  it('sempre cria seis ilhas: quatro natais com perfis distintos e duas neutras', () => {
    SEEDS.forEach((seed) => {
      const layout = computeArchipelago(60, seed);
      expect(layout.islands).toHaveLength(6);
      const natives = layout.islands.filter((i) => i.kind === 'native');
      const neutrals = layout.islands.filter((i) => i.kind === 'neutral');
      expect(natives.map((i) => i.index)).toEqual([0, 1, 2, 3]);
      expect(neutrals.map((i) => i.index)).toEqual([4, 5]);
      const profiles = natives.map((i) => i.profile);
      expect(new Set(profiles).size).toBe(4);
      expect(profiles).toContain('floresta');
    });
  });

  it('as ilhas neutras ficam entre as natais sem encostar nelas, em qualquer tamanho de mundo', () => {
    for (const size of [60, 192, 768]) {
      for (const seed of SEEDS) {
        const { islands } = computeArchipelago(size, seed);
        for (let a = 0; a < islands.length; a += 1) {
          for (let b = a + 1; b < islands.length; b += 1) {
            const gap = Math.hypot(islands[a].center.x - islands[b].center.x, islands[a].center.z - islands[b].center.z)
              - islands[a].baseRadius - islands[b].baseRadius;
            expect(gap, `${size} seed ${seed}: ilhas ${a} e ${b}`).toBeGreaterThan(0);
          }
        }
        for (const island of islands) {
          expect(island.center.x - island.baseRadius).toBeGreaterThan(0);
          expect(island.center.z - island.baseRadius).toBeGreaterThan(0);
          expect(island.center.x + island.baseRadius).toBeLessThan(size);
          expect(island.center.z + island.baseRadius).toBeLessThan(size);
        }
      }
    }
  });

  it('em 768 as ilhas natais têm diâmetro dentro da faixa de 160 a 220', () => {
    SEEDS.forEach((seed) => {
      for (const island of computeArchipelago(768, seed).islands.filter((i) => i.kind === 'native')) {
        expect(island.baseRadius * 2).toBeGreaterThanOrEqual(160);
        expect(island.baseRadius * 2).toBeLessThanOrEqual(220);
      }
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
    expect(layout.islands.filter((i) => i.kind === 'native').map((i) => i.spawn)).toEqual([
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
