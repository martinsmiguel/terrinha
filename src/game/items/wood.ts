import type { ItemDef } from './types';

export const wood = {
  id: 'wood', core: true, name: 'Madeira', short: 'M', era: 'pedra', source: 'coleta',
  tags: ['madeira', 'bruto', 'construção', 'comercializável'], chipClass: 'text-amber-400 font-bold',
} as const satisfies ItemDef;
