import { MAP_SIZE } from './model';

/** Limites aceitos para a dimensão do mundo (lado, em células). 340 não é teto; 1024 é o limite de segurança atual. */
export const WORLD_SIZE_MIN = MAP_SIZE;
export const WORLD_SIZE_MAX = 1024;

/** Mundo padrão do lobby: as ilhas têm ~21x a área das de 60 ((280/60)^2 = 21,8), medido em tests/unit/worldViability.test.ts. */
export const DEFAULT_WORLD_SIZE = 280;

export interface WorldSizeOption {
  size: number;
  label: string;
  /** Situação do tamanho: validado para jogar ou ainda experimental. */
  status: 'validado' | 'experimental';
  note: string;
}

/** Tamanhos oferecidos no lobby. Validados: 60 (card #52) e 280 (card #161, ordem em massa medida em 36 ms). */
export const WORLD_SIZE_OPTIONS: readonly WorldSizeOption[] = [
  { size: 60, label: 'Pequeno (60)', status: 'validado', note: 'Ilhas pequenas, partida rápida.' },
  { size: 120, label: 'Médio (120)', status: 'experimental', note: 'Ilhas com o dobro do diâmetro.' },
  { size: 192, label: 'Grande (192)', status: 'experimental', note: 'Espaço para expansão; ordem para 120 unidades de uma vez ainda cabe no passo de 50 ms.' },
  { size: 280, label: 'Ilhas grandes (280)', status: 'validado', note: 'Padrão: ilhas com cerca de 21 vezes a área das de 60; ordem para 120 unidades de uma vez cabe no passo de 50 ms (medido 36 ms).' },
  { size: 384, label: 'Enorme (384)', status: 'experimental', note: 'Ordem em massa passa de 50 ms (medido 82 ms): pode haver engasgos até os cards #77 e #78.' },
  { size: 768, label: 'Experimental (768)', status: 'experimental', note: 'Dimensão-alvo do produto; ordem em massa medida em 135 ms, sem garantia de desempenho.' },
];

/** Lê um tamanho de mundo vindo de fora (JSON, rede, armazenamento): inteiro dentro dos limites ou o padrão. */
export function parseWorldSize(value: unknown, fallback: number = MAP_SIZE): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= WORLD_SIZE_MIN && value <= WORLD_SIZE_MAX ? value : fallback;
}
