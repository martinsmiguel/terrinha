import type { CraftDef } from './types';

export const mineracao = { id: 'mineracao', name: 'Mineração e Metalurgia', learnedBy: 'Extrair ouro e, nas eras seguintes, metais', studyCost: { wood: 40, gold: 40 } } as const satisfies CraftDef;
