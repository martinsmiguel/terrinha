import type { CraftDef } from './types';

export const colonizacao = { id: 'colonizacao', name: 'Colonização', learnedBy: 'Fundar capital e postos avançados', studyCost: { wood: 50, food: 50 } } as const satisfies CraftDef;
