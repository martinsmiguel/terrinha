import { describe, expect, it } from 'vitest';
import {
  COLONIAL_TRANSPORT, cargoCapacity, deliverCargo, disembarkStep, holdOf, loadCargo, loadKit, previewDisembark, previewKit, previewLoad, sinkTransport,
} from '../../src/game/colonialTransport';
import { HOME, stockAt, type LocalityResolver } from '../../src/game/depots';
import { UNIT_COSTS } from '../../src/game/economy';
import type { Building, GameState, Unit } from '../../src/game/model';
import { BOAT_CAPACITY, isBoatUnit } from '../../src/game/model';
import { applyEmbarkOrder } from '../../src/game/navalTransport';
import { isAuthorizedPlayerCommand } from '../../src/game/networkCommands';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';
import { UNIT_ATTRIBUTES } from '../../src/game/unitAttributes';

const localityOf: LocalityResolver = (_owner, position) => (position.x < 100 ? HOME : '1');
const rich = { wood: 1000, food: 1000, gold: 1000, stone: 1000, planks: 1000, pop: 10, maxPop: 30 };
const outpost = (overrides: Partial<Building> = {}): Building => ({
  id: 'o1', type: 'outpost', owner: 'player1', position: { x: 150, z: 50 }, health: 900, maxHealth: 900, isComplete: true, trainingQueue: [], ...overrides,
});
const dock = (): Building => ({ id: 'd', type: 'dock', owner: 'player1', position: { x: 20, z: 20 }, health: 700, maxHealth: 700, isComplete: true, trainingQueue: [] });
const boat = (overrides: Partial<Unit> = {}): Unit => ({
  id: 'boat', type: 'colonial_transport', owner: 'player1', position: { x: 22, z: 20 }, targetPosition: null, targetEntityId: null,
  health: 360, maxHealth: 360, attackDamage: 0, state: 'idle', passengers: [], ...overrides,
});
const soldier = (id: string, overrides: Partial<Unit> = {}): Unit => ({
  id, type: 'soldier', owner: 'player1', position: { x: 22, z: 21 }, targetPosition: null, targetEntityId: null,
  health: 150, maxHealth: 150, attackDamage: 24, state: 'idle', ...overrides,
});
const world = (overrides: Partial<GameState> = {}): GameState => ({
  units: [boat()], buildings: [dock(), outpost()], resourceNodes: [], mapSize: 192, playerResources: { player1: rich, player2: rich }, ...overrides,
});
const land = { isWaterAt: () => false, isImpassableAt: () => false };
const sea = { isWaterAt: () => true, isImpassableAt: () => true };

describe('catálogo do transporte colonial', () => {
  it('é um barco distinto, com seis passageiros, 200 de carga, sem ataque nem renda, e o mercante segue em 100/125', () => {
    expect(isBoatUnit('colonial_transport')).toBe(true);
    expect(BOAT_CAPACITY.colonial_transport).toBe(6);
    expect(COLONIAL_TRANSPORT.kit).toEqual({ wood: 150, stone: 50 });
    expect(cargoCapacity('colonial_transport')).toBe(200);
    expect(cargoCapacity('trade_boat')).toBe(100);
    expect(cargoCapacity('trade_boat', true)).toBe(125);
    expect(cargoCapacity('fishing_boat')).toBe(0);
    expect(UNIT_ATTRIBUTES.colonial_transport).toMatchObject({ attackDamage: 0, canAttack: false, maxHealth: 360 });
    expect(UNIT_COSTS.colonial_transport).toEqual({ wood: 180, gold: 40, planks: 50 });
    expect(UNIT_COSTS.trade_boat).toEqual({ wood: 100, gold: 30, planks: 30 });
  });
});

describe('embarque', () => {
  it('valida vida, posse, distância, capacidade e IDs únicos; passageiros saem do mundo ativo', () => {
    const units = [boat(), soldier('a'), soldier('a-dup'), soldier('dead', { health: 0 }), soldier('foe', { owner: 'player2' }), soldier('far', { position: { x: 90, z: 90 } }),
      ...['b', 'c', 'd2', 'e', 'f', 'g'].map((id) => soldier(id))];
    const result = applyEmbarkOrder(world({ units }), ['a', 'a', 'dead', 'foe', 'far', 'b', 'c', 'd2', 'e', 'f', 'g'], 'boat');
    const aboard = result.state.units.find((unit) => unit.id === 'boat')!.passengers!;
    expect(aboard).toHaveLength(6);
    expect(new Set(aboard.map((unit) => unit.id)).size).toBe(6);
    expect(aboard.map((unit) => unit.id)).not.toContain('dead');
    expect(aboard.map((unit) => unit.id)).not.toContain('foe');
    expect(result.state.units.some((unit) => unit.id === 'a')).toBe(false);
  });

  it('passageiro não recebe ordem terrestre nem ataca (não está no mundo ativo)', () => {
    const embarked = applyEmbarkOrder(world({ units: [boat(), soldier('a')] }), ['a'], 'boat').state;
    const order = { type: 'move', unitIds: ['a'], target: { x: 30, z: 30 } };
    expect(isAuthorizedPlayerCommand(embarked, order, 'player1', undefined, { canStandAt: () => true })).toBe(false);
    const ticked = tickGameState(embarked, ctx()).state;
    expect(ticked.units.find((unit) => unit.id === 'boat')!.passengers!.map((p) => p.id)).toEqual(['a']);
  });
});

