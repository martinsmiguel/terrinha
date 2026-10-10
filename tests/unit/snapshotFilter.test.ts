import { describe, expect, it } from 'vitest';
import type { Building, GameState, ResourceNode, Unit } from '../../src/game/model';
import { SECTOR_SIZE, filterSnapshotFor, sectorOf } from '../../src/game/snapshotFilter';
import { updateOwnerVision } from '../../src/game/visionAuthority';

const unit = (id: string, owner: string, x: number, z: number): Unit => ({
  id, type: 'villager', owner, position: { x, z }, targetPosition: null, targetEntityId: null, health: 100, maxHealth: 100, attackDamage: 0, state: 'idle',
});
const post = (id: string, owner: string, x: number, z: number): Building => ({ id, type: 'barracks', owner, position: { x, z }, health: 800, maxHealth: 800, isComplete: true, trainingQueue: [] });
const node = (id: string, x: number, z: number): ResourceNode => ({ id, type: 'tree', position: { x, z }, remaining: 100 });
const res = { wood: 1, food: 2, gold: 3, stone: 4, planks: 5, pop: 1, maxPop: 5 };
const base = (): GameState => ({
  mapSize: 200,
  units: [unit('mine', 'player2', 20, 20), unit('near', 'player1', 24, 20), unit('far', 'player1', 150, 150), unit('boat', 'player2', 180, 20)],
  buildings: [post('own', 'player2', 22, 22), post('hidden', 'player1', 160, 160)],
  resourceNodes: [node('seen', 25, 22), node('unknown', 170, 170)],
  playerResources: { player1: res, player2: { ...res, wood: 99 } },
  techs: { player1: { era: 'colonial', completed: [], queue: [] }, player2: { era: 'colonial', completed: [], queue: [] } },
  localStocks: { player2: { '1': { wood: 5, food: 0, gold: 0, stone: 0, planks: 0 } } },
});

describe('snapshot por destinatário', () => {
  const state = base();
  const vision = updateOwnerVision(undefined, state, ['player1', 'player2'], 200);

  it('o destinatário recebe tudo o que é dele, longe ou perto, sem depender de câmera', () => {
    const view = filterSnapshotFor(state, 'player2', vision);
    expect(view.units.map((u) => u.id)).toContain('mine');
    expect(view.units.map((u) => u.id)).toContain('boat'); // frota própria longe da base
    expect(view.buildings.map((b) => b.id)).toContain('own');
    expect(view.localStocks?.player2).toBeDefined();
  });

  it('inimigo só aparece sob visão atual; fora dela some, e o oculto não vaza', () => {
    const view = filterSnapshotFor(state, 'player2', vision);
    expect(view.units.map((u) => u.id)).toContain('near'); // do player1, a 4 células
    expect(view.units.map((u) => u.id)).not.toContain('far');
    expect(view.buildings.map((b) => b.id)).not.toContain('hidden');
  });

  it('saldos, pesquisa e estoques de outros donos não vão no snapshot', () => {
    const view = filterSnapshotFor(state, 'player2', vision);
    expect(Object.keys(view.playerResources)).toEqual(['player2']);
    expect(Object.keys(view.techs ?? {})).toEqual(['player2']);
    const other = filterSnapshotFor(state, 'player1', vision);
    expect(other.localStocks).toEqual({});
  });

  it('recursos só os já explorados', () => {
    const view = filterSnapshotFor(state, 'player2', vision);
    expect(view.resourceNodes.map((n) => n.id)).toEqual(['seen']);
  });

  it('a reentrada na visão traz o inimigo de volta e a exploração é preservada', () => {
    const moved: GameState = { ...state, units: state.units.map((u) => (u.id === 'far' ? { ...u, position: { x: 28, z: 24 } } : u)) };
    const next = updateOwnerVision(vision, moved, ['player1', 'player2'], 200);
    expect(filterSnapshotFor(moved, 'player2', next).units.map((u) => u.id)).toContain('far');
    const left: GameState = { ...moved, units: moved.units.map((u) => (u.id === 'far' ? { ...u, position: { x: 150, z: 150 } } : u)) };
    const after = updateOwnerVision(next, left, ['player1', 'player2'], 200);
    expect(filterSnapshotFor(left, 'player2', after).units.map((u) => u.id)).not.toContain('far');
    expect(filterSnapshotFor(left, 'player2', after).resourceNodes.map((n) => n.id)).toContain('seen');
  });

  it('o fallback sem visão envia só o que é do destinatário, nunca o mundo onisciente', () => {
    const view = filterSnapshotFor(state, 'player2', undefined);
    expect(view.units.every((u) => u.owner === 'player2')).toBe(true);
    expect(view.buildings.every((b) => b.owner === 'player2')).toBe(true);
    expect(view.resourceNodes).toEqual([]);
    expect(filterSnapshotFor(state, 'player3', vision).units).toEqual([]);
  });

  it('não muta o estado do host e reduz o tamanho enviado', () => {
    const before = JSON.stringify(state);
    const view = filterSnapshotFor(state, 'player2', vision);
    expect(JSON.stringify(state)).toBe(before);
    expect(JSON.stringify(view).length).toBeLessThan(before.length);
  });

  it('setores de 16x16 agrupam posições vizinhas', () => {
    expect(SECTOR_SIZE).toBe(16);
    expect(sectorOf(0, 0)).toBe(sectorOf(15.9, 15.9));
    expect(sectorOf(16, 0)).not.toBe(sectorOf(15.9, 0));
  });
});
