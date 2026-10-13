import type { ItemId } from '../items';
import type { Era } from '../tech';

/**
 * Enfeite das ilhas (card #180): peça de decoração com era, custo e área. Um arquivo por enfeite em
 * `src/game/decorations/`, registrado em `index.ts`. Sem efeito de jogo além do custo nesta fatia.
 */
export interface DecorationDef {
  id: string;
  name: string;
  /** Era a partir da qual o enfeite pode ser posto. */
  era: Era;
  cost: Partial<Record<ItemId, number>>;
  /** Área ocupada (largura em x e profundidade em z, sem girar). */
  footprint: { width: number; depth: number };
  /** Forma da peça no mundo (desenho provisório, sem arte final). */
  shape: 'canteiro' | 'menir' | 'braseiro' | 'fonte' | 'estandarte' | 'muda';
  description: string;
  /** Beleza irradiada (#206) e o raio, em células; casas e produção por perto rendem mais. */
  beauty: number;
  radius: number;
  /** `arvore`: plantar uma muda que cresce e vira árvore cortável (#207), em vez de um enfeite fixo. */
  kind?: 'arvore';
}
