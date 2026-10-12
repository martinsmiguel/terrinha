import type { RecipeDef } from './types';

/** Centro da Vila: ferramenta de pedra = 1 cabo + 5 de pedra (0,01 ferramenta por passo); treina Cantaria. */
export const stoneToolFromHandle = {
  id: 'stone-tool',
  name: 'Ferramenta de pedra',
  station: 'town_center',
  mode: 'contínua',
  inputs: [{ item: 'tool_handle', amount: 0.01 }, { item: 'stone', amount: 0.05 }],
  outputs: [{ item: 'stone_tool', amount: 0.01 }],
  craft: 'cantaria',
  requires: { era: 'pedra', craftLevel: 1 },
} as const satisfies RecipeDef;
