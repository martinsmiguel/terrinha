import type { ItemDef } from './types';

export const gold = {
  id: 'gold', core: true, name: 'Ouro', short: 'O', era: 'pedra', source: 'coleta',
  tags: ['metal', 'moeda', 'bruto'], chipClass: 'text-yellow-300 font-bold',
} as const satisfies ItemDef;
