import type { Building, GameState, Unit } from './model';
import { isBoatUnit } from './model';
import { canTarget, type OwnerVision } from './visionAuthority';
import { launchNaval, navalBlocker, overseasTarget, stepNaval, type NavalEnv } from './botNaval';

export type BotProfile = 'peaceful' | 'defensive' | 'raids';
export const DEFAULT_BOT_PROFILE: BotProfile = 'defensive';
export const BOT_PROFILE_LABEL: Record<BotProfile, string> = { peaceful: 'Pacífico', defensive: 'Defensivo', raids: 'Incursões' };

/** Defaults revisados (variáveis): graça de 300 s após a capital, tentativa entre 180 e 300 s, grupo de 3 a 6, uma incursão por vez, retirada com 35% de perdas. */
export const BOT = {
  graceSeconds: 300, attemptMin: 180, attemptMax: 300, groupMin: 3, groupMax: 6, retreatLoss: 0.35,
  defenseRadius: 14, chaseLeash: 22, raidReach: 26,
} as const;

export interface BotClock {
  /** Instante (partida) em que a capital do bot concluiu; começa a graça. */
  capitalAt?: number;
  nextRaidAt?: number;
  raid?: { ids: string[]; startedAt: number; startCount: number; targetId: string };
  /** Incursão por mar em andamento (cais, barco, embarque, travessia, pouso) e a contagem de lançadas, perdidas e abortadas. */
  naval?: NavalRaid;
  navalStats?: { launched: number; lost: number; aborted: number };
  attempts: number;
}

export interface NavalRaid {
  phase: 'embark' | 'sail' | 'land';
  boatId: string;
  ids: string[];
  targetId: string;
  landing: { x: number; z: number };
  startedAt: number;
  phaseAt: number;
}

export type BotCommand =
  | { type: 'attack'; unitId: string; targetId: string }
  | { type: 'move'; unitId: string; target: { x: number; z: number } }
  | { type: 'embark'; unitIds: string[]; boatId: string }
  | { type: 'disembark'; boatId: string };

export interface BotPlan { commands: BotCommand[]; clock: BotClock; notes: string[] }

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);
const isMilitary = (unit: Unit): boolean => (unit.type === 'soldier' || unit.type === 'cavalry') && unit.health > 0 && !isBoatUnit(unit.type);

/** Intervalo determinístico entre tentativas de incursão (180 a 300 s) a partir do número da tentativa. */
export const attemptGap = (slot: string, attempt: number): number => {
  let h = 17;
  for (const ch of `${slot}:${attempt}`) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const t = ((h >>> 0) % 1000) / 1000;
  return BOT.attemptMin + t * (BOT.attemptMax - BOT.attemptMin);
};

/**
 * Plano do bot a partir do que ele PODE saber: alvos só se `canTarget` (visíveis para unidades, explorados para edifícios).
 * Devolve comandos no formato dos jogadores (para passarem pela mesma autorização do host) e o relógio atualizado.
 * Pacífico nunca inicia agressão; Defensivo só reage e solta a perseguição ao passar da coleira; Incursões respeita graça, ciclo e limites.
 */
