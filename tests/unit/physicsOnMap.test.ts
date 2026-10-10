import { describe, expect, it } from 'vitest';
import { BODIES, BOAT_REQUIRED_DEPTH, bodyOf, canStand, type BodyId } from '../../src/game/bodyModel';
import { FORD_DEPTH, LAKE_DEPTH, RIVER_DEPTH } from '../../src/game/archipelago';
import { findPath } from '../../src/game/movement/pathfinding';
import { SETTLE_RADIUS, settleUnits, stepToward, type StepTerrain } from '../../src/game/movement/step';
import type { GameState, Unit, UnitType } from '../../src/game/model';
import { isAuthorizedPlayerCommand } from '../../src/game/networkCommands';
import { generateProceduralTerrain, type ProceduralMapResult } from '../../src/game/proceduralMap';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';

const BODY_IDS: BodyId[] = ['human', 'mount', 'cart'];
const SEEDS = [10007, 52723, 91570];

/** Células de 1 unidade (4 vizinhos) em que o corpo pode estar, alcançadas a partir de um ponto. */
function reachable(map: ProceduralMapResult, body: BodyId, from: { x: number; z: number }): Uint8Array {
  const size = map.mapSize;
  const seen = new Uint8Array(size * size);
  const stack: number[] = [];
  const ok = (x: number, z: number) => x >= 0 && z >= 0 && x < size && z < size && map.canStandAt(body, x + 0.5, z + 0.5);
  const sx = Math.floor(from.x);
  const sz = Math.floor(from.z);
  seen[sx * size + sz] = 1;
  stack.push(sx, sz);
  while (stack.length) {
    const z = stack.pop()!;
    const x = stack.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (!ok(nx, nz) || seen[nx * size + nz]) continue;
      seen[nx * size + nz] = 1;
      stack.push(nx, nz);
    }
  }
  return seen;
}

