import type { RecipeDef } from './types';

/** Serralheria: carvão vegetal queimado da lenha (2 de lenha por carvão); combustível que permite fundir no Bronze. */
export const charcoalFromFirewood = {
  id: 'charcoal-from-firewood',
  name: 'Carvão vegetal',
  station: 'sawmill',
  mode: 'contínua',
  inputs: [{ item: 'firewood', amount: 0.1 }],
  outputs: [{ item: 'charcoal', amount: 0.05 }],
  craft: 'carpintaria',
  requires: { era: 'bronze', craftLevel: 2 },
} as const satisfies RecipeDef;
