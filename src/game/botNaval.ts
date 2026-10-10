import type { BotClock, BotCommand } from './bots';
import { COLONIAL_TRANSPORT } from './colonialTransport';
import type { Building, Unit } from './model';
import { canTarget, type OwnerVision } from './visionAuthority';

/** Prazos (segundos de partida) de cada fase; passando deles a incursão por mar é abortada e o grupo volta. */
export const NAVAL = { embarkSeconds: 60, sailSeconds: 240, landSeconds: 20, arrival: 4, landingSearch: 10, groupMin: 3, groupMax: 6 } as const;

export interface NavalEnv {
  /** Célula de oceano mais próxima de um ponto (ponto de pouso junto à ilha-alvo), ou null se o alvo não tem costa alcançável. */
  seaApproach(x: number, z: number): { x: number; z: number } | null;
}

export interface NavalPlan { commands: BotCommand[]; clock: BotClock; notes: string[] }

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);
const stats = (clock: BotClock) => clock.navalStats ?? { launched: 0, lost: 0, aborted: 0 };

/**
 * Pré-requisitos de uma incursão por mar: cais próprio concluído, transporte colonial vivo, alvo já explorado, ponto de pouso na costa
 * do alvo e tropas livres. Devolve o motivo do adiamento (texto) ou null quando pode partir.
 */
export function navalBlocker(
  slot: string, units: readonly Unit[], buildings: readonly Building[], target: Building | undefined, free: readonly Unit[], env: NavalEnv
): { reason: string | null; boat?: Unit; landing?: { x: number; z: number } } {
  if (!buildings.some((b) => b.owner === slot && b.type === 'dock' && b.isComplete && b.health > 0)) return { reason: 'sem cais concluído' };
  const boat = units.find((u) => u.owner === slot && u.type === 'colonial_transport' && u.health > 0 && (u.passengers?.length ?? 0) === 0);
  if (!boat) return { reason: 'sem transporte colonial' };
  if (!target) return { reason: 'sem alvo conhecido do outro lado' };
  if (free.length < NAVAL.groupMin) return { reason: 'sem tropas suficientes' };
  const landing = env.seaApproach(target.position.x, target.position.z);
  if (!landing) return { reason: 'sem ponto de pouso na costa do alvo (água funda)' };
  return { reason: null, boat, landing };
}

/** Escolhe o alvo do outro lado: edifício inimigo já explorado, o mais próximo, que o plano terrestre não alcança. */
export function overseasTarget(
  slot: string, buildings: readonly Building[], vision: OwnerVision | undefined, from: { x: number; z: number }, reachableByLand: (goal: { x: number; z: number }) => boolean
): Building | undefined {
  return buildings
    .filter((b) => b.owner !== slot && b.health > 0 && canTarget(vision, slot, b, 'explored') && !reachableByLand(b.position))
    .sort((a, b) => dist(a.position, from) - dist(b.position, from))[0];
}

/** Lança a incursão: o grupo embarca no transporte. */
export function launchNaval(
  clock: BotClock, elapsed: number, group: readonly Unit[], boat: Unit, target: Building, landing: { x: number; z: number }
): NavalPlan {
  const members = group.slice(0, Math.min(NAVAL.groupMax, COLONIAL_TRANSPORT.passengers));
  const next: BotClock = { ...clock, naval: { phase: 'embark', boatId: boat.id, ids: members.map((u) => u.id), targetId: target.id, landing, startedAt: elapsed, phaseAt: elapsed }, navalStats: { ...stats(clock), launched: stats(clock).launched + 1 } };
  return { commands: [{ type: 'embark', unitIds: members.map((u) => u.id), boatId: boat.id }], clock: next, notes: [`incursão naval iniciada com ${members.length} contra ${target.type}`] };
}

/** Avança a incursão por mar em andamento, uma fase por vez; aborta com motivo se o porto cai, o barco afunda ou o pouso falha. */
export function stepNaval(
  slot: string, clock: BotClock, elapsed: number, units: readonly Unit[], buildings: readonly Building[], dockPos: { x: number; z: number } | undefined
): NavalPlan {
  const naval = clock.naval;
  const commands: BotCommand[] = [];
  const notes: string[] = [];
  if (!naval) return { commands, clock, notes };
  const boat = units.find((u) => u.id === naval.boatId && u.health > 0);
  const dockAlive = buildings.some((b) => b.owner === slot && b.type === 'dock' && b.isComplete && b.health > 0);
  const abort = (reason: string, lostUnits = 0): NavalPlan => {
    const s = stats(clock);
    const next: BotClock = { ...clock, naval: undefined, navalStats: { ...s, aborted: s.aborted + 1, lost: s.lost + lostUnits } };
    if (boat && dockPos) commands.push({ type: 'move', unitId: boat.id, target: dockPos });
    return { commands, clock: next, notes: [`incursão naval abortada: ${reason}`] };
  };

  if (!boat) return abort('transporte afundado', naval.ids.length);
  const aboard = (boat.passengers ?? []).filter((p) => naval.ids.includes(p.id)).length;

  if (naval.phase === 'embark') {
    if (!dockAlive) return abort('porto destruído antes da partida');
    if (aboard >= Math.min(NAVAL.groupMin, naval.ids.length)) {
      commands.push({ type: 'move', unitId: boat.id, target: naval.landing });
      return { commands, clock: { ...clock, naval: { ...naval, phase: 'sail', phaseAt: elapsed } }, notes: ['embarque concluído: zarpando'] };
    }
    if (elapsed - naval.phaseAt > NAVAL.embarkSeconds) return abort('embarque demorou demais');
    return { commands, clock, notes };
  }
  if (naval.phase === 'sail') {
    if (dist(boat.position, naval.landing) <= NAVAL.arrival) {
      commands.push({ type: 'disembark', boatId: boat.id });
      return { commands, clock: { ...clock, naval: { ...naval, phase: 'land', phaseAt: elapsed } }, notes: ['chegada: desembarcando'] };
    }
    if (elapsed - naval.phaseAt > NAVAL.sailSeconds) return abort('travessia demorou demais');
    if (boat.state === 'idle' && !boat.targetPosition) commands.push({ type: 'move', unitId: boat.id, target: naval.landing }); // retoma a rota se parou
    return { commands, clock, notes };
  }
  // land: quando o porão esvaziou, as tropas pousadas atacam o alvo e a incursão passa ao plano terrestre (retirada com 35% de perdas).
  if (aboard === 0) {
    const landed = units.filter((u) => naval.ids.includes(u.id) && u.health > 0);
    landed.forEach((unit) => commands.push({ type: 'attack', unitId: unit.id, targetId: naval.targetId }));
    return { commands, clock: { ...clock, naval: undefined, raid: { ids: landed.map((u) => u.id), startedAt: elapsed, startCount: naval.ids.length, targetId: naval.targetId } }, notes: [`pouso concluído: ${landed.length} tropas atacam`] };
  }
  if (elapsed - naval.phaseAt > NAVAL.landSeconds) return abort('sem terreno de pouso (água funda ou margem bloqueada)');
  return { commands, clock, notes };
}
