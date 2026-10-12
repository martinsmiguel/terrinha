import type { ItemDef } from './types';

export const firewood = {
  id: 'firewood', name: 'Lenha', short: 'L', era: 'pedra', source: 'refino',
  tags: ['madeira', 'refinado', 'combustível'], chipClass: 'text-orange-400 font-bold',
} as const satisfies ItemDef;