describe('porão e kit', () => {
  const funded = (): GameState => world({ localStocks: { player1: { '1': { wood: 300, food: 0, gold: 0, stone: 100, planks: 0 } } } });

  it('carrega debitando o estoque uma vez e respeita a capacidade', () => {
    const state = world();
    const loaded = loadCargo(state, 'boat', HOME, { wood: 150 }, localityOf)!;
    expect(loaded.playerResources.player1.wood).toBe(850);
    expect(loaded.units[0].cargo!.wood).toBe(150);
    expect(loadCargo(loaded, 'boat', HOME, { wood: 60 }, localityOf)).toBeNull(); // 210 > 200
    expect(loadCargo(state, 'boat', HOME, { wood: 5000 }, localityOf)).toBeNull(); // sem saldo
    expect(loadCargo({ ...state, units: [boat({ position: { x: 80, z: 80 } })] }, 'boat', HOME, { wood: 10 }, localityOf)).toBeNull(); // longe do apoio
  });

  it('o mercante carrega 100, ou 125 com talento', () => {
    const merchant = world({ units: [boat({ type: 'trade_boat' })] });
    expect(loadCargo(merchant, 'boat', HOME, { wood: 110 }, localityOf)).toBeNull();
    expect(loadCargo(merchant, 'boat', HOME, { wood: 110 }, localityOf, true)).not.toBeNull();
    expect(loadCargo(merchant, 'boat', HOME, { wood: 130 }, localityOf, true)).toBeNull();
  });

  it('o kit é embarcado uma só vez, debitando 150 madeira e 50 pedra do posto uma única vez', () => {
    const once = loadKit(world(), 'boat', HOME, localityOf)!;
    expect(once.playerResources.player1).toMatchObject({ wood: 850, stone: 950 });
    expect(once.units[0].kit).toBe(true);
    expect(loadKit(once, 'boat', HOME, localityOf)).toBeNull();
  });

  it('a entrega passa carga e kit ao estoque do posto da ilha uma única vez; sem apoio, fica a bordo', () => {
    const loaded = loadKit(world(), 'boat', HOME, localityOf)!;
    expect(loadCargo(loaded, 'boat', HOME, { wood: 1 }, localityOf)).toBeNull(); // o kit ocupa os 200 do porão
    const atColony = { ...loaded, units: [{ ...loaded.units[0], position: { x: 148, z: 50 } }] };
    const delivered = deliverCargo(atColony, 'boat', '1', localityOf);
    expect(stockAt(delivered, 'player1', '1')).toMatchObject({ wood: 150, stone: 50 });
    expect(delivered.units[0].cargo).toBeUndefined();
    expect(delivered.units[0].kit).toBeUndefined();
    expect(deliverCargo(delivered, 'boat', '1', localityOf)).toBe(delivered);
    const noPost = { ...atColony, buildings: [dock()] };
    expect(deliverCargo(noPost, 'boat', '1', localityOf)).toBe(noPost);
    expect(funded().localStocks).toBeDefined();
  });
});

