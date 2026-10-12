import type { CraftDef } from './types';

export const agricultura = { id: 'agricultura', name: 'Agricultura', learnedBy: 'Colher comida em terra', studyCost: { food: 60, gold: 20 } } as const satisfies CraftDef;
