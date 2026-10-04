import { describe, expect, it } from 'vitest';
import { computeArchipelago } from '../../src/game/archipelago';
import {
  MINIMAP_PIXEL_SIZE,
  WORLD_MAP_PIXEL_SIZE,
  mapPixelToWorld,
  worldToCell,
  worldToMapPixel,
} from '../../src/game/mapProjection';
import { isIslandDiscovered, minimapClickTarget, worldMapClickTarget } from '../../src/game/worldMap';
import { VISION_VISIBLE, createVisionGrid, revealVision } from '../../src/game/visibility';

const MAP = 60;

/** Grid de nevoa com visao ativa centrada em uma celula. */
const gridSeeing = (x: number, z: number, radius = 2): Uint8Array =>
  revealVision(createVisionGrid({ size: MAP }), [{ x, z, radius }]);

describe('projecao compartilhada dos mapas', () => {
  it('converte mundo <-> pixel de forma invertivel no minimapa e no mapa-mundi', () => {
    for (const pixelSize of [MINIMAP_PIXEL_SIZE, WORLD_MAP_PIXEL_SIZE]) {
      for (const point of [{ x: 0, z: 0 }, { x: 30.5, z: 12.25 }, { x: MAP, z: MAP }]) {
        const pixel = worldToMapPixel(point.x, point.z, MAP, pixelSize);
        const back = mapPixelToWorld(pixel.x, pixel.y, MAP, pixelSize);
        expect(back.x).toBeCloseTo(point.x, 6);
        expect(back.z).toBeCloseTo(point.z, 6);
      }
    }
  });

  it('mantem a mesma posicao relativa nas duas superficies (mesma geometria do mundo)', () => {
    const world = { x: 18.4, z: 47.1 };
    const minimap = worldToMapPixel(world.x, world.z, MAP, MINIMAP_PIXEL_SIZE);
    const worldMap = worldToMapPixel(world.x, world.z, MAP, WORLD_MAP_PIXEL_SIZE);
    expect(minimap.x / MINIMAP_PIXEL_SIZE).toBeCloseTo(worldMap.x / WORLD_MAP_PIXEL_SIZE, 9);
    expect(minimap.y / MINIMAP_PIXEL_SIZE).toBeCloseTo(worldMap.y / WORLD_MAP_PIXEL_SIZE, 9);
  });

  it('prende o clique nas bordas do mapa em vez de gerar coordenadas fora do mundo', () => {
    const beyond = mapPixelToWorld(-50, WORLD_MAP_PIXEL_SIZE + 50, MAP, WORLD_MAP_PIXEL_SIZE);
    expect(beyond).toEqual({ x: 0, z: MAP });
  });
});

describe('clique no mapa-mundi', () => {
  it('leva a camera para a mesma celula apontada pelo minimapa', () => {
    const relativeX = 0.25;
    const relativeY = 0.75;
    const visibility = gridSeeing(15, 45);
    const target = worldMapClickTarget({
      pixelX: relativeX * WORLD_MAP_PIXEL_SIZE,
      pixelY: relativeY * WORLD_MAP_PIXEL_SIZE,
      mapSize: MAP,
      visibility,
    });
    const minimapTarget = minimapClickTarget(
      relativeX * MINIMAP_PIXEL_SIZE,
      relativeY * MINIMAP_PIXEL_SIZE,
      MAP,
      MINIMAP_PIXEL_SIZE
    );

    expect(target).not.toBeNull();
    expect(worldToCell(target!.x, target!.z, MAP)).toEqual(worldToCell(minimapTarget.x, minimapTarget.z, MAP));
    expect(worldToCell(target!.x, target!.z, MAP)).toEqual({ x: 15, z: 45 });
  });

  it('recusa navegar para uma regiao ainda desconhecida', () => {
    const visibility = gridSeeing(10, 10);
    expect(worldMapClickTarget({
      pixelX: 0.9 * WORLD_MAP_PIXEL_SIZE,
      pixelY: 0.9 * WORLD_MAP_PIXEL_SIZE,
      mapSize: MAP,
      visibility,
    })).toBeNull();
    expect(worldMapClickTarget({
      pixelX: (10.5 / MAP) * WORLD_MAP_PIXEL_SIZE,
      pixelY: (10.5 / MAP) * WORLD_MAP_PIXEL_SIZE,
      mapSize: MAP,
      visibility,
    })).toEqual({ x: 10.5, z: 10.5 });
  });

  it('so revela regioes desconhecidas quando o modo desenvolvedor esta ativo', () => {
    const dark = createVisionGrid({ size: MAP });
    const click = {
      pixelX: (50.5 / MAP) * WORLD_MAP_PIXEL_SIZE,
      pixelY: (50.5 / MAP) * WORLD_MAP_PIXEL_SIZE,
      mapSize: MAP,
      visibility: dark,
    };
    expect(worldMapClickTarget(click)).toBeNull();
    expect(worldMapClickTarget({ ...click, revealAll: true })).toEqual({ x: 50.5, z: 50.5 });
  });
});

describe('ilhas descobertas', () => {
  const layout = computeArchipelago(MAP, 24680);

  it('nao nomeia nenhuma ilha antes de qualquer exploracao', () => {
    const query = { mapSize: MAP, visibility: createVisionGrid({ size: MAP }) };
    expect(layout.islands.every((island) => isIslandDiscovered(island, query) === false)).toBe(true);
  });

  it('revela apenas a ilha efetivamente visitada', () => {
    const first = layout.islands[0];
    const vision = revealVision(createVisionGrid({ size: MAP }), [
      { x: first.center.x, z: first.center.z, radius: 3 },
    ]);
    const query = { mapSize: MAP, visibility: vision };
    expect(isIslandDiscovered(first, query)).toBe(true);
    layout.islands.slice(1).forEach((island) => {
      // Ilhas sem nenhuma celula explorada continuam anonimas.
      if (vision[Math.floor(island.center.x) * MAP + Math.floor(island.center.z)] !== VISION_VISIBLE) {
        expect(isIslandDiscovered(island, query)).toBe(false);
      }
    });
  });

  it('revela todas as ilhas em modo desenvolvedor', () => {
    const query = { mapSize: MAP, visibility: createVisionGrid({ size: MAP }), revealAll: true };
    expect(layout.islands.every((island) => isIslandDiscovered(island, query))).toBe(true);
  });
});
