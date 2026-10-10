import { MAP_SIZE } from './model';

/** Limites aceitos para a dimensão do mundo (lado, em células). 340 não é teto; 1024 é o limite de segurança atual. */
export const WORLD_SIZE_MIN = MAP_SIZE;
export const WORLD_SIZE_MAX = 1024;

export interface WorldSizeOption {
  size: number;
  label: string;
  /** Situação do tamanho: validado para jogar ou ainda experimental. */
  status: 'validado' | 'experimental';
  note: string;
}

/** Tamanhos oferecidos no lobby. Só 60 tem o passo completo da simulação validado (ver card #52). */
export const WORLD_SIZE_OPTIONS: readonly WorldSizeOption[] = [
  { size: 60, label: 'Padrão (60)', status: 'validado', note: 'Ilhas pequenas, partida rápida.' },
  { size: 120, label: 'Médio (120)', status: 'experimental', note: 'Ilhas com o dobro do diâmetro.' },
  { size: 192, label: 'Grande (192)', status: 'experimental', note: 'Espaço para expansão por colônias.' },
  { size: 384, label: 'Enorme (384)', status: 'experimental', note: 'Distâncias longas; rotas e rede ainda sem otimização.' },
  { size: 768, label: 'Experimental (768)', status: 'experimental', note: 'Dimensão-alvo do produto; sem garantia de desempenho.' },
];

/** Lê um tamanho de mundo vindo de fora (JSON, rede, armazenamento): inteiro dentro dos limites ou o padrão. */
export function parseWorldSize(value: unknown, fallback: number = MAP_SIZE): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= WORLD_SIZE_MIN && value <= WORLD_SIZE_MAX ? value : fallback;
}
