import type { CraftDef } from './types';

export const navegacao = { id: 'navegacao', name: 'Navegação', learnedBy: 'Pescar e levar carga por mar', studyCost: { wood: 60, gold: 30 } } as const satisfies CraftDef;
