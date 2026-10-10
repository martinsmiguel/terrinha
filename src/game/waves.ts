/**
 * Ondas de Gerstner (soma de senoides) compartilhadas por CPU, malha da água e flutuação dos barcos. A superfície é uma função
 * pura de (x, z, t): a malha e os cascos usam esta mesma função, com o tempo da partida do host (`elapsed`). A onda é só visual:
 * navegação, calado e apoio terrestre não leem este módulo.
 */
export interface WaveParams { dirX: number; dirZ: number; amplitude: number; wavelength: number; speed: number; steepness: number }

/** Quatro ondas (valores a revisar com o mestre): direções, amplitudes e comprimentos diferentes para não repetir o padrão. */
export const WAVES: readonly WaveParams[] = [
  { dirX: 1, dirZ: 0.2, amplitude: 0.06, wavelength: 9, speed: 1.1, steepness: 0.5 },
  { dirX: 0.5, dirZ: 1, amplitude: 0.04, wavelength: 6, speed: 0.9, steepness: 0.4 },
  { dirX: -0.7, dirZ: 0.6, amplitude: 0.025, wavelength: 3.5, speed: 1.4, steepness: 0.3 },
  { dirX: 0.2, dirZ: -1, amplitude: 0.015, wavelength: 2.2, speed: 1.7, steepness: 0.25 },
];

const GRAVITY_LIKE = 9.8;

export interface WaveSample {
  /** Altura da superfície (deslocamento vertical) no ponto. */
  height: number;
  /** Normal unitária da superfície. */
  normal: { x: number; y: number; z: number };
}

/** Altura e normal da superfície no ponto (x, z) e no tempo t (segundos da partida). Pura e determinística. */
export function waveAt(x: number, z: number, t: number, waves: readonly WaveParams[] = WAVES): WaveSample {
  let height = 0;
  let dhdx = 0;
  let dhdz = 0;
  for (const wave of waves) {
    const length = Math.hypot(wave.dirX, wave.dirZ) || 1;
    const dx = wave.dirX / length;
    const dz = wave.dirZ / length;
    const k = (2 * Math.PI) / wave.wavelength;
    const omega = Math.sqrt(GRAVITY_LIKE * k) * wave.speed;
    const phase = k * (dx * x + dz * z) - omega * t;
    height += wave.amplitude * Math.sin(phase);
    const slope = wave.amplitude * k * Math.cos(phase) * wave.steepness * 2;
    dhdx += slope * dx;
    dhdz += slope * dz;
  }
  const inv = 1 / Math.hypot(dhdx, 1, dhdz);
  return { height, normal: { x: -dhdx * inv, y: inv, z: -dhdz * inv } };
}

/** Inclinação visual do casco a partir da normal: pitch (eixo X) e roll (eixo Z), em radianos. Só cosmético. */
export function hullTilt(normal: WaveSample['normal'], heading: number): { pitch: number; roll: number } {
  // Projeta a normal no referencial do casco (proa em `heading`).
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const forward = normal.x * fx + normal.z * fz;
  const side = normal.x * fz - normal.z * fx;
  return { pitch: Math.atan2(forward, normal.y), roll: Math.atan2(side, normal.y) };
}

/** Quanto a onda levanta o casco: fração da altura, para o barco flutuar sem sair da água. */
export const HULL_RISE = 0.6;