export function planBot(
  state: Pick<GameState, 'units' | 'buildings'>, slot: string, profile: BotProfile, previous: BotClock | undefined,
  elapsed: number, vision: OwnerVision | undefined, canReach: (unit: Unit, goal: { x: number; z: number }) => boolean = () => true,
  naval?: NavalEnv
): BotPlan {
  const clock: BotClock = { attempts: 0, ...previous };
  const notes: string[] = [];
  const commands: BotCommand[] = [];
  const capital = state.buildings.find((b) => b.owner === slot && b.type === 'town_center' && b.health > 0);
  if (!capital || !capital.isComplete) return { commands, clock, notes };
  if (clock.capitalAt === undefined) clock.capitalAt = elapsed;
  const army = state.units.filter((u) => u.owner === slot && isMilitary(u));
  const enemyUnits = state.units.filter((u) => u.owner !== slot && u.health > 0 && !isBoatUnit(u.type) && canTarget(vision, slot, u, 'visible'));

  // Incursão por mar em andamento: cada fase tem prazo e motivo de aborto; enquanto ela dura, o plano terrestre espera.
  if (clock.naval) {
    const dock = state.buildings.find((b) => b.owner === slot && b.type === 'dock' && b.health > 0);
    const step = stepNaval(slot, clock, elapsed, state.units, state.buildings, dock?.position);
    return { commands: step.commands, clock: step.clock, notes: step.notes };
  }

  // Incursão em andamento: retirada com 35% de perdas ou fim quando o grupo acabou.
  if (clock.raid) {
    const alive = army.filter((u) => clock.raid!.ids.includes(u.id));
    if (alive.length === 0) { clock.raid = undefined; notes.push('incursão encerrada: grupo perdido'); }
    else if (alive.length <= clock.raid.startCount * (1 - BOT.retreatLoss)) {
      alive.forEach((unit) => commands.push({ type: 'move', unitId: unit.id, target: { x: capital.position.x + 3, z: capital.position.z + 3 } }));
      clock.raid = undefined; notes.push('retirada: perdas passaram de 35%');
    } else if (alive.every((u) => u.state === 'idle')) { clock.raid = undefined; notes.push('incursão concluída'); }
  }

  if (profile === 'peaceful') return { commands, clock, notes };

  // Defensivo (e Incursões também defendem): reage a inimigos visíveis perto da base e solta a perseguição passada a coleira.
  const home = capital.position;
  const threats = enemyUnits.filter((e) => dist(e.position, home) <= BOT.defenseRadius || army.some((u) => dist(u.position, e.position) <= BOT.defenseRadius / 2));
  const raiding = new Set(clock.raid?.ids ?? []);
  for (const unit of army) {
    if (raiding.has(unit.id)) continue;
    const away = dist(unit.position, home) > BOT.chaseLeash;
    if (away && (unit.state === 'attacking' || unit.state === 'moving')) {
      commands.push({ type: 'move', unitId: unit.id, target: { x: home.x + 3, z: home.z + 3 } });
      continue;
    }
    if (unit.state !== 'idle' || threats.length === 0) continue;
    const target = threats.reduce((best, e) => (dist(unit.position, e.position) < dist(unit.position, best.position) ? e : best));
    commands.push({ type: 'attack', unitId: unit.id, targetId: target.id });
  }

  if (profile !== 'raids') return { commands, clock, notes };

  // Incursões: só depois da graça, no ciclo, uma ativa, grupo de 3 a 6 reais, contra edifício já explorado e alcançável.
  const due = elapsed >= (clock.capitalAt + BOT.graceSeconds) && elapsed >= (clock.nextRaidAt ?? 0);
  if (!due || clock.raid) return { commands, clock, notes };
  clock.attempts += 1;
  clock.nextRaidAt = elapsed + attemptGap(slot, clock.attempts);
  const free = army.filter((u) => u.state === 'idle' && !raiding.has(u.id));
  if (free.length < BOT.groupMin) { notes.push('incursão adiada: sem tropas suficientes'); return { commands, clock, notes }; }
  const reachableByLand = (goal: { x: number; z: number }) => free.slice(0, BOT.groupMax).every((u) => canReach(u, goal));
  const targets = state.buildings.filter((b) => b.owner !== slot && b.health > 0 && canTarget(vision, slot, b, 'explored') && dist(b.position, home) <= BOT.raidReach)
    .sort((a, b) => dist(a.position, home) - dist(b.position, home));
  const group = free.slice(0, BOT.groupMax);
  const target = targets.find((b) => group.every((u) => canReach(u, b.position)));
  if (!target) {
    // Nada alcançável por terra: outra ilha só por cais, barco, embarque, travessia e desembarque.
    const overseas = naval ? overseasTarget(slot, state.buildings, vision, home, reachableByLand) : undefined;
    if (naval && overseas) {
      const blocker = navalBlocker(slot, state.units, state.buildings, overseas, free, naval);
      if (blocker.reason || !blocker.boat || !blocker.landing) { notes.push(`incursão naval adiada: ${blocker.reason}`); return { commands, clock, notes }; }
      const launched = launchNaval(clock, elapsed, free, blocker.boat, overseas, blocker.landing);
      return { commands: launched.commands, clock: launched.clock, notes: launched.notes };
    }
    notes.push('incursão adiada: sem alvo conhecido e alcançável');
    return { commands, clock, notes };
  }
  group.forEach((unit) => commands.push({ type: 'attack', unitId: unit.id, targetId: target.id }));
  clock.raid = { ids: group.map((u) => u.id), startedAt: elapsed, startCount: group.length, targetId: target.id };
  notes.push(`incursão iniciada com ${group.length} contra ${target.type}`);
  return { commands, clock, notes };
}

export type BotClocks = Record<string, BotClock>;
export type BuildingLike = Building;