describe('geografia real: travessia por corpo', () => {
  for (const size of [60, 192, 768]) {
    it(`mundo ${size}: nenhum corpo (humano, montaria, carroça) alcança outra ilha a pé ou vadeando`, () => {
      const map = generateProceduralTerrain(size, SEEDS[size === 768 ? 0 : 1]);
      const natives = map.islands.filter((island) => island.kind === 'native');
      for (const body of BODY_IDS) {
        for (const origin of natives) {
          const seen = reachable(map, body, origin.spawn);
          const touched = map.islands.filter((island) => seen[Math.floor(island.center.x) * size + Math.floor(island.center.z)] === 1);
          expect(touched.map((island) => island.index), `${body} saindo da natal ${origin.index}`).toEqual([origin.index]);
        }
      }
    }, 120000);
  }

  it('a faixa rasa da costa mede no máximo 2 células em qualquer direção, ilha e tamanho', () => {
    for (const size of [60, 192]) {
      for (const seed of SEEDS) {
        const map = generateProceduralTerrain(size, seed);
        for (const island of map.islands) {
          for (let step = 0; step < 48; step += 1) {
            const angle = (step / 48) * Math.PI * 2;
            let band = 0;
            let inWater = false;
            for (let r = 0; r < island.baseRadius * 2; r += 0.1) {
              const x = island.center.x + Math.cos(angle) * r;
              const z = island.center.z + Math.sin(angle) * r;
              const surface = map.surfaceAt(x, z);
              if (surface.water === 'ocean') {
                inWater = true;
                if (surface.depth <= BODIES.human.wadeDepth) band += 0.1;
                else break;
              } else if (inWater) break;
            }
            expect(band, `${size} seed ${seed} ilha ${island.index} ângulo ${step}`).toBeLessThanOrEqual(2);
          }
        }
      }
    }
  });

  it('barcos flutuam só em oceano com 1,0 de fundo; rios, lagos e o raso da costa os prendem fora', () => {
    for (const seed of SEEDS) {
      const map = generateProceduralTerrain(192, seed);
      let navigable = 0;
      let shallowOcean = 0;
      for (let x = 0; x < map.mapSize; x += 1) {
        for (let z = 0; z < map.mapSize; z += 1) {
          const surface = map.surfaceAt(x + 0.5, z + 0.5);
          if (map.isNavigableAt(x + 0.5, z + 0.5)) {
            navigable += 1;
            expect(surface.water).toBe('ocean');
            expect(surface.depth).toBeGreaterThanOrEqual(BOAT_REQUIRED_DEPTH);
          } else if (surface.water === 'ocean') shallowOcean += 1;
          if (surface.water === 'lake' || surface.water === 'river') expect(map.isNavigableAt(x + 0.5, z + 0.5)).toBe(false);
        }
      }
      expect(navigable).toBeGreaterThan(0);
      expect(shallowOcean).toBeGreaterThan(0); // existe raso de costa que o calado barra
    }
  });

  it('lago e rio fundo bloqueiam todo corpo terrestre; o vau e o raso da costa são vadeáveis', () => {
    expect(LAKE_DEPTH).toBeGreaterThan(BODIES.human.wadeDepth);
    expect(RIVER_DEPTH).toBeGreaterThan(BODIES.human.wadeDepth);
    expect(FORD_DEPTH).toBeLessThanOrEqual(BODIES.cart.wadeDepth);
    const map = generateProceduralTerrain(60, 52723);
    let lake = 0, deepRiver = 0, ford = 0;
    for (let x = 0; x < 60; x += 0.5) {
      for (let z = 0; z < 60; z += 0.5) {
        const surface = map.surfaceAt(x, z);
        if (surface.water === 'lake') { lake += 1; for (const body of BODY_IDS) expect(canStand(surface, body)).toBe(false); }
        if (surface.water === 'river' && surface.depth === RIVER_DEPTH) { deepRiver += 1; for (const body of BODY_IDS) expect(canStand(surface, body)).toBe(false); }
        if (surface.water === 'river' && surface.depth === FORD_DEPTH) { ford += 1; for (const body of BODY_IDS) expect(canStand(surface, body)).toBe(true); }
      }
    }
    expect(lake + deepRiver + ford).toBeGreaterThan(0);
  });

  it('ambos os sentidos: toda rota existe de A para B se e somente se existe de B para A, para cada corpo', () => {
    for (const seed of SEEDS) {
      const map = generateProceduralTerrain(60, seed);
      let checked = 0;
      for (const body of BODY_IDS) {
        const blocked = (x: number, z: number) => !map.canStandAt(body, x, z);
        const cells: { x: number; z: number }[] = [];
        for (let x = 1; x < 59; x += 3) for (let z = 1; z < 59; z += 3) if (map.canStandAt(body, x + 0.5, z + 0.5)) cells.push({ x: x + 0.5, z: z + 0.5 });
        for (let i = 0; i + 1 < cells.length && checked < 60 * 3; i += 5) {
          const a = cells[i], b = cells[(i * 7 + 3) % cells.length];
          if (a === b) continue;
          const forward = findPath(a, b, blocked, { mapSize: 60, maxExpanded: 4000 }).length > 0;
          const backward = findPath(b, a, blocked, { mapSize: 60, maxExpanded: 4000 }).length > 0;
          expect(forward, `${body} semente ${map.seed}: ${JSON.stringify(a)} <-> ${JSON.stringify(b)}`).toBe(backward);
          checked += 1;
        }
      }
      expect(checked).toBeGreaterThan(0);
    }
  });
});

describe('raso: velocidade e custo de rota', () => {
  // Faixa rasa (profundidade 0,6) em 18 <= x < 22 ao longo de toda a altura; fora dela, terra seca.
  const strip = (x: number) => x >= 18 && x < 22;
  const terrain: StepTerrain = {
    isImpassableAt: () => false,
    isOceanAt: () => false,
    canStandAt: (body, x) => (strip(x) ? 0.6 <= BODIES[body].wadeDepth : true),
    surfaceAt: (x) => (strip(x) ? { water: 'river', depth: 0.6, cliff: false } : { water: 'none', depth: 0, cliff: false }),
  };

  it('o raso desacelera o passo; terra seca anda a velocidade cheia', () => {
    const dry = stepToward('villager', { x: 5, z: 5 }, { x: 15, z: 5 }, 0.16, terrain)!;
    const wade = stepToward('villager', { x: 19, z: 5 }, { x: 30, z: 5 }, 0.16, terrain)!;
    expect(dry.x - 5).toBeCloseTo(0.16, 6);
    expect(wade.x - 19).toBeLessThan(0.16);
    expect(wade.x - 19).toBeGreaterThan(0.16 * 0.5 - 1e-9);
  });

  it('a rota prefere o caminho seco quando ele não é muito mais longo, e vadeia quando o desvio é enorme', () => {
    const cost = (x: number) => (strip(x) ? 1 + 2 * (0.6 / BODIES.human.wadeDepth) : 1);
    // Ponte seca em z >= 8 (desvio curto) e z >= 40 (desvio longo), conforme o caso.
    const wall = (open: number) => (x: number, z: number) => strip(x) && z < open;
    const shortDetour = findPath({ x: 10, z: 4.5 }, { x: 30, z: 4.5 }, () => false, { mapSize: 60, cost: (x, z) => (wall(8)(x, z) ? cost(x) : 1) });
    expect(shortDetour.some((p) => p.z >= 8)).toBe(true); // desviou pela margem seca
    const longDetour = findPath({ x: 10, z: 4.5 }, { x: 30, z: 4.5 }, () => false, { mapSize: 60, cost: (x, z) => (wall(55)(x, z) ? cost(x) : 1) });
    expect(longDetour.every((p) => p.z < 20)).toBe(true); // vadeou: o desvio seco custaria mais
  });
});

