import type { ItemDef } from './types';

export const planks = {
  id: 'planks', core: true, name: 'Tábuas', short: 'T', era: 'pedra', source: 'refino',
  tags: ['madeira', 'refinado', 'construção'], chipClass: 'text-orange-300 font-bold',
} as const satisfies ItemDef;
