import type { ItemDef } from './types';

export const stoneTool = {
  id: 'stone_tool', name: 'Ferramenta de pedra', short: 'F', era: 'pedra', source: 'refino',
  tags: ['ferramenta', 'refinado'], chipClass: 'text-stone-300 font-bold',
} as const satisfies ItemDef;
