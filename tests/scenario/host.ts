import { BUILDING_CATALOG, type BuildingType } from '../../src/game/buildingCatalog';
import { applyBuildingFoundation } from '../../src/game/buildingOrders';
import { evaluateCapitalSite, type CapitalSiteTerrain } from '../../src/game/capitalSite';
import { withBridges } from '../../src/game/bridges';
import { deliverCargo, loadKit } from '../../src/game/colonialTransport';
import { HOME } from '../../src/game/depots';
import { UNIT_COSTS } from '../../src/game/economy';
import { effectiveBuildCost } from '../../src/game/talents';
import { FOUNDATION_KIT, createStartingForce, findCapitalSites, foundCapital } from '../../src/game/foundation';
import { checkBuildingPlacementValid } from '../../src/game/buildingGhost';
import type { Building, GameState, PlayerResources, Unit, UnitType } from '../../src/game/model';
import { applyEmbarkOrder, boatDestination } from '../../src/game/navalTransport';
import { isAuthorizedPlayerCommand, isValidNetworkCommand, soloMatchSlots, type PlayerSlot } from '../../src/game/networkCommands';
import { findNearestOceanCell, generateProceduralTerrain, type ProceduralMapResult } from '../../src/game/proceduralMap';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';
import { createTechState } from '../../src/game/tech';
import { isExploredAt } from '../../src/game/visibility';
import { isExploredBy, updateOwnerVision, type OwnerVision } from '../../src/game/visionAuthority';
import { debitAt } from '../../src/game/depots';
import { payerLocality } from '../../src/game/networkCommands';
import { isBoatUnit } from '../../src/game/model';
import { attackOrder } from '../../src/game/unitOrders';
import { generateRelics } from '../../src/game/mysticism';

/**
 * Host de roteiro: executa uma partida solo inteira sem interface, passo a passo (20 passos por segundo).
 *
 * Fidelidade: a autorização (`isValidNetworkCommand` + `isAuthorizedPlayerCommand` com névoa e terreno com pontes), a simulação
 * (`tickGameState`) e as regras puras (fundação, obra, kit, embarque) são as do jogo. Os efeitos de cada comando em
 * estado repetem os de `handleIncomingCommand` em `src/App.tsx` (marcados com a linha de origem); se aquele trecho mudar,
 * o espelho aqui precisa mudar junto. Extrair um aplicador puro de comandos é o próximo passo natural.
 */

export const TICKS_PER_SECOND = 20;
export type Command = Record<string, unknown> & { type: string };
export interface Rejection { tick: number; owner: string; command: Command; why: string }

