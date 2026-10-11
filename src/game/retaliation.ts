import { isBoatUnit, type Unit } from './model';
import { UNIT_ATTRIBUTES } from './unitAttributes';
import { canTarget, type OwnerVision } from './visionAuthority';

/**
 * Revide: uma unidade militar parada que está sendo atacada, ou cujo aliado do mesmo dono está sendo atacado dentro do
 * seu campo de visão, passa a atacar o agressor mais próximo que consegue ver (a tropa toda responde, não só quem leva o tiro).
 * Só reage quem está sem nada para fazer: quem marcha, coleta, constrói ou já ataca segue com a ordem dada. Aldeões não
 * revidam por conta própria (fogem do escopo: seguem as ordens do jogador). Regra pura, sem DOM.
 */

/** Unidades que revidam sozinhas: militares com ataque, nunca o aldeão. */
export const canRetaliate = (unit: Unit): boolean =>
  unit.health > 0 && unit.type !== 'villager' && UNIT_ATTRIBUTES[unit.type].canAttack && unit.state === 'idle' && !unit.targetPosition && !unit.targetEntityId;

/**
 * Para cada unidade que revida, o alvo escolhido: o agressor vivo mais próximo entre as unidades inimigas em estado de ataque
 * contra ela ou contra um aliado do mesmo dono, a até `visionRadius` dela, e que o dono vê. Barcos de guerra só respondem a barcos.
 */
export function retaliationTargets(units: readonly Unit[], vision: OwnerVision | undefined): Map<string, string> {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const aggressors = units.filter((unit) => unit.health > 0 && unit.state === 'attacking' && unit.targetEntityId && byId.has(unit.targetEntityId));
  const chosen = new Map<string, string>();
  if (aggressors.length === 0) return chosen;
  for (const unit of units) {
    if (!canRetaliate(unit)) continue;
    const sight = UNIT_ATTRIBUTES[unit.type].visionRadius;
    const attackers = aggressors.filter((attacker) => {
      const victim = byId.get(attacker.targetEntityId!)!;
      return attacker.owner !== unit.owner
        && victim.owner === unit.owner && victim.health > 0
        && (victim.id === unit.id || Math.hypot(attacker.position.x - unit.position.x, attacker.position.z - unit.position.z) <= sight)
        && (unit.type !== 'warship' || isBoatUnit(attacker.type))
        && canTarget(vision, unit.owner, attacker, 'visible');
    });
    if (attackers.length === 0) continue;
    const nearest = attackers.reduce((best, attacker) =>
      Math.hypot(attacker.position.x - unit.position.x, attacker.position.z - unit.position.z)
        < Math.hypot(best.position.x - unit.position.x, best.position.z - unit.position.z) ? attacker : best);
    chosen.set(unit.id, nearest.id);
  }
  return chosen;
}

/** Aplica o revide: as unidades escolhidas passam a atacar o agressor. */
export function applyRetaliation(units: Unit[], vision: OwnerVision | undefined): Unit[] {
  const targets = retaliationTargets(units, vision);
  if (targets.size === 0) return units;
  return units.map((unit) => (targets.has(unit.id) ? { ...unit, state: 'attacking' as const, targetEntityId: targets.get(unit.id)!, targetPosition: null } : unit));
}
