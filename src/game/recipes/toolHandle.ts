import type { RecipeDef } from './types';

/** Serralheria: cabo de ferramenta entalhado da madeira (5 de madeira por cabo); pede Carpintaria 2. */
export const toolHandleFromWood = {
  id: 'tool-handle-from-wood',
  name: 'Cabo de ferramenta',
  station: 'sawmill',
  mode: 'contínua',
  inputs: [{ item: 'wood', amount: 0.1 }],
  outputs: [{ item: 'tool_handle', amount: 0.02 }],
  craft: 'carpintaria',
  requires: { era: 'pedra', craftLevel: 2 },
} as const satisfies RecipeDef;
