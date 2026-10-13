import type { DecorationDef } from './types';

export const banner = {
  id: 'banner', name: 'Estandarte', era: 'medieval', cost: { wood: 40, gold: 30 },
  footprint: { width: 1, depth: 2 }, shape: 'estandarte', description: 'Mastro com as cores do império.', beauty: 2, radius: 6,
} as const satisfies DecorationDef;
