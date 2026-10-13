import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DECORATION_DEFS } from '../../src/game/decorations';
import { decorationPlacementReason, nextRotation, placeDecoration, rotatedFootprint } from '../../src/game/decor';
import { HOME, stockAt, type LocalityResolver } from '../../src/game/depots';
import type { Building, GameState } from '../../src/game/model';
import { isAuthorizedPlayerCommand, isValidNetworkCommand } from '../../src/game/networkCommands';
import { filterSnapshotFor } from '../../src/game/snapshotFilter';
import { applyDelta, diffStates } from '../../src/game/snapshotDelta';
import { createTechState, type Era } from '../../src/game/tech';
import { updateOwnerVision } from '../../src/game/visionAuthority';

const res = { wood: 500, food: 0, gold: 500, stone: 500, planks: 0, firewood: 50, pop: 1, maxPop: 10 };
const house: Building = { id: 'h', type: 'house', owner: 'player1', position: { x: 30, z: 30 }, health: 450, maxHealth: 450, isComplete: true, trainingQueue: [] };
const world = (era: Era = 'pedra', extra: Partial<GameState> = {}): GameState => ({
  units: [], buildings: [house], resourceNodes: [{ id: 't', type: 'tree', position: { x: 40, z: 40 }, remaining: 100 }], mapSize: 100,
  playerResources: { player1: { ...res }, player2: { ...res } },
  techs: { player1: { ...createTechState(), era }, player2: createTechState() }, ...extra,
});
const at = (type: string, x: number, z: number, rotation = 0) => ({ type, position: { x, z }, rotation });

describe('registro de enfeites (#180)', () => {
  it('enfeites e a muda, um por arquivo, com era, custo, área e beleza', () => {
    const files = readdirSync(join(__dirname, '../../src/game/decorations')).filter((f) => f.endsWith('.ts') && !['index.ts', 'types.ts'].includes(f));
    expect(files).toHaveLength(DECORATION_DEFS.length);
    expect(DECORATION_DEFS).toHaveLength(6);
    expect(DECORATION_DEFS.map((def) => def.era)).toEqual(['pedra', 'pedra', 'pedra', 'bronze', 'ferro', 'medieval']);
    for (const def of DECORATION_DEFS) expect(def.beauty > 0 && def.radius > 0).toBe(true);
    for (const def of DECORATION_DEFS) expect(Object.values(def.cost).every((amount) => (amount ?? 0) > 0)).toBe(true);
  });

  it('girar troca largura e profundidade em 90 e 270 graus; quatro giros voltam ao início', () => {
    const banner = DECORATION_DEFS.find((def) => def.id === 'banner')!;
    expect(rotatedFootprint(banner, 0)).toEqual({ width: 1, depth: 2 });
    expect(rotatedFootprint(banner, 1)).toEqual({ width: 2, depth: 1 });
    expect(nextRotation(nextRotation(nextRotation(nextRotation(0))))).toBe(0);
  });
});

