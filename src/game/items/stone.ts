import type { ItemDef } from './types';

export const stone = {
  id: 'stone', core: true, name: 'Pedra', short: 'P', era: 'pedra', source: 'coleta',
  tags: ['pedra', 'bruto', 'construção', 'comercializável'], chipClass: 'text-slate-300 font-bold',
} as const satisfies ItemDef;
