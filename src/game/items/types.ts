import type { Era } from '../tech';

/**
 * Item do império: recurso bruto (coletado) ou refinado (produzido por receita). Um arquivo por item em `src/game/items/`,
 * registrado em `index.ts`. As etiquetas agrupam itens para receitas genéricas ("qualquer combustível") e para extensões
 * de conteúdo (ex.: `arcano`) sem mudar o núcleo.
 */
export interface ItemDef {
  id: string;
  /** Nome exibido. */
  name: string;
  /** Abreviação de uma letra nos chips de custo. */
  short: string;
  /** Era em que o item passa a existir. */
  era: Era;
  /** `coleta`: vem do mapa; `refino`: só sai de receita. */
  source: 'coleta' | 'refino';
  tags: readonly string[];
  /** Item de base: todo saldo o tem (os demais são opcionais no saldo e valem 0 quando ausentes). */
  core?: true;
  /** Classe de cor do chip de custo na interface. */
  chipClass: string;
}