/** Gerador pseudoaleatório determinístico (mulberry32): o roteiro é reproduzível. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ScenarioHost {
  state: GameState;
  tick = 0;
  vision: OwnerVision | undefined;
  readonly map: ProceduralMapResult;
  readonly slots: PlayerSlot[];
  readonly rejections: Rejection[] = [];
  readonly notifications: { tick: number; message: string }[] = [];
  private readonly pathCache: SimulationContext['pathCache'] = new Map();
  private readonly random: () => number;
  private idCounter = 0;
  private readonly createId = () => `e${(this.idCounter += 1)}`;
  private readonly buildingDefinitions = Object.fromEntries(
    Object.entries(BUILDING_CATALOG).map(([type, definition]) => [type, { name: definition.name, buildTimeSeconds: definition.buildTimeSeconds }])
  );

  constructor(readonly options: { size: number; seed: number; matchSize?: number } = { size: 280, seed: 4242 }) {
    this.random = seededRandom(options.seed);
    this.map = generateProceduralTerrain(options.size, options.seed);
    this.slots = soloMatchSlots('player1', options.matchSize ?? 2);
    const spawns: Record<string, { x: number; z: number }> = {
      player1: this.map.player1Spawn, player2: this.map.player2Spawn, player3: this.map.player3Spawn, player4: this.map.player4Spawn,
    };
    const units: Unit[] = [];
    const playerResources: Record<string, PlayerResources> = {};
    const techs: Record<string, ReturnType<typeof createTechState>> = {};
    const foundationKits: Record<string, { wood: number; stone: number }> = {};
    for (const slot of ['player1', 'player2', 'player3', 'player4']) {
      playerResources[slot] = { wood: 350, food: 350, gold: 200, stone: 100, planks: 0, pop: 0, maxPop: 15 };
      techs[slot] = createTechState();
    }
    for (const slot of this.slots) {
      const force = createStartingForce(slot, spawns[slot], this.createId);
      units.push(...force);
      playerResources[slot] = { wood: 350, food: 350, gold: 200, stone: 100, planks: 0, pop: force.length, maxPop: 15 };
      foundationKits[slot] = { ...FOUNDATION_KIT };
    }
    this.state = {
      units, buildings: [], resourceNodes: this.map.resourceNodes, playerResources, techs, mapSeed: this.map.seed, mapSize: options.size,
      foundationKits, relics: generateRelics(this.map.islands), elapsed: 0,
    };
    this.vision = updateOwnerVision(undefined, this.state, this.slots, options.size);
    // A IA funda a própria capital no melhor sítio perto da chegada (App.autoFoundCapital).
    for (const slot of this.slots.filter((s) => s !== 'player1')) {
      const wagon = this.state.units.find((u) => u.owner === slot && u.type === 'wagon');
      const site = wagon ? this.capitalSites(wagon, 30, false)[0] : undefined;
      if (!wagon || !site) continue;
      const result = foundCapital(this.state, { owner: slot, wagonId: wagon.id, position: site }, (x, z) => this.siteValid(this.state, slot, x, z, false), this.createId);
      if (result.ok) this.state = result.state;
    }
  }

  /* ---------- consultas ---------- */

  get seconds(): number { return this.tick / TICKS_PER_SECOND; }
  unit(id: string): Unit | undefined { return this.state.units.find((u) => u.id === id); }
  units(owner: string, type?: UnitType): Unit[] { return this.state.units.filter((u) => u.owner === owner && (!type || u.type === type)); }
  buildings(owner: string, type?: string): Building[] { return this.state.buildings.filter((b) => b.owner === owner && (!type || b.type === type)); }
  resources(owner = 'player1'): PlayerResources { return this.state.playerResources[owner]; }

  private terrainFor(current: GameState, useFog: boolean, owner: string): CapitalSiteTerrain {
    const grid = this.vision?.[owner];
    return {
      mapSize: this.options.size, buildings: current.buildings, nodes: current.resourceNodes,
      isWaterAt: this.map.isWaterAt, isCliffAt: this.map.isCliffAt, getHeightAt: this.map.getHeightAt, isImpassableAt: this.map.isImpassableAt,
      isDiscovered: useFog && grid ? (x, z) => isExploredAt(grid, Math.round(x), Math.round(z)) : undefined,
    };
  }
  private siteValid(current: GameState, owner: string, x: number, z: number, useFog: boolean, from?: { x: number; z: number }) {
    return evaluateCapitalSite({ x, z }, this.terrainFor(current, useFog, owner), { from, kit: current.foundationKits?.[owner] }).valid;
  }
  /** O ponto já foi explorado pelo jogador (o host só aceita obra e coleta em lugar explorado). */
  explored(p: { x: number; z: number }, owner = 'player1'): boolean { return isExploredBy(this.vision, owner, p.x, p.z); }
  /** Recurso mais próximo de `from`, só entre os explorados (como a interface só deixa clicar no que se vê). */
  nearestNode(type: string, from: { x: number; z: number }, skip = 0, owner = 'player1') {
    return this.state.resourceNodes
      .filter((n) => n.type === type && n.remaining > 0 && this.explored(n.position, owner))
      .sort((a, b) => Math.hypot(a.position.x - from.x, a.position.z - from.z) - Math.hypot(b.position.x - from.x, b.position.z - from.z))[skip];
  }
  /** Sítios candidatos de capital para a carroça (App.capitalSitesFor). */
  capitalSites(wagon: Unit, radius = 30, useFog = true) {
    return findCapitalSites(wagon.position, (x, z) => this.siteValid(this.state, wagon.owner, x, z, useFog, wagon.position), { maxRadius: radius, minSpacing: 4 });
  }
  /** Posição de edifício válida perto de `near`, procurada em anéis (a interface faz isto com o fantasma sob o mouse). */
  placementNear(type: BuildingType, near: { x: number; z: number }, owner = 'player1', maxRadius = 18, onlyExplored = true): { x: number; z: number } | null {
    for (let r = 0; r <= maxRadius; r += 0.5) {
      const steps = Math.max(1, Math.round(r * 8));
      for (let i = 0; i < steps; i += 1) {
        const a = (i / steps) * Math.PI * 2;
        const p = { x: Math.round((near.x + Math.cos(a) * r) * 2) / 2, z: Math.round((near.z + Math.sin(a) * r) * 2) / 2 };
        if (this.placementValid(type, p, owner) && (!onlyExplored || this.explored(p, owner))) return p;
      }
    }
    return null;
  }
  placementValid(type: BuildingType, p: { x: number; z: number }, owner = 'player1'): boolean {
    return checkBuildingPlacementValid(
      type, p.x, p.z, this.state.buildings, this.state.resourceNodes, this.options.size,
      this.map.isWaterAt, this.map.isCliffAt, this.map.getHeightAt, this.map.isNavigableAt, this.map.fertilityAt, owner
    ).isValid;
  }

  /* ---------- comandos (espelho de handleIncomingCommand) ---------- */

  /** Envia um comando como o jogador `owner`. Devolve `false` e registra o motivo quando o host o recusaria. */
  send(command: Command, owner: PlayerSlot = 'player1'): boolean {
    const cmd = { playerSlot: owner, ...command } as unknown;
    if (!isValidNetworkCommand(cmd, this.options.size)) return this.reject(owner, command, 'formato inválido');
    const terrain = withBridges(this.map, this.state.buildings);
    if (!isAuthorizedPlayerCommand(this.state, cmd, owner, this.vision, terrain)) return this.reject(owner, command, 'não autorizado pelo host (posse, recurso, visão ou terreno)');
    const c = cmd as Record<string, any> & { type: string };

    if (c.type === 'found_capital') {
      const wagon = this.state.units.find((u) => u.id === c.wagonId && u.owner === owner);
      const result = foundCapital(this.state, { owner, wagonId: c.wagonId, position: c.position }, (x, z) => this.siteValid(this.state, owner, x, z, true, wagon?.position), this.createId);
      if (!result.ok) return this.reject(owner, command, `fundação recusada: ${result.reason}`);
      this.state = result.state;
      return true;
    }
    if (c.type === 'build') {
      if (!this.placementValid(c.buildingType, c.position, c.owner)) return this.reject(owner, command, 'local de obra inválido');
      const def = BUILDING_CATALOG[c.buildingType as BuildingType];
      const foundation: Building = {
        id: this.createId(), type: c.buildingType, owner: c.owner, position: c.position, health: Math.round(def.maxHealth * 0.1), maxHealth: def.maxHealth,
        isComplete: false, buildProgress: 0, trainingQueue: [],
      };
      const before = this.state;
      this.state = applyBuildingFoundation(
        this.state, foundation, effectiveBuildCost(this.state, c.owner, c.buildingType, def.cost), c.builderIds ?? [],
        (current) => checkBuildingPlacementValid(c.buildingType, c.position.x, c.position.z, current.buildings, current.resourceNodes, this.options.size,
          this.map.isWaterAt, this.map.isCliffAt, this.map.getHeightAt, this.map.isNavigableAt, this.map.fertilityAt, c.owner).isValid,
        payerLocality(this.state, c.owner, c.buildingType, c.position, this.map.localityOf)
      );
      return this.state !== before || this.reject(owner, command, 'obra não paga (recursos, apoio ou aldeões inválidos)');
    }
    if (c.type === 'build_order') { this.patch(c.unitId, { state: 'building', targetEntityId: c.targetId, targetPosition: null }); return true; }
    if (c.type === 'move') {
      let target = c.target as { x: number; z: number };
      const moving = this.unit(c.unitId);
      if (moving && isBoatUnit(moving.type)) {
        const destination = boatDestination(this.map.isNavigableAt, this.map.mapSize, target);
        if (!destination) return this.reject(owner, command, 'sem mar navegável perto do destino');
        target = destination.target;
      }
      this.patch(c.unitId, { targetPosition: target, targetEntityId: null, state: 'moving' });
      return true;
    }
    if (c.type === 'embark') { this.state = applyEmbarkOrder(this.state, c.unitIds, c.boatId).state; return true; }
    if (c.type === 'load_kit') {
      const boat = this.unit(c.boatId);
      if (!boat) return false;
      const next = loadKit(this.state, c.boatId, this.map.localityOf(boat.owner, boat.position), this.map.localityOf);
      if (!next) return this.reject(owner, command, 'kit não embarcado (estoque, capacidade ou apoio)');
      this.state = next;
      return true;
    }
    if (c.type === 'disembark') {
      const boat = this.unit(c.boatId);
      if (!boat) return false;
      if ((boat.passengers?.length ?? 0) === 0 && !boat.cargo && !boat.kit) return this.reject(owner, command, 'não há passageiros a bordo');
      const delivered = deliverCargo(this.state, c.boatId, this.map.localityOf(boat.owner, boat.position), this.map.localityOf);
      this.state = (boat.passengers?.length ?? 0) > 0
        ? { ...delivered, units: delivered.units.map((u) => (u.id === c.boatId ? { ...u, disembarkCooldown: 0 } : u)) }
        : delivered;
      return true;
    }
    if (c.type === 'gather') {
      const node = this.state.resourceNodes.find((n) => n.id === c.targetId);
      const origin = c.origin || (node ? { x: node.position.x, z: node.position.z } : undefined);
      const radius = c.radiusLimit || 14;
      const timeLimit = c.timeLimitSeconds ?? 0;
      this.patch(c.unitId, {
        targetEntityId: c.targetId, targetPosition: null, state: 'gathering', gatherOrigin: origin, gatherRadiusLimit: radius,
        gatherTimeLimitSeconds: timeLimit, gatherShiftSecondsRemaining: timeLimit > 0 ? timeLimit : undefined,
      });
      return true;
    }
    if (c.type === 'attack') { this.state = { ...this.state, units: this.state.units.map((u) => (u.id === c.unitId ? attackOrder(u, c.targetId) : u)) }; return true; }
    if (c.type === 'train') {
      const building = this.state.buildings.find((b) => b.id === c.buildingId);
      const resources = this.state.playerResources[owner];
      if (!building || !resources || !building.isComplete || building.trainingQueue.length >= 5) return this.reject(owner, command, 'treino recusado (obra incompleta ou fila cheia)');
      const queued = this.state.buildings.filter((b) => b.owner === owner).reduce((total, b) => total + b.trainingQueue.length, 0);
      if (resources.pop + queued >= resources.maxPop) return this.reject(owner, command, 'população máxima (falta casa)');
      const paid = debitAt(this.state, owner, this.map.localityOf(owner, building.position) ?? HOME, UNIT_COSTS[c.unitType as UnitType]);
      if (!paid) return this.reject(owner, command, 'treino sem recursos');
      this.state = {
        ...paid,
        buildings: this.state.buildings.map((b) => (b.id === c.buildingId ? { ...b, trainingQueue: [...b.trainingQueue, { unitType: c.unitType, progress: 0 }] } : b)),
      };
      return true;
    }
    return this.reject(owner, command, `comando ${c.type} não espelhado no host de roteiro`);
  }

  private patch(unitId: string, changes: Partial<Unit>): void {
    this.state = { ...this.state, units: this.state.units.map((u) => (u.id === unitId ? { ...u, ...changes } : u)) };
  }
  private reject(owner: string, command: Command, why: string): false {
    this.rejections.push({ tick: this.tick, owner, command, why });
    return false;
  }

  /* ---------- tempo ---------- */

  step(count = 1): void {
    for (let i = 0; i < count; i += 1) {
      const result = tickGameState(this.state, {
        playerSlot: 'player1', mode: 'single', map: this.map,
        nearestOceanCell: (x, z, maxRadius) => findNearestOceanCell(this.map, x, z, maxRadius),
        pathCache: this.pathCache, activeSlots: this.slots, vision: this.vision, fertilityAt: this.map.fertilityAt,
        gatherRadiusLimit: 14, sustainableForestryEnabled: false, buildingDefinitions: this.buildingDefinitions,
        random: this.random, createId: this.createId,
      });
      this.state = result.state;
      for (const effect of result.effects) if (effect.type === 'notification') this.notifications.push({ tick: this.tick, message: effect.message });
      this.vision = updateOwnerVision(this.vision, this.state, this.slots, this.options.size);
      this.tick += 1;
    }
  }

  /** Avança até a condição valer ou o limite estourar; devolve quantos passos levou, ou `null` se estourou. */
  runUntil(done: () => boolean, maxTicks: number): number | null {
    const start = this.tick;
    while (!done()) {
      if (this.tick - start >= maxTicks) return null;
      this.step();
    }
    return this.tick - start;
  }
}
