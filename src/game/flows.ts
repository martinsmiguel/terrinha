import type { GameState } from './model';

export const FLOW_WINDOW_SECONDS = 60;
export const FLOW_SAMPLE_SECONDS = 1;
const KEYS = ['wood', 'food', 'gold', 'stone', 'planks'] as const;
export type FlowKey = (typeof KEYS)[number] | 'pop';

type Bag = Record<FlowKey, number>;
const empty = (): Bag => ({ wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: 0 });

export interface FlowSample {
  /** Segundos de partida simulados no instante da amostra. */
  t: number;
  /** Total do império: metrópole + colônias + carga em trânsito (transferência interna não muda o total). */
  total: Bag;
  home: Bag;
  /** Soma dos estoques locais das colônias. */
  colonies: Bag;
  /** Carga a bordo dos barcos (carregar/descarregar move entre estoque e porão, não cria nem perde). */
  transit: Bag;
  /** Estoque local por ilha, para a taxa de cada localidade. */
  byLocality: Record<string, Bag>;
}

/** Amostra o estado real do jogador: nada demonstrativo. */
export function sampleFlows(state: Pick<GameState, 'playerResources' | 'localStocks' | 'units' | 'elapsed'>, owner: string): FlowSample {
  const res = state.playerResources[owner];
  const home = empty();
  if (res) { KEYS.forEach((k) => { home[k] = res[k]; }); home.pop = res.pop; }
  const colonies = empty();
  const byLocality: Record<string, Bag> = {};
  for (const [locality, stock] of Object.entries(state.localStocks?.[owner] ?? {})) {
    const bag = empty();
    KEYS.forEach((k) => { bag[k] = stock[k]; colonies[k] += stock[k]; });
    byLocality[locality] = bag;
  }
  const transit = empty();
  for (const unit of state.units) {
    if (unit.owner !== owner || !unit.cargo) continue;
    KEYS.forEach((k) => { transit[k] += unit.cargo![k] ?? 0; });
    if (unit.kit) { transit.wood += 150; transit.stone += 50; }
  }
  const total = empty();
  (Object.keys(total) as FlowKey[]).forEach((k) => { total[k] = home[k] + colonies[k] + transit[k]; });
  return { t: state.elapsed ?? 0, total, home, colonies, transit, byLocality };
}

/** Mantém as amostras da janela de 60 s (uma por segundo simulado) e descarta as mais antigas. */
export function pushSample(samples: readonly FlowSample[], next: FlowSample): FlowSample[] {
  const last = samples[samples.length - 1];
  if (last && next.t - last.t < FLOW_SAMPLE_SECONDS) return samples as FlowSample[];
  // Relógio recuou (nova partida): recomeça a janela.
  const base = last && next.t < last.t ? [] : samples;
  return [...base, next].filter((sample) => next.t - sample.t <= FLOW_WINDOW_SECONDS);
}

export interface FlowRate { perMinute: number | null; /** Janela usada, em segundos. */ seconds: number; partial: boolean }

/** Fluxo líquido = (créditos − débitos) / tempo simulado × 60, na janela de até 60 s; sem amostra suficiente devolve null. */
export function netRate(samples: readonly FlowSample[], pick: (sample: FlowSample) => number): FlowRate {
  if (samples.length < 2) return { perMinute: null, seconds: 0, partial: true };
  const first = samples[0];
  const last = samples[samples.length - 1];
  const seconds = last.t - first.t;
  if (seconds <= 0) return { perMinute: null, seconds: 0, partial: true };
  return { perMinute: ((pick(last) - pick(first)) / seconds) * 60, seconds, partial: seconds < FLOW_WINDOW_SECONDS };
}

export interface FlowRow {
  key: FlowKey;
  /** Império inteiro (agregado). */
  empire: FlowRate;
  /** Metrópole (saldo da natal). */
  home: FlowRate;
  /** Colônias (estoques locais somados). */
  colonies: FlowRate;
  /** Carga em trânsito: não é produção nem perda do império, só a travessia. */
  transit: FlowRate;
}

export const FLOW_KEYS: readonly FlowKey[] = [...KEYS, 'pop'];

export function flowRows(samples: readonly FlowSample[]): FlowRow[] {
  return FLOW_KEYS.map((key) => ({
    key,
    empire: netRate(samples, (s) => s.total[key]),
    home: netRate(samples, (s) => s.home[key]),
    colonies: netRate(samples, (s) => s.colonies[key]),
    transit: netRate(samples, (s) => s.transit[key]),
  }));
}

/** Taxa de uma localidade colonial: entrada/saída de carga e gastos locais aparecem aqui, não no império. */
export function localityRate(samples: readonly FlowSample[], locality: string, key: FlowKey): FlowRate {
  return netRate(samples, (s) => s.byLocality[locality]?.[key] ?? 0);
}