describe('desembarque gradual', () => {
  const crowded = (): GameState => {
    const embarked = applyEmbarkOrder(world({ units: [boat(), soldier('a'), soldier('b'), soldier('c')] }), ['a', 'b', 'c'], 'boat').state;
    return { ...embarked, units: embarked.units.map((u) => (u.id === 'boat' ? { ...u, disembarkCooldown: 0 } : u)) };
  };

  it('solta um passageiro por 0,5 s (0,25 s com talento) e só em terreno válido', () => {
    let state = crowded();
    const first = disembarkStep(state, 'boat', land, 0.05);
    expect(first.released?.id).toBe('a');
    state = first.state;
    expect(state.units.find((u) => u.id === 'boat')!.disembarkCooldown).toBe(COLONIAL_TRANSPORT.disembarkSeconds);
    expect(disembarkStep(state, 'boat', land, 0.2).released).toBeNull();
    const second = disembarkStep(disembarkStep(state, 'boat', land, 0.2).state, 'boat', land, 0.31);
    expect(second.released?.id).toBe('b');
    const last = disembarkStep(disembarkStep(second.state, 'boat', land, 0.3).state, 'boat', land, 0.3);
    expect(last.released?.id).toBe('c');
    expect(last.state.units.find((u) => u.id === 'boat')!.disembarkCooldown).toBeUndefined(); // último passageiro: sem novo intervalo
    const talented = disembarkStep(crowded(), 'boat', land, 0.05, true);
    expect(talented.state.units.find((u) => u.id === 'boat')!.disembarkCooldown).toBe(COLONIAL_TRANSPORT.disembarkSecondsTalent);
  });

  it('em mar aberto o bloqueio mantém passageiros e carga', () => {
    const blocked = disembarkStep(crowded(), 'boat', sea, 1);
    expect(blocked.blocked).toBe(true);
    expect(blocked.released).toBeNull();
    expect(blocked.state.units.find((u) => u.id === 'boat')!.passengers).toHaveLength(3);
  });

  it('o tick conduz o desembarque ao longo do tempo e devolve a pop intacta', () => {
    let state = crowded();
    const context = ctx({ map: { ...land, isOceanAt: () => false } });
    for (let tick = 0; tick < 40; tick += 1) state = tickGameState(state, context).state;
    expect(state.units.filter((u) => u.type === 'soldier')).toHaveLength(3);
    expect(state.units.find((u) => u.id === 'boat')!.passengers).toHaveLength(0);
    expect(state.playerResources.player1.pop).toBe(10);
  });
});

describe('afundamento', () => {
  const loadedBoat = (): GameState => {
    const embarked = applyEmbarkOrder(world({ units: [boat({ cargo: { wood: 100, food: 0, gold: 0, stone: 0, planks: 0 }, kit: true }), soldier('a'), soldier('b')] }), ['a', 'b'], 'boat').state;
    return embarked;
  };

  it('sinkTransport perde casco, carga, kit e passageiros e baixa a pop uma só vez', () => {
    const sunk = sinkTransport(loadedBoat(), 'boat');
    expect(sunk.units).toHaveLength(0);
    expect(sunk.playerResources.player1.pop).toBe(10 - 3);
    expect(sinkTransport(sunk, 'boat')).toBe(sunk);
  });

  it('no tick, casco a 0 de vida baixa a pop uma vez e eventos repetidos não baixam de novo', () => {
    const dying = { ...loadedBoat(), units: loadedBoat().units.map((u) => ({ ...u, health: 0 })) };
    const once = tickGameState(dying, ctx()).state;
    expect(once.units.find((u) => u.id === 'boat')).toBeUndefined();
    expect(once.playerResources.player1.pop).toBe(7);
    const again = tickGameState(once, ctx()).state;
    expect(again.playerResources.player1.pop).toBe(7);
  });
});

function ctx(overrides: Partial<SimulationContext> = {}): SimulationContext {
  return {
    playerSlot: 'player1', mode: 'host', activeSlots: ['player1'], gatherRadiusLimit: 14, sustainableForestryEnabled: false,
    buildingDefinitions: {}, random: () => 0.9, createId: () => 'id', ...overrides,
  };
}

