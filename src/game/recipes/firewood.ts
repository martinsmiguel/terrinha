import type { RecipeDef } from './types';

/** Serralheria: lenha (combustível) rachada da madeira, 1 para 1, 0,1 por passo por serralheria. */
export const firewoodFromWood = {
  id: 'firewood-from-wood',
  name: 'Lenha',
  station: 'sawmill',
  mode: 'contínua',
  inputs: [{ item: 'wood', amount: 0.1 }],
  outputs: [{ item: 'firewood', amount: 0.1 }],
  craft: 'carpintaria',
  requires: { era: 'pedra', craftLevel: 1 },
} as const satisfies RecipeDef;
