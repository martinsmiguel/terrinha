import type { ItemDef } from './types';

export const toolHandle = {
  id: 'tool_handle', name: 'Cabo de ferramenta', short: 'K', era: 'pedra', source: 'refino',
  tags: ['madeira', 'refinado', 'peça'], chipClass: 'text-yellow-600 font-bold',
} as const satisfies ItemDef;
