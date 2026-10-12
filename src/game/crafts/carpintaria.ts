import type { CraftDef } from './types';

export const carpintaria = { id: 'carpintaria', name: 'Carpintaria', learnedBy: 'Cortar madeira e refinar tábuas', studyCost: { wood: 60, gold: 20 } } as const satisfies CraftDef;