describe('mouse e rede: destino por corpo', () => {
  const map = generateProceduralTerrain(60, 52723);
  const villager: Unit = { id: 'v', type: 'villager', owner: 'player1', position: { x: 16, z: 16 }, targetPosition: null, targetEntityId: null, health: 100, maxHealth: 100, attackDamage: 5, state: 'idle' };
  const boat: Unit = { ...villager, id: 'b', type: 'fishing_boat' };
  const state: GameState = { units: [villager, boat], buildings: [], resourceNodes: [], playerResources: { player1: { wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: 2, maxPop: 9 } } };
  const find = (predicate: (s: ReturnType<ProceduralMapResult['surfaceAt']>) => boolean) => {
    for (let x = 1; x < 59; x += 0.5) for (let z = 1; z < 59; z += 0.5) if (predicate(map.surfaceAt(x, z))) return { x, z };
    throw new Error('sem ponto');
  };

  it('o host recusa destino de água funda para unidade terrestre e aceita terra seca e raso vadeável', () => {
    const deep = find((s) => s.water === 'ocean' && s.depth > 2);
    const dry = find((s) => s.water === 'none' && !s.cliff);
    const shallow = find((s) => s.water === 'ocean' && s.depth > 0.2 && s.depth < 0.6);
    const move = (target: { x: number; z: number }, unitId = 'v') => ({ type: 'move', unitId, target });
    expect(isAuthorizedPlayerCommand(state, move(deep), 'player1', undefined, map)).toBe(false);
    expect(isAuthorizedPlayerCommand(state, move(dry), 'player1', undefined, map)).toBe(true);
    expect(isAuthorizedPlayerCommand(state, move(shallow), 'player1', undefined, map)).toBe(true);
    expect(isAuthorizedPlayerCommand(state, move(deep, 'b'), 'player1', undefined, map)).toBe(true); // barco: o host leva ao oceano
    expect(isAuthorizedPlayerCommand(state, move(deep), 'player1')).toBe(true); // sem terreno nada é bloqueado
  });
});

