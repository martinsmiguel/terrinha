import type { DecorationDef } from './types';

export const menhir = {
  id: 'menhir', name: 'Menir', era: 'pedra', cost: { stone: 30 },
  footprint: { width: 1, depth: 1 }, shape: 'menir', description: 'Pedra erguida que marca o território.', beauty: 1, radius: 4,
} as const satisfies DecorationDef;
