import type { CraftDef } from './types';

export const guerra = { id: 'guerra', name: 'Guerra', learnedBy: 'Causar dano em combate', studyCost: { food: 40, gold: 40 } } as const satisfies CraftDef;
