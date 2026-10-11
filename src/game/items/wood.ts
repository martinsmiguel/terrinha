import type { ItemDef } from './types';

export const wood = {
  id: 'wood', name: 'Madeira', short: 'M', era: 'colonial', source: 'coleta',
  tags: ['madeira', 'bruto', 'construção', 'comercializável'], chipClass: 'text-amber-400 font-bold',
} as const satisfies ItemDef;
