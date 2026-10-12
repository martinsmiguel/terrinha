import type { RecipeDef } from './types';

/** Serralheria: 0,1 de madeira vira 0,05 de tábua por passo, por serralheria concluída (os números de antes do registro). */
export const planksFromWood = {
  id: 'planks-from-wood',
  name: 'Tábuas',
  station: 'sawmill',
  mode: 'contínua',
  inputs: [{ item: 'wood', amount: 0.1 }],
  outputs: [{ item: 'planks', amount: 0.05 }],
  craft: 'carpintaria',
  requires: { era: 'pedra', craftLevel: 1 },
} as const satisfies RecipeDef;