describe('interface do porão: prévia, confirmação e dois donos', () => {
  const twoOwners = (): GameState => ({
    units: [boat(), boat({ id: 'boat2', owner: 'player2', position: { x: 24, z: 20 } })],
    buildings: [dock(), { ...dock(), id: 'd2', owner: 'player2', position: { x: 26, z: 20 } }],
    resourceNodes: [], mapSize: 192,
    playerResources: { player1: { ...rich, wood: 300 }, player2: { ...rich, wood: 120 } },
  });
  const terrain = { canStandAt: () => true, localityOf };

  it('o porão mostra o estado real e distingue transporte (200) de mercante (100/125)', () => {
    expect(holdOf(boat())).toMatchObject({ kind: 'colonial', capacity: 200, passengerCapacity: 6, used: 0 });
    expect(holdOf(boat({ type: 'trade_boat' }))).toMatchObject({ kind: 'merchant', capacity: 100, passengerCapacity: 4 });
    expect(holdOf(boat({ type: 'trade_boat' }), true).capacity).toBe(125);
    expect(holdOf(boat({ kit: true, cargo: { wood: 10, food: 0, gold: 0, stone: 0, planks: 0 } }))).toMatchObject({ used: 210, kitOnBoard: true, cargo: 10 });
  });

  it('a prévia explica a recusa e não muta o estado', () => {
    const state = twoOwners();
    const before = JSON.stringify(state);
    expect(previewLoad(state, 'boat', HOME, { wood: 50 }, localityOf)).toMatchObject({ ok: true, reasons: [], origin: HOME });
    expect(previewLoad(state, 'boat', HOME, { wood: 900 }, localityOf).reasons.join(' ')).toMatch(/Porão cheio/);
    expect(previewLoad(state, 'boat', HOME, { gold: 150, wood: 9000 }, localityOf).reasons.join(' ')).toMatch(/Falta .* de madeira no estoque de Metrópole/);
    const far = { ...state, units: [boat({ position: { x: 80, z: 80 } }), state.units[1]] };
    expect(previewLoad(far, 'boat', HOME, { wood: 10 }, localityOf).reasons.join(' ')).toMatch(/longe de um posto ou cais/);
    expect(previewKit(world({ units: [boat({ type: 'trade_boat' })] }), 'boat', HOME, localityOf).reasons.join(' ')).toMatch(/Só o transporte colonial/);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('a prévia de desembarque explica praia bloqueada e preserva a carga', () => {
    const state = world({ units: [boat({ cargo: { wood: 20, food: 0, gold: 0, stone: 0, planks: 0 }, passengers: [soldier('a')] })] });
    expect(previewDisembark(state, 'boat', sea, '1')).toMatchObject({ ok: false, passengers: 1, cargo: true });
    expect(previewDisembark(state, 'boat', sea, '1').reason).toMatch(/Praia bloqueada/);
    expect(previewDisembark(state, 'boat', land, '1')).toMatchObject({ ok: true, destination: 'Colônia (ilha 1)' });
    expect(previewDisembark(world(), 'boat', land, HOME)).toMatchObject({ ok: false });
  });

  it('o host revalida: autoriza só o dono, com saldo, capacidade e apoio; a prévia antiga não vale se o estoque mudou', () => {
    const state = twoOwners();
    const command = { type: 'load_cargo', boatId: 'boat', cargo: { wood: 150 } };
    expect(isAuthorizedPlayerCommand(state, command, 'player1', undefined, terrain)).toBe(true);
    expect(isAuthorizedPlayerCommand(state, command, 'player2', undefined, terrain)).toBe(false); // barco alheio
    expect(isAuthorizedPlayerCommand(state, { ...command, cargo: { wood: 150, gold: 150 } }, 'player1', undefined, terrain)).toBe(false); // 500 > 200
    expect(isAuthorizedPlayerCommand(state, { type: 'load_kit', boatId: 'boat' }, 'player1', undefined, terrain)).toBe(true);
    const spent = { ...state, playerResources: { ...state.playerResources, player1: { ...rich, wood: 10 } } };
    expect(isAuthorizedPlayerCommand(spent, command, 'player1', undefined, terrain)).toBe(false);
    expect(loadCargo(spent, 'boat', HOME, { wood: 150 }, localityOf)).toBeNull();
    expect(isAuthorizedPlayerCommand(state, { type: 'load_cargo', boatId: 'boat', cargo: { wood: -5 } }, 'player1', undefined, terrain)).toBe(false);
    expect(isAuthorizedPlayerCommand(state, { type: 'load_cargo', boatId: 'boat', cargo: { ouro: 5 } }, 'player1', undefined, terrain)).toBe(false);
  });

  it('dois donos carregando na mesma doca conservam quantidade e origem, sem vazar entre estoques', () => {
    let state = twoOwners();
    const total = () => state.playerResources.player1.wood + state.playerResources.player2.wood
      + (state.units.find((u) => u.id === 'boat')!.cargo?.wood ?? 0) + (state.units.find((u) => u.id === 'boat2')!.cargo?.wood ?? 0);
    expect(total()).toBe(420);
    state = loadCargo(state, 'boat', HOME, { wood: 200 }, localityOf)!;
    state = loadCargo(state, 'boat2', HOME, { wood: 100 }, localityOf)!;
    expect(total()).toBe(420);
    expect(state.playerResources.player1.wood).toBe(100);
    expect(state.playerResources.player2.wood).toBe(20);
    expect(loadCargo(state, 'boat2', HOME, { wood: 100 }, localityOf)).toBeNull(); // saldo do dono 2 acabou
    expect(loadCargo(state, 'boat', HOME, { wood: 1 }, localityOf)).toBeNull(); // porão do dono 1 cheio
    expect(total()).toBe(420);
  });
});
