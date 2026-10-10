import type { Building, GameState, Unit } from './model';

/** Defaults revisados: 150 madeira + 50 pedra + 20 tábuas, 20 s, 800 HP, largura 2,5, vão máximo 12. */
export const BRIDGE = {
  cost: { wood: 150, stone: 50, planks: 20 },
  buildSeconds: 20,
  maxHealth: 800,
  width: 2.5,
  maxSpan: 12,
  /** Deck: nível da água mais 0,5. */
  deckAboveWater: 0.5,
  /** Declive máximo entre as margens (mesma regra de fundação). */
  maxSlope: 0.85,
} as const;

export interface BridgeSpan { a: { x: number; z: number }; b: { x: number; z: number } }

const dist = (p: { x: number; z: number }, q: { x: number; z: number }): number => Math.hypot(p.x - q.x, p.z - q.z);

export const spanOf = (building: Building): BridgeSpan | undefined => building.span;

/** Pontes que abrem passagem: concluídas e vivas. Em obras ou destruídas não dão deck nem rampa. */
export const completedBridges = (buildings: readonly Building[]): Building[] =>
  buildings.filter((building) => building.type === 'bridge' && building.isComplete && building.health > 0 && building.span);

/** Distância de um ponto ao segmento da ponte. */
function distanceToSegment(p: { x: number; z: number }, span: BridgeSpan): number {
  const dx = span.b.x - span.a.x; const dz = span.b.z - span.a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - span.a.x) * dx + (p.z - span.a.z) * dz) / len2));
  return dist(p, { x: span.a.x + t * dx, z: span.a.z + t * dz });
}

/** O ponto está sobre o deck de alguma ponte (faixa de largura 2,5 em volta do vão). */
export const onDeck = (p: { x: number; z: number }, bridges: readonly Building[]): boolean =>
  bridges.some((bridge) => bridge.span && distanceToSegment(p, bridge.span) <= BRIDGE.width / 2);

/** Assinatura que muda quando o conjunto de pontes ativas muda: invalida rota em cache e campos de fluxo. */
export const bridgeVersion = (buildings: readonly Building[]): number => {
  let hash = 0;
  for (const bridge of completedBridges(buildings)) for (let i = 0; i < bridge.id.length; i += 1) hash = (hash * 31 + bridge.id.charCodeAt(i)) | 0;
  return hash;
};

export interface BridgeTerrain {
  canStandAt(body: 'human' | 'mount' | 'cart', x: number, z: number): boolean;
  surfaceAt(x: number, z: number): { water: string; depth: number; cliff: boolean };
  isOceanAt(x: number, z: number): boolean;
  getHeightAt(x: number, z: number): number;
  localityOf?(owner: string, position: { x: number; z: number }): string;
}

export type BridgeRefusal = 'span' | 'ocean' | 'island' | 'ends' | 'slope' | 'water' | 'cost' | 'unit' | 'overlap';
export interface BridgeCheck { ok: boolean; refusal?: BridgeRefusal; message?: string }

/**
 * Valida uma ponte entre duas margens da mesma ilha: pontas em terra firme, vão de água doce (rio ou lago) de até 12, sem oceano
 * nem outra ilha, declive aceitável, aldeão próprio, saldo e sem sobrepor edifícios.
 */
