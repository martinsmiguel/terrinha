import type { DecorationDef } from './types';

export const brazier = {
  id: 'brazier', name: 'Braseiro de bronze', era: 'bronze', cost: { stone: 20, firewood: 10 },
  footprint: { width: 1, depth: 1 }, shape: 'braseiro', description: 'Fogo aceso em bacia de bronze; queima lenha.',
} as const satisfies DecorationDef;
