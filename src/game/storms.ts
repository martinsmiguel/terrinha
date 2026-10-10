import type { GameState, Unit } from './model';
import { isBoatUnit } from './model';

/** Defaults revisados: 30 s de duração, raio 12, uma tentativa a cada 180 s, aviso de 10 s e 2 HP/s de dano naval. */
export const STORM = { durationSeconds: 30, radius: 12, attemptSeconds: 180, warningSeconds: 10, damagePerSecond: 2, chance: 0.6, severity: 1 } as const;

export interface Storm {
  /** Número da tentativa (id estável para evitar evento repetido). */
  id: number;
  center: { x: number; z: number };
  radius: number;
  /** Segundos da partida em que o aviso começa, em que a tempestade começa e em que termina. */
  warnAt: number;
  startsAt: number;
  endsAt: number;
  severity: number;
}

export type StormPhase = 'warning' | 'active';

/** Gerador determinístico pela semente do mundo e pelo número da tentativa. */
function unitRandom(seed: number, attempt: number, salt: number): number {
  let h = (seed ^ (attempt * 2654435761) ^ (salt * 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Tentativa `attempt` (a cada 180 s): decide por sorteio determinístico se há tempestade e onde, em mar aberto. Devolve null
 * se o sorteio não pede tempestade ou se não achou oceano em algumas tentativas de ponto.
 */
export function stormForAttempt(
  attempt: number, seed: number, mapSize: number, isOcean: (x: number, z: number) => boolean
): Storm | null {
  if (attempt < 1 || unitRandom(seed, attempt, 1) > STORM.chance) return null;
  for (let tries = 0; tries < 12; tries += 1) {
    const x = 2 + unitRandom(seed, attempt, 10 + tries * 2) * (mapSize - 4);
    const z = 2 + unitRandom(seed, attempt, 11 + tries * 2) * (mapSize - 4);
    if (!isOcean(x, z)) continue;
    const startsAt = attempt * STORM.attemptSeconds;
    return { id: attempt, center: { x, z }, radius: STORM.radius, warnAt: startsAt - STORM.warningSeconds, startsAt, endsAt: startsAt + STORM.durationSeconds, severity: STORM.severity };
  }
  return null;
}

/** Fase da tempestade no instante `elapsed`: aviso, ativa ou nenhuma (ainda não começou ou já acabou). */
export function stormPhase(storm: Storm | undefined, elapsed: number): StormPhase | null {
  if (!storm) return null;
  if (elapsed >= storm.startsAt && elapsed < storm.endsAt) return 'active';
  if (elapsed >= storm.warnAt && elapsed < storm.startsAt) return 'warning';
  return null;
}

/** Escolhe a tempestade do relógio: a da tentativa vigente (ou a do aviso da próxima), sem criar duas ao mesmo tempo. */
export function stormAt(elapsed: number, seed: number, mapSize: number, isOcean: (x: number, z: number) => boolean): Storm | undefined {
  const attempt = Math.floor((elapsed + STORM.warningSeconds) / STORM.attemptSeconds);
  const storm = stormForAttempt(attempt, seed, mapSize, isOcean);
  return storm && stormPhase(storm, elapsed) ? storm : undefined;
}

const inside = (storm: Storm, unit: Unit): boolean => Math.hypot(unit.position.x - storm.center.x, unit.position.z - storm.center.z) <= storm.radius;

/** Dano naval por tick: só barcos vivos dentro do raio, só durante a fase ativa; terra e outros corpos não sofrem. */
export function applyStormDamage(units: readonly Unit[], storm: Storm | undefined, elapsed: number, dtSeconds: number): { units: Unit[]; sunk: string[] } {
  if (stormPhase(storm, elapsed) !== 'active') return { units: units as Unit[], sunk: [] };
  const sunk: string[] = [];
  const next = units.map((unit) => {
    if (!isBoatUnit(unit.type) || unit.health <= 0 || !inside(storm!, unit)) return unit;
    const health = Math.max(0, unit.health - STORM.damagePerSecond * storm!.severity * dtSeconds);
    if (health <= 0) sunk.push(unit.id);
    return { ...unit, health };
  });
  return { units: next, sunk };
}

export interface StormAlert { id: number; phase: StormPhase; text: string; focus: { x: number; z: number }; secondsLeft: number }

/**
 * Alerta do dono: só se a região é conhecida (centro explorado) ou se ele tem rota/barco próprio perto. O texto fala só da
 * região e das próprias rotas; nunca de frotas de outros jogadores nem de áreas desconhecidas.
 */
export function stormAlertFor(
  storm: Storm | undefined, elapsed: number, owner: string, units: readonly Unit[], isExplored: (x: number, z: number) => boolean
): StormAlert | null {
  const phase = stormPhase(storm, elapsed);
  if (!storm || !phase) return null;
  const known = isExplored(storm.center.x, storm.center.z);
  const ownNear = units.some((unit) => unit.owner === owner && isBoatUnit(unit.type) && unit.health > 0
    && Math.hypot(unit.position.x - storm.center.x, unit.position.z - storm.center.z) <= storm.radius + 10);
  const ownRoute = units.some((unit) => unit.owner === owner && unit.route && unit.health > 0
    && Math.hypot(unit.position.x - storm.center.x, unit.position.z - storm.center.z) <= storm.radius + 25);
  if (!known && !ownNear && !ownRoute) return null;
  const secondsLeft = Math.ceil(phase === 'warning' ? storm.startsAt - elapsed : storm.endsAt - elapsed);
  const text = phase === 'warning'
    ? `Tempestade em ${secondsLeft} s perto de (${Math.round(storm.center.x)}, ${Math.round(storm.center.z)}): afaste seus barcos${ownRoute ? ' e revise as rotas' : ''}.`
    : `Tempestade ativa por mais ${secondsLeft} s em (${Math.round(storm.center.x)}, ${Math.round(storm.center.z)}); barcos dentro do raio sofrem dano.`;
  return { id: storm.id, phase, text, focus: { ...storm.center }, secondsLeft };
}

export type StormState = GameState['storm'];
