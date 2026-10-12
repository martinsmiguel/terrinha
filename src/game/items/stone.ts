import type { ItemDef } from './types';

export const stone = {
  id: 'stone', name: 'Pedra', short: 'P', era: 'colonial', source: 'coleta',
  tags: ['pedra', 'bruto', 'construção', 'comercializável'], chipClass: 'text-slate-300 font-bold',
} as const satisfies ItemDef;