export function checkBridge(
  state: Pick<GameState, 'buildings' | 'units' | 'playerResources'>, owner: string, span: BridgeSpan, builderIds: readonly string[],
  terrain: BridgeTerrain
): BridgeCheck {
  const length = dist(span.a, span.b);
  if (length < 2 || length > BRIDGE.maxSpan) return { ok: false, refusal: 'span', message: `O vão deve ter entre 2 e ${BRIDGE.maxSpan} de comprimento.` };
  if (!terrain.canStandAt('human', span.a.x, span.a.z) || !terrain.canStandAt('human', span.b.x, span.b.z)) {
    return { ok: false, refusal: 'ends', message: 'As duas pontas precisam estar em terra firme.' };
  }
  if (terrain.localityOf && terrain.localityOf(owner, span.a) !== terrain.localityOf(owner, span.b)) {
    return { ok: false, refusal: 'island', message: 'A ponte liga margens da mesma ilha; entre ilhas só por mar.' };
  }
  let water = 0;
  const steps = Math.ceil(length * 2);
  for (let i = 1; i < steps; i += 1) {
    const p = { x: span.a.x + ((span.b.x - span.a.x) * i) / steps, z: span.a.z + ((span.b.z - span.a.z) * i) / steps };
    if (terrain.isOceanAt(p.x, p.z)) return { ok: false, refusal: 'ocean', message: 'Não há ponte sobre o oceano.' };
    if (!terrain.canStandAt('human', p.x, p.z)) water += 1;
  }
  if (water === 0) return { ok: false, refusal: 'water', message: 'Não há água entre as margens: ande por terra.' };
  if (Math.abs(terrain.getHeightAt(span.a.x, span.a.z) - terrain.getHeightAt(span.b.x, span.b.z)) > BRIDGE.maxSlope) {
    return { ok: false, refusal: 'slope', message: 'Declive demais entre as margens para apoiar a ponte.' };
  }
  const mid = { x: (span.a.x + span.b.x) / 2, z: (span.a.z + span.b.z) / 2 };
  if (state.buildings.some((b) => b.health > 0 && dist(b.position, mid) < 2.5 + length / 2 && b.type !== 'bridge' && distanceToSegment(b.position, span) < 2)) {
    return { ok: false, refusal: 'overlap', message: 'Há um edifício no caminho da ponte.' };
  }
  const villagers = builderIds.map((id) => state.units.find((u) => u.id === id)).filter((u): u is Unit => Boolean(u));
  if (villagers.length === 0 || villagers.some((u) => u.owner !== owner || u.type !== 'villager' || u.health <= 0)) {
    return { ok: false, refusal: 'unit', message: 'Precisa de aldeões próprios vivos.' };
  }
  const res = state.playerResources[owner];
  if (!res || res.wood < BRIDGE.cost.wood || res.stone < BRIDGE.cost.stone || res.planks < BRIDGE.cost.planks) {
    return { ok: false, refusal: 'cost', message: `Falta material: ${BRIDGE.cost.wood} madeira, ${BRIDGE.cost.stone} pedra e ${BRIDGE.cost.planks} tábuas.` };
  }
  return { ok: true };
}

/** Cria a ponte em obras no ponto médio do vão. O custo é debitado por `applyBuildingFoundation` (uma vez). */
export function bridgeFoundation(id: string, owner: string, span: BridgeSpan): Building {
  return {
    id, type: 'bridge', owner, position: { x: (span.a.x + span.b.x) / 2, z: (span.a.z + span.b.z) / 2 },
    health: Math.round(BRIDGE.maxHealth * 0.1), maxHealth: BRIDGE.maxHealth, isComplete: false, buildProgress: 0, trainingQueue: [], span,
  };
}

/** Terreno com as pontes ativas: o deck é terra firme para corpos terrestres (nunca para barcos); sem ponte ativa o terreno é o original. */
export function withBridges<T extends BridgeTerrain & { isImpassableAt?: (x: number, z: number) => boolean }>(terrain: T, buildings: readonly Building[]): T {
  const bridges = completedBridges(buildings);
  if (bridges.length === 0) return terrain;
  return {
    ...terrain,
    canStandAt: (body: 'human' | 'mount' | 'cart', x: number, z: number) => onDeck({ x, z }, bridges) || terrain.canStandAt(body, x, z),
    surfaceAt: (x: number, z: number) => (onDeck({ x, z }, bridges) ? { water: 'none', depth: 0, cliff: false } : terrain.surfaceAt(x, z)),
    ...(terrain.isImpassableAt ? { isImpassableAt: (x: number, z: number) => (onDeck({ x, z }, bridges) ? false : terrain.isImpassableAt!(x, z)) } : {}),
  };
}

/**
 * Unidades terrestres sobre o deck de uma ponte que deixou de existir voltam ao apoio mais próximo (a margem do próprio lado),
 * sem levitar nem saltar para a outra margem. Devolve as unidades reposicionadas e quantas foram movidas.
 */
export function relocateFromDestroyed(units: readonly Unit[], destroyed: readonly Building[]): { units: Unit[]; moved: number } {
  let moved = 0;
  const next = units.map((unit) => {
    if (unit.type === 'fishing_boat' || unit.type === 'trade_boat' || unit.type === 'warship' || unit.type === 'colonial_transport') return unit;
    for (const bridge of destroyed) {
      if (!bridge.span || distanceToSegment(unit.position, bridge.span) > BRIDGE.width / 2) continue;
      const toA = dist(unit.position, bridge.span.a); const toB = dist(unit.position, bridge.span.b);
      const shore = toA <= toB ? bridge.span.a : bridge.span.b;
      moved += 1;
      return { ...unit, position: { x: shore.x, z: shore.z }, targetPosition: null, targetEntityId: null, state: 'idle' as const };
    }
    return unit;
  });
  return { units: next, moved };
}
