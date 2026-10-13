import type { DecorationDef } from './types';

/** Muda de árvore (#207): cresce em uns 18 s e vira árvore que embeleza e pode ser cortada. */
export const sapling = {
  id: 'sapling', name: 'Plantar árvore', era: 'pedra', cost: { wood: 5, food: 5 },
  footprint: { width: 1, depth: 1 }, shape: 'muda', description: 'Muda que cresce até virar árvore.', beauty: 1, radius: 4, kind: 'arvore',
} as const satisfies DecorationDef;
