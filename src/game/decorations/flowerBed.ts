import type { DecorationDef } from './types';

export const flowerBed = {
  id: 'flower_bed', name: 'Canteiro de flores', era: 'pedra', cost: { wood: 15 },
  footprint: { width: 2, depth: 1 }, shape: 'canteiro', description: 'Flores do campo em moldura de troncos.', beauty: 2, radius: 5,
} as const satisfies DecorationDef;
