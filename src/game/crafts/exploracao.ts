import type { CraftDef } from './types';

export const exploracao = { id: 'exploracao', name: 'Exploração', learnedBy: 'Descobrir regiões, plantas e monumentos', studyCost: { food: 40, gold: 30 } } as const satisfies CraftDef;
