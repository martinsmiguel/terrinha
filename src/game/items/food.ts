import type { ItemDef } from './types';

export const food = {
  id: 'food', name: 'Comida', short: 'C', era: 'pedra', source: 'coleta',
  tags: ['comida', 'bruto', 'comercializável'], chipClass: 'text-red-300 font-bold',
} as const satisfies ItemDef;
