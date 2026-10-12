import type { DecorationDef } from './types';

export const fountain = {
  id: 'fountain', name: 'Fonte de pedra', era: 'ferro', cost: { stone: 80, gold: 20 },
  footprint: { width: 2, depth: 2 }, shape: 'fonte', description: 'Fonte lavrada para a praça da vila.',
} as const satisfies DecorationDef;