describe('revisão da superfície: cache e acomodação', () => {
  const rows = (open: Set<number>) => (x: number, z: number) => x >= 20 && x < 22 && !open.has(Math.floor(z / 10));
  const ctxFor = (blocked: (x: number, z: number) => boolean, version: number, cache: Map<string, never>): SimulationContext => ({
    playerSlot: 'player1', mode: 'host', pathCache: cache as never, surfaceVersion: version, gatherRadiusLimit: 14, sustainableForestryEnabled: false,
    buildingDefinitions: {}, random: () => 0.5, createId: () => 'x',
    map: { isWaterAt: blocked, isImpassableAt: blocked, isOceanAt: () => false },
  });
  const walker = (): GameState => ({
    units: [{ id: 'w', type: 'villager', owner: 'player1', position: { x: 10, z: 12 }, targetPosition: { x: 30, z: 12 }, targetEntityId: null, health: 100, maxHealth: 100, attackDamage: 5, state: 'moving' }],
    buildings: [], resourceNodes: [], playerResources: { player1: { wood: 0, food: 0, gold: 0, stone: 0, planks: 0, pop: 1, maxPop: 9 } },
  });

  it('ponte destruída com versão nova: a rota em cache é recalculada por outra travessia e a unidade chega', () => {
    const cache = new Map<string, never>();
    let state = walker();
    // Duas travessias (faixas z 10-19 e z 40-49). A unidade parte pela mais próxima.
    for (let t = 0; t < 30; t += 1) state = tickGameState(state, ctxFor(rows(new Set([1, 4])), 0, cache)).state;
    expect(state.units[0].state).toBe('moving');
    for (let t = 0; t < 1500 && state.units[0].state === 'moving'; t += 1) {
      // A travessia próxima é destruída e a versão da superfície sobe: o cache antigo não pode ser reaproveitado.
      state = tickGameState(state, ctxFor(rows(new Set([4])), 1, cache)).state;
    }
    expect(Math.hypot(state.units[0].position.x - 30, state.units[0].position.z - 12)).toBeLessThan(0.6);
  });

  it('sem subir a versão, a rota antiga atravessa a ponte destruída: a unidade recusa o passo e fica parada antes do muro', () => {
    const cache = new Map<string, never>();
    let state = walker();
    for (let t = 0; t < 30; t += 1) state = tickGameState(state, ctxFor(rows(new Set([1, 4])), 0, cache)).state;
    for (let t = 0; t < 400 && state.units[0].state === 'moving'; t += 1) state = tickGameState(state, ctxFor(rows(new Set([4])), 0, cache)).state;
    expect(state.units[0].position.x).toBeLessThan(20);
  });

  it('acomodação: unidade em posição que ficou ilegal vai à célula legal mais próxima, sem morrer nem ser teleportada', () => {
    // Antes o vau humano era 0,81; a revisão ao vivo o reduz para 0,3 e as unidades em água de 0,6 ficam ilegais.
    const live = (wade: number): StepTerrain => ({
      isImpassableAt: () => false, isOceanAt: () => false,
      canStandAt: (_body, x) => (x >= 10 && x < 14 ? 0.6 <= wade : true),
    });
    const at = (id: string, x: number, type: UnitType = 'villager') => ({ id, type, position: { x, z: 20.5 }, state: 'moving', targetPosition: { x: 40, z: 20 }, targetEntityId: null, health: 100 });
    const before = [at('a', 11.5), at('b', 12.5), at('safe', 30.5)];
    expect(before.every((unit) => live(0.81).canStandAt!('human', unit.position.x, 20.5))).toBe(true);
    const result = settleUnits(before, live(0.3));
    expect(result.moved.sort()).toEqual(['a', 'b']);
    expect(result.stranded).toEqual([]);
    for (const id of ['a', 'b']) {
      const unit = result.units.find((candidate) => candidate.id === id)!;
      expect(live(0.3).canStandAt!('human', unit.position.x, unit.position.z)).toBe(true);
      expect(Math.hypot(unit.position.x - before.find((b) => b.id === id)!.position.x, unit.position.z - 20.5)).toBeLessThanOrEqual(SETTLE_RADIUS);
      expect(unit.health).toBe(100);
      expect(unit.targetPosition).toBeNull();
    }
    expect(result.units.find((unit) => unit.id === 'safe')).toBe(before[2]);
  });

  it('acomodação: sem célula legal ao alcance a unidade fica parada com ordens limpas, sem morte nem teleporte', () => {
    const drowned: StepTerrain = { isImpassableAt: () => true, isOceanAt: () => false, canStandAt: () => false };
    const unit = { id: 'lost', type: 'villager' as UnitType, position: { x: 5.5, z: 5.5 }, state: 'moving', targetPosition: { x: 9, z: 9 }, targetEntityId: null, health: 100 };
    const result = settleUnits([unit], drowned);
    expect(result.stranded).toEqual(['lost']);
    expect(result.units[0]).toMatchObject({ position: { x: 5.5, z: 5.5 }, state: 'idle', targetPosition: null, health: 100 });
  });

  it('cada corpo é acomodado pelo próprio vau: a carroça sai de uma água em que o humano ainda fica', () => {
    const terrain: StepTerrain = { isImpassableAt: () => false, isOceanAt: () => false, canStandAt: (body, x) => (x >= 10 && x < 14 ? 0.6 <= BODIES[body].wadeDepth : true) };
    const cart = { id: 'cart', type: 'wagon' as UnitType, position: { x: 12.5, z: 20.5 }, state: 'idle', targetPosition: null, targetEntityId: null, health: 300 };
    const human = { ...cart, id: 'human', type: 'villager' as UnitType };
    expect(bodyOf('wagon')).toBe('cart');
    const result = settleUnits([cart, human], terrain);
    expect(result.moved).toEqual(['cart']);
    expect(result.units.find((unit) => unit.id === 'human')).toBe(human);
  });
});
