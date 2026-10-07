import { describe, expect, it } from 'vitest';
import { generateProceduralTerrain, type ProceduralMapResult } from '../../src/game/proceduralMap';
import { coastRadiusAt } from '../../src/game/archipelago';
import { checkBuildingPlacementValid } from '../../src/game/buildingGhost';

const SIZE = 60;
const SEEDS = [24680, 13579, 777];

const mapCache = new Map<number, ProceduralMapResult>();
function getMap(seed: number): ProceduralMapResult {
  let map = mapCache.get(seed);
  if (!map) {
    map = generateProceduralTerrain(SIZE, seed);
    mapCache.set(seed, map);
  }
  return map;
}

const resourceLayout = (map: ProceduralMapResult) =>
  map.resourceNodes.map(({ id, type, position, remaining }) => ({ id, type, position, remaining }));

/** BFS 4-vizinhanca com predicates do proprio mapa (celula avaliada no centro). */
function bfs(
  _map: ProceduralMapResult,
  startX: number,
  startZ: number,
  isBlocked: (x: number, z: number) => boolean
): Uint8Array {
  const visited = new Uint8Array(SIZE * SIZE);
  const sx = Math.floor(startX);
  const sz = Math.floor(startZ);
  if (sx < 0 || sz < 0 || sx >= SIZE || sz >= SIZE) return visited;
  if (isBlocked(sx + 0.5, sz + 0.5)) return visited;
  visited[sz * SIZE + sx] = 1;
  const queue: number[] = [sz * SIZE + sx];
  while (queue.length > 0) {
    const idx = queue.pop()!;
    const x = idx % SIZE;
    const z = (idx / SIZE) | 0;
    for (const [nx, nz] of [
      [x + 1, z],
      [x - 1, z],
      [x, z + 1],
      [x, z - 1],
    ]) {
      if (nx < 0 || nz < 0 || nx >= SIZE || nz >= SIZE) continue;
      const nIdx = nz * SIZE + nx;
      if (visited[nIdx]) continue;
      if (isBlocked(nx + 0.5, nz + 0.5)) continue;
      visited[nIdx] = 1;
      queue.push(nIdx);
    }
  }
  return visited;
}

const bfsOcean = (map: ProceduralMapResult) => bfs(map, 0, 0, (x, z) => !map.isOceanAt(x, z));
const bfsLandFrom = (map: ProceduralMapResult, sx: number, sz: number) =>
  bfs(map, sx, sz, (x, z) => map.isImpassableAt(x, z));

