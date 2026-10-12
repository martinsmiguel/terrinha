import type { CraftDef } from './types';

export const cantaria = { id: 'cantaria', name: 'Cantaria', learnedBy: 'Extrair pedra', studyCost: { stone: 40, gold: 20 } } as const satisfies CraftDef;