describe('posicionar enfeite', () => {
  it('põe o enfeite, debita o custo e guarda posição e rotação', () => {
    const placed = placeDecoration(world(), 'player1', at('flower_bed', 50, 50, 1), 'd1');
    expect(placed.decorations).toEqual([{ id: 'd1', type: 'flower_bed', owner: 'player1', position: { x: 50, z: 50 }, rotation: 1 }]);
    expect(placed.playerResources.player1.wood).toBe(485);
  });

  it('CONTROLE NEGATIVO: era, rotação, sobreposição, borda, terreno e custo recusam sem gastar nada', () => {
    const state = world();
    expect(decorationPlacementReason(state, 'player1', at('brazier', 50, 50))).toBe('Exige a Era do Bronze.');
    expect(decorationPlacementReason(world('bronze'), 'player1', at('brazier', 50, 50))).toBeNull();
    expect(decorationPlacementReason(state, 'player1', at('menhir', 50, 50, 4))).toBe('Rotação inválida.');
    expect(decorationPlacementReason(state, 'player1', at('menhir', 50, 50, 0.5))).toBe('Rotação inválida.');
    expect(decorationPlacementReason(state, 'player1', at('menhir', 30, 31))).toBe('Sobrepõe uma construção.');
    expect(decorationPlacementReason(state, 'player1', at('menhir', 40, 40))).toBe('Sobrepõe um recurso.');
    expect(decorationPlacementReason(state, 'player1', at('menhir', 0, 50))).toBe('Fora do limite da ilha.');
    expect(decorationPlacementReason(state, 'player1', at('menhir', 50, 50), { canStandAt: () => false })).toBe('Terreno intransitável.');
    expect(decorationPlacementReason(state, 'player1', at('menhir', 50, 50), { isWaterAt: () => true })).toBe('Enfeite não vai na água.');
    expect(decorationPlacementReason(state, 'player1', at('alquimia', 50, 50))).toBe('Enfeite desconhecido.');
    const poor = world('pedra', { playerResources: { player1: { ...res, stone: 10 }, player2: res } });
    expect(decorationPlacementReason(poor, 'player1', at('menhir', 50, 50))).toBe('Recursos insuficientes na ilha.');
    expect(placeDecoration(poor, 'player1', at('menhir', 50, 50), 'x')).toBe(poor);
  });

  it('a rotação muda o que sobrepõe: ao lado do estandarte, outro cabe em pé mas não deitado', () => {
    const first = placeDecoration(world('medieval'), 'player1', at('banner', 50, 50, 0), 'b1'); // x de 49,5 a 50,5
    expect(decorationPlacementReason(first, 'player1', at('banner', 51, 50, 0))).toBeNull(); // em pé: x de 50,5 a 51,5, encosta
    expect(decorationPlacementReason(first, 'player1', at('banner', 51, 50, 1))).toBe('Sobrepõe outro enfeite.'); // deitado: x de 50 a 52
  });

  it('paga com o estoque da ilha onde fica: na colônia, o estoque local', () => {
    const localityOf: LocalityResolver = (_owner, position) => (position.x < 60 ? HOME : '1');
    const colony = world('pedra', { localStocks: { player1: { '1': { wood: 0, food: 0, gold: 0, stone: 40, planks: 0 } } } });
    const placed = placeDecoration(colony, 'player1', at('menhir', 80, 50), 'm1', { localityOf });
    expect(stockAt(placed, 'player1', '1').stone).toBe(10);
    expect(placed.playerResources.player1.stone).toBe(500);
    expect(decorationPlacementReason(colony, 'player1', at('flower_bed', 80, 50), { localityOf })).toBe('Recursos insuficientes na ilha.');
  });
});

describe('rede', () => {
  const cmd = { type: 'place_decoration', decoration: 'menhir', position: { x: 50, z: 50 }, rotation: 2 };

  it('formato: enfeite do registro, posição e quartos de volta inteiros', () => {
    expect(isValidNetworkCommand(cmd, 100)).toBe(true);
    expect(isValidNetworkCommand({ ...cmd, rotation: 90 }, 100)).toBe(false);
    expect(isValidNetworkCommand({ ...cmd, decoration: 'alquimia' }, 100)).toBe(false);
    expect(isValidNetworkCommand({ ...cmd, extra: true }, 100)).toBe(false);
  });

  it('o host só aceita em local explorado e com a regra cumprida', () => {
    const state = world();
    const vision = updateOwnerVision(undefined, { ...state, units: [{ id: 'v', type: 'villager', owner: 'player1', position: { x: 50, z: 50 }, targetPosition: null, targetEntityId: null, health: 100, maxHealth: 100, attackDamage: 3, state: 'idle' }] }, ['player1', 'player2'], 100);
    expect(isAuthorizedPlayerCommand(state, cmd, 'player1', vision)).toBe(true);
    expect(isAuthorizedPlayerCommand(state, { ...cmd, position: { x: 95, z: 95 } }, 'player1', vision)).toBe(false); // névoa
    expect(isAuthorizedPlayerCommand(state, { ...cmd, decoration: 'fountain' }, 'player1', vision)).toBe(false); // Ferro
  });

  it('snapshot: enfeite alheio só aparece em célula explorada, e a diferença entre estados leva os enfeites', () => {
    const placed = placeDecoration(world(), 'player2', at('menhir', 80, 80), 'e1');
    const vision = updateOwnerVision(undefined, { ...placed, units: [] }, ['player1', 'player2'], 100);
    expect(filterSnapshotFor(placed, 'player1', vision).decorations).toEqual([]);
    expect(filterSnapshotFor(placed, 'player2', vision).decorations).toHaveLength(1);
    expect(applyDelta(world(), diffStates(world(), placed)).decorations).toEqual(placed.decorations);
  });
});