describe('generateProceduralTerrain', () => {
  it('produces the same resource layout and terrain for the same seed', () => {
    const first = generateProceduralTerrain(SIZE, 24680);
    const second = generateProceduralTerrain(SIZE, 24680);

    expect(resourceLayout(first)).toEqual(resourceLayout(second));
    expect(first.getHeightAt(20, 30)).toBe(second.getHeightAt(20, 30));
  });

  it('produces the same terrain mesh geometry for the same seed', () => {
    const first = generateProceduralTerrain(SIZE, 12345);
    const second = generateProceduralTerrain(SIZE, 12345);

    expect(first.seed).toBe(second.seed);
    expect(Array.from(first.terrainMesh.geometry.attributes.position.array)).toEqual(
      Array.from(second.terrainMesh.geometry.attributes.position.array)
    );
  });

  it('changes the generated resource layout when the seed changes', () => {
    const first = generateProceduralTerrain(SIZE, 24680);
    const second = generateProceduralTerrain(SIZE, 13579);

    expect(first.resourceNodes.map(({ position }) => position)).not.toEqual(
      second.resourceNodes.map(({ position }) => position)
    );
  });

  it('changes the terrain mesh when the seed changes', () => {
    const first = generateProceduralTerrain(SIZE, 12345);
    const second = generateProceduralTerrain(SIZE, 54321);

    expect(Array.from(first.terrainMesh.geometry.attributes.position.array)).not.toEqual(
      Array.from(second.terrainMesh.geometry.attributes.position.array)
    );
  });

  it('offers four valid, resource-free spawn plateaus (one per island)', () => {
    SEEDS.forEach((seed) => {
      const map = getMap(seed);
      const spawns = [map.player1Spawn, map.player2Spawn, map.player3Spawn, map.player4Spawn];

      expect(spawns).toEqual([
        { x: 16, z: 16 },
        { x: 44, z: 44 },
        { x: 16, z: 44 },
        { x: 44, z: 16 },
      ]);

      spawns.forEach((spawn) => {
        expect(map.isWaterAt(spawn.x, spawn.z)).toBe(false);
        expect(map.isCliffAt(spawn.x, spawn.z)).toBe(false);
        expect(map.getHeightAt(spawn.x, spawn.z)).toBeCloseTo(0.32, 5);
        const closestResource = Math.min(
          ...map.resourceNodes.map((node) => Math.hypot(node.position.x - spawn.x, node.position.z - spawn.z))
        );
        expect(closestResource).toBeGreaterThan(4.5);
      });
    });
  });

  it('carrega quatro ilhas com perfis distintos e legiveis', () => {
    SEEDS.forEach((seed) => {
      const map = getMap(seed);
      expect(map.islands).toHaveLength(4);
      const profiles = map.islands.map((i) => i.profile);
      expect(new Set(profiles).size).toBe(4);
      expect(profiles).toContain('floresta');

      // Recursos economicos distintos entre ilhas (criterio #40)
      const florestaIdx = profiles.indexOf('floresta');
      const aridaIdx = profiles.indexOf('arida');
      const onIsland = (node: { position: { x: number; z: number } }, idx: number) => {
        const isl = map.islands[idx];
        const angle = Math.atan2(node.position.z - isl.center.z, node.position.x - isl.center.x);
        const dist = Math.hypot(node.position.x - isl.center.x, node.position.z - isl.center.z);
        return dist <= coastRadiusAt(isl, angle);
      };
      const countNodes = (idx: number, type: string) =>
        map.resourceNodes.filter((n) => n.type === type && onIsland(n, idx)).length;
      if (aridaIdx >= 0) {
        expect(countNodes(florestaIdx, 'tree')).toBeGreaterThan(countNodes(aridaIdx, 'tree'));
        expect(countNodes(aridaIdx, 'gold_mine')).toBeGreaterThanOrEqual(countNodes(florestaIdx, 'gold_mine'));
      }
    });
  });

  it('mantem o oceano continuo e navegavel ao redor de todas as ilhas', () => {
    SEEDS.forEach((seed) => {
      const map = getMap(seed);
      const ocean = bfsOcean(map);

      map.islands.forEach((island) => {
        for (let i = 0; i < 36; i++) {
          const angle = (i / 36) * Math.PI * 2;
          const coast = coastRadiusAt(island, angle);
          const x = island.center.x + Math.cos(angle) * (coast + 0.6);
          const z = island.center.z + Math.sin(angle) * (coast + 0.6);
          expect(map.isOceanAt(x, z)).toBe(true);
          // Celula vizinha com centro no oceano deve estar no BFS naval
          let visitedNearby = false;
          for (let ox = -1; ox <= 1 && !visitedNearby; ox++) {
            for (let oz = -1; oz <= 1 && !visitedNearby; oz++) {
              const gx = Math.floor(x) + ox;
              const gz = Math.floor(z) + oz;
              if (gx < 0 || gz < 0 || gx >= SIZE || gz >= SIZE) continue;
              if (map.isOceanAt(gx + 0.5, gz + 0.5) && ocean[gz * SIZE + gx] === 1) {
                visitedNearby = true;
              }
            }
          }
          expect(visitedNearby).toBe(true);
        }
      });

      // Cardumes ficam no oceano e sao alcancaveis por navegacao
      map.resourceNodes
        .filter((n) => n.type === 'fish_school')
        .forEach((fish) => {
          expect(map.isOceanAt(fish.position.x, fish.position.z)).toBe(true);
          const gx = Math.floor(fish.position.x);
          const gz = Math.floor(fish.position.z);
          expect(ocean[gz * SIZE + gx]).toBe(1);
        });
    });
  });

  it('separa as ilhas por terra: nenhuma tropa cruza o canal', () => {
    const map = getMap(SEEDS[0]);
    const spawns = [map.player1Spawn, map.player2Spawn, map.player3Spawn, map.player4Spawn];
    const reachable = spawns.map((s) => bfsLandFrom(map, s.x, s.z));

    spawns.forEach((spawn, i) => {
      expect(reachable[i][Math.floor(spawn.z) * SIZE + Math.floor(spawn.x)]).toBe(1);
      spawns.forEach((other, j) => {
        if (i === j) return;
        expect(reachable[j][Math.floor(other.z) * SIZE + Math.floor(other.x)]).toBe(1);
        // A ilha de "other" nao e alcancavel a partir da ilha de "spawn"
        const otherIdx = Math.floor(other.z) * SIZE + Math.floor(other.x);
        const islandOfOther = map.islands[j];
        const farCell =
          (Math.floor(islandOfOther.center.z) * SIZE + Math.floor(islandOfOther.center.x)) | 0;
        expect(reachable[i][farCell]).toBe(0);
        expect(reachable[i][otherIdx]).toBe(0);
      });
    });
  });

  it('rios e lagos bloqueiam barcos mas nunca tocam o oceano', () => {
    SEEDS.forEach((seed) => {
      const map = getMap(seed);
      const ocean = bfsOcean(map);

      map.islands.forEach((island) => {
        // Lagos: agua doce, barco (oceano) bloqueado, oceano nao entra la
        island.lakes.forEach((lake) => {
          expect(map.isWaterAt(lake.x, lake.z)).toBe(true);
          expect(map.isOceanAt(lake.x, lake.z)).toBe(false);
          const gx = Math.floor(lake.x);
          const gz = Math.floor(lake.z);
          expect(ocean[gz * SIZE + gx]).toBe(0);
        });

        // Rio: celula comum e terra intransitavel para barco e para tropa
        if (island.river) {
          const river = island.river;
          const normal = river.points[3];
          expect(map.getCellAt(normal.x, normal.z).isRiver).toBe(true);
          expect(map.isOceanAt(normal.x, normal.z)).toBe(false);
          expect(map.isImpassableAt(normal.x, normal.z)).toBe(true);

          // Vado: unica travessia terrestre sobre agua
          const ford = river.points[river.fordIndex];
          expect(map.getCellAt(ford.x, ford.z).isRiver).toBe(true);
          expect(map.getCellAt(ford.x, ford.z).isShallow).toBe(true);
          expect(map.isImpassableAt(ford.x, ford.z)).toBe(false);

          // Rio inteiro fora do oceano (endorreico)
          river.points.forEach((p) => {
            expect(map.isOceanAt(p.x, p.z)).toBe(false);
            const gx = Math.floor(p.x);
            const gz = Math.floor(p.z);
            expect(ocean[gz * SIZE + gx]).toBe(0);
          });
        }
      });
    });
  });

  it('todos os recursos terrestres sao alcancaveis a partir de um nascedouro', () => {
    SEEDS.forEach((seed) => {
      const map = getMap(seed);
      const spawns = [map.player1Spawn, map.player2Spawn, map.player3Spawn, map.player4Spawn];
      const reachable = spawns.map((s) => bfsLandFrom(map, s.x, s.z));

      map.resourceNodes
        .filter((n) => n.type !== 'fish_school')
        .forEach((node) => {
          const gx = Math.floor(node.position.x);
          const gz = Math.floor(node.position.z);
          const reached = reachable.some((set) => set[gz * SIZE + gx] === 1);
          expect(reached, `${node.id} em ${gx},${gz} deve ser alcancavel por terra`).toBe(true);
        });
    });
  });

  it('cada nascedouro tem area construivel ao redor (town center valido)', () => {
    SEEDS.forEach((seed) => {
      const map = getMap(seed);
      const spawns = [map.player1Spawn, map.player2Spawn, map.player3Spawn, map.player4Spawn];

      spawns.forEach((spawn, spawnIdx) => {
        // Circulacao: a ilha toda deve ser alcancavel a pe do nascedouro
        const land = bfsLandFrom(map, spawn.x, spawn.z);
        const walkableCells = land.reduce((sum, v) => sum + v, 0);
        expect(walkableCells, `seed ${seed} ilha ${spawnIdx} precisa de area utilizavel`).toBeGreaterThanOrEqual(100);

        // Spot central: vaga do centro da vila sempre viavel
        const centerCheck = checkBuildingPlacementValid(
          'house',
          spawn.x,
          spawn.z,
          [],
          map.resourceNodes,
          SIZE,
          map.isWaterAt,
          map.isCliffAt,
          map.getHeightAt
        );
        expect(centerCheck.isValid, `seed ${seed} ilha ${spawnIdx} centro da vila viavel`).toBe(true);

        // Expansao imediata: suficientes celulas construiveis num raio de 6
        // (nos de recursos ficam a ~4.6 e bloqueiam alguns angulos por design)
        let buildable = 0;
        for (let x = 0; x < SIZE; x++) {
          for (let z = 0; z < SIZE; z++) {
            const cx = x + 0.5;
            const cz = z + 0.5;
            if (Math.hypot(cx - spawn.x, cz - spawn.z) > 6) continue;
            const check = checkBuildingPlacementValid(
              'house',
              cx,
              cz,
              [],
              map.resourceNodes,
              SIZE,
              map.isWaterAt,
              map.isCliffAt,
              map.getHeightAt
            );
            if (check.isValid) buildable++;
          }
        }
        expect(buildable, `seed ${seed} ilha ${spawnIdx} com ${buildable} celulas construiveis`).toBeGreaterThanOrEqual(25);
      });
    });
  });
});
