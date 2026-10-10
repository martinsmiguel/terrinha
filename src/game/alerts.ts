import type { GameState, Unit } from './model';
import { cargoTotal } from './colonialTransport';
import { stormAlertFor } from './storms';
import { routeView } from './tradeRoutes';

export type AlertKind = 'route' | 'storm' | 'combat' | 'capital';

export interface HudAlert {
  /** Um alerta por objeto: o mesmo barco ou edifício nunca aparece duas vezes. */
  objectId: string;
  kind: AlertKind;
  text: string;
  /** Posição do PRÓPRIO objeto ou da região conhecida; nunca a de um inimigo. */
  focus: { x: number; z: number };
  severity: 'info' | 'warning' | 'danger';
}

/** Vida anterior de cada objeto próprio, para detectar dano recebido entre duas leituras. */
export type HealthMemory = Record<string, number>;

export const CAPITAL_RISK = 0.5;

export const healthMemoryOf = (state: Pick<GameState, 'units' | 'buildings'>, owner: string): HealthMemory => {
  const memory: HealthMemory = {};
  for (const unit of state.units) if (unit.owner === owner) memory[unit.id] = unit.health;
  for (const building of state.buildings) if (building.owner === owner) memory[building.id] = building.health;
  return memory;
};

/**
 * Alertas do próprio jogador, agrupados por objeto: rota bloqueada/perdida/esperando, tempestade conhecida ou na rota, combate
 * (objeto próprio que perdeu vida desde a leitura anterior) e capital em risco. A localização é sempre de coisa própria ou de
 * região conhecida; o agressor não é citado nem localizado.
 */
export function collectAlerts(
  state: Pick<GameState, 'units' | 'buildings' | 'storm' | 'elapsed'>, owner: string, previous: HealthMemory | undefined,
  isExplored: (x: number, z: number) => boolean
): HudAlert[] {
  const byObject = new Map<string, HudAlert>();
  const put = (alert: HudAlert) => {
    const existing = byObject.get(alert.objectId);
    const rank = { info: 0, warning: 1, danger: 2 } as const;
    if (!existing || rank[alert.severity] > rank[existing.severity]) byObject.set(alert.objectId, alert);
  };

  for (const unit of state.units) {
    if (unit.owner !== owner || unit.health <= 0 || !unit.route) continue;
    const view = routeView(unit.route);
    if (view.tone === 'alert' || view.tone === 'wait') {
      put({ objectId: unit.id, kind: 'route', text: `Rota ${view.label.toLowerCase()}${view.reason ? `: ${view.reason}` : ''}`, focus: { ...unit.position }, severity: view.tone === 'alert' ? 'danger' : 'warning' });
    }
  }

  const storm = stormAlertFor(state.storm, state.elapsed ?? 0, owner, state.units as readonly Unit[], isExplored);
  if (storm) put({ objectId: `storm-${storm.id}`, kind: 'storm', text: storm.text, focus: storm.focus, severity: storm.phase === 'active' ? 'danger' : 'warning' });

  if (previous) {
    for (const unit of state.units) {
      if (unit.owner !== owner || unit.health <= 0) continue;
      if ((previous[unit.id] ?? unit.health) - unit.health > 0.5) {
        put({ objectId: unit.id, kind: 'combat', text: `Sua ${unit.type === 'villager' ? 'unidade' : unit.type} está sofrendo dano`, focus: { ...unit.position }, severity: 'danger' });
      }
    }
  }

  for (const building of state.buildings) {
    if (building.owner !== owner || building.type !== 'town_center' || building.health <= 0) continue;
    const dropped = previous ? (previous[building.id] ?? building.health) - building.health > 0.5 : false;
    if (building.isComplete && (building.health / building.maxHealth < CAPITAL_RISK || dropped)) {
      put({ objectId: building.id, kind: 'capital', text: dropped ? 'Sua sede está sob ataque' : `Sede em risco: ${Math.round((building.health / building.maxHealth) * 100)}% de vida`, focus: { ...building.position }, severity: 'danger' });
    }
  }
  return [...byObject.values()];
}

export interface BoatMarker { id: string; x: number; z: number; carrying: boolean; onRoute: boolean }

/** Barcos próprios com carga a bordo ou em rota, para o minimapa (porão e perna). Só do dono, nunca de outros. */
export function boatMarkers(units: readonly Unit[], owner: string): BoatMarker[] {
  return units
    .filter((unit) => unit.owner === owner && unit.health > 0 && (unit.route || cargoTotal(unit.cargo) > 0 || unit.kit))
    .map((unit) => ({ id: unit.id, x: unit.position.x, z: unit.position.z, carrying: cargoTotal(unit.cargo) > 0 || Boolean(unit.kit), onRoute: Boolean(unit.route) }));
}

/** Descrição curta da perna e do porão de um barco em rota, para o HUD. */
export function legLabel(unit: Unit): string | null {
  const route = unit.route;
  if (!route) return null;
  const outbound = route.phase === 'load_a' || route.phase === 'travel_b' || route.phase === 'unload_b';
  const leg = outbound ? route.outbound : route.back;
  const load = cargoTotal(unit.cargo);
  return `${outbound ? 'Ida' : 'Volta'}: ${leg ? `${leg.amount} ${leg.resource}` : 'vazia'} · porão ${load}`;
}
