import type { ResourceCost } from '../economy';

/**
 * Ofício (ou saber) do império: evolui pelo trabalho (eventos reais da partida) e pelo estudo pago. O conhecimento é do
 * império, não de cada aldeão. Um arquivo por ofício em `src/game/crafts/`, registrado em `index.ts`.
 */
export interface CraftDef {
  id: string;
  name: string;
  /** O que treina o ofício na partida (texto de interface). */
  learnedBy: string;
  /** Custo base de uma sessão de estudo no nível 1; cresce com o nível. */
  studyCost: ResourceCost;
}
