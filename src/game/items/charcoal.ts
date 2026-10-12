import type { ItemDef } from './types';

export const charcoal = {
  id: 'charcoal', name: 'Carvão vegetal', short: 'V', era: 'bronze', source: 'refino',
  tags: ['refinado', 'combustível'], chipClass: 'text-slate-300 font-bold',
} as const satisfies ItemDef;
