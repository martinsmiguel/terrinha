import { describe, expect, it } from 'vitest';
import type { Building, GameState, PlayerResources, ResourceNode } from '../../src/game/engine';
import { checkBuildingPlacementValid } from '../../src/game/buildingGhost';
import { hasOceanNearDock } from '../../src/game/dockPlacement';
import {
  findNearestOceanCell,
  generateProceduralTerrain,
  type ProceduralMapResult,
} from '../../src/game/proceduralMap';
import { applyBuildingFoundation } from '../../src/game/buildingOrders';
import { BUILDING_CATALOG } from '../../src/game/buildingDefs';
import { isAuthorizedPlayerCommand, isValidNetworkCommand } from '../../src/game/networkCommands';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';

const SIZE = 60;
const SEEDS = [24680, 13579, 777];
const MARGIN = 3.2;
const REASON_OCEAN = 'O Cais deve ser construído na margem do oceano navegável!';

const mapCache = new Map<number, ProceduralMapResult>();
function getMap(seed: number): ProceduralMapResult {
  const cached = mapCache.get(seed);
  if (cached) return cached;
  const map = generateProceduralTerrain(SIZE, seed);
  mapCache.set(seed, map);
  return map;
}

function checkDock(
  map: ProceduralMapResult,
  x: number,
  z: number,
  nodes: ResourceNode[] = []
) {
  return checkBuildingPlacementValid(
    'dock',
    x,
    z,
    [],
    nodes,
    SIZE,
    map.isWaterAt,
    map.isCliffAt,
    map.getHeightAt,
    map.isOceanAt
  );
}

const inBounds = (x: number, z: number) =>
  x >= MARGIN && x <= SIZE - MARGIN && z >= MARGIN && z <= SIZE - MARGIN;

function findValidDockSpot(map: ProceduralMapResult, nodes: ResourceNode[] = []) {
  for (let x = Math.ceil(MARGIN); x <= SIZE - MARGIN; x++) {
    for (let z = Math.ceil(MARGIN); z <= SIZE - MARGIN; z++) {
      if (checkDock(map, x, z, nodes).isValid) return { x, z };
    }
  }
  return null;
}

function findInteriorWaterSpot(map: ProceduralMapResult) {
  const candidates: { x: number; z: number }[] = [];
  for (const island of map.islands) {
    for (const lake of island.lakes) candidates.push({ x: lake.x, z: lake.z });
    if (island.river) {
      for (const point of island.river.points) candidates.push({ x: point.x, z: point.z });
    }
  }
  for (const spot of candidates) {
    const x = Math.round(spot.x);
    const z = Math.round(spot.z);
    if (!inBounds(x, z)) continue;
    if (map.isCliffAt(x, z)) continue;
    // Só interessa o ponto de água doce onde a janela do cais não toca oceano:
    // é exatamente o caso que a regra antiga aceitava por engano.
    if (map.isOceanAt(x, z)) continue;
    if (hasOceanNearDock(map.isOceanAt, x, z)) continue;
    if (!map.isWaterAt(x, z)) continue;
    return { x, z };
  }
  return null;
}

describe('validação do cais com geografia real', () => {
  it('aceita cais na costa com oceano navegável na janela (prévia e aplicação)', () => {
    SEEDS.forEach((seed) => {
      const map = getMap(seed);
      const spot = findValidDockSpot(map, map.resourceNodes);
      expect(spot, `seed ${seed}: nenhuma costa navegável aceita cais`).not.toBeNull();
      expect(hasOceanNearDock(map.isOceanAt, spot!.x, spot!.z)).toBe(true);
      expect(checkDock(map, spot!.x, spot!.z, map.resourceNodes).isValid).toBe(true);
    });
  });

  it('recusa cais em lago ou rio interior com mensagem clara', () => {
    let found = 0;
    SEEDS.forEach((seed) => {
      const map = getMap(seed);
      const spot = findInteriorWaterSpot(map);
      if (!spot) return;
      found++;
      const check = checkDock(map, spot.x, spot.z);
      expect(check.isValid, `seed ${seed}: cais em água doce interior aceito`).toBe(false);
      expect(check.reason).toBe(REASON_OCEAN);
    });
    expect(found, 'nenhuma água doce interior dentro dos limites').toBeGreaterThanOrEqual(1);
  });

  it('a mesma recusa vale para a prévia e para a aplicação autorizada', () => {
    let checked = 0;
    SEEDS.forEach((seed) => {
      const map = getMap(seed);
      const spot = findInteriorWaterSpot(map);
      if (!spot) return;
      checked++;
      // Prévia (hover) e validação do host (comando build) chamam a mesma função.
      const preview = checkDock(map, spot.x, spot.z);
      const authorized = checkDock(map, spot.x, spot.z);
      expect(preview.isValid).toBe(false);
      expect(authorized.isValid).toBe(false);
      expect(preview.reason).toBe(authorized.reason);
      expect(preview.reason).toBe(REASON_OCEAN);
    });
    expect(checked).toBeGreaterThanOrEqual(1);
  });

  it('bloqueia edificação terrestre em célula de oceano', () => {
    let blocked = 0;
    SEEDS.forEach((seed) => {
      const map = getMap(seed);
      let oceanCell: { x: number; z: number } | null = null;
      for (let x = Math.ceil(MARGIN); x <= SIZE - MARGIN && !oceanCell; x++) {
        for (let z = Math.ceil(MARGIN); z <= SIZE - MARGIN; z++) {
          if (map.isOceanAt(x, z)) {
            oceanCell = { x, z };
            break;
          }
        }
      }
      if (!oceanCell) return;
      const check = checkBuildingPlacementValid(
        'house',
        oceanCell.x,
        oceanCell.z,
        [],
        [],
        SIZE,
        map.isWaterAt,
        map.isCliffAt,
        map.getHeightAt,
        map.isOceanAt
      );
      expect(check.isValid, `seed ${seed}: casa aceita em oceano`).toBe(false);
      expect(check.reason).toBe(
        'Edificação terrestre não pode ser construída no oceano ou água profunda'
      );
      blocked++;
    });
    expect(blocked).toBeGreaterThanOrEqual(1);
  });

  it('cardume bloqueia o cais mesmo com oceano ao lado (bloqueio por recurso)', () => {
    let blocked = 0;
    SEEDS.forEach((seed) => {
      const map = getMap(seed);
      for (const node of map.resourceNodes) {
        if (node.type !== 'fish_school') continue;
        const x = Math.round(node.position.x);
        const z = Math.round(node.position.z);
        if (!inBounds(x, z)) continue;
        const check = checkDock(map, x, z, [node]);
        if (check.isValid) continue;
        if (check.reason !== 'Espaço bloqueado por recursos naturais') continue;
        blocked++;
        break;
      }
    });
    expect(blocked, 'nenhum cardume costeiro bloqueou o cais').toBeGreaterThanOrEqual(1);
  });
});

describe('nascimento do barco treinado no cais', () => {
  const playerResources = (): PlayerResources => ({
    wood: 100,
    food: 100,
    gold: 50,
    stone: 0,
    planks: 0,
    pop: 2,
    maxPop: 15,
  });

  const createState = (dock: { x: number; z: number }): GameState => ({
    units: [],
    buildings: [
      {
        id: 'dock-1',
        type: 'dock',
        owner: 'player1',
        position: { x: dock.x, z: dock.z },
        health: 700,
        maxHealth: 700,
        isComplete: true,
        buildProgress: 100,
        trainingQueue: [{ unitType: 'fishing_boat', progress: 100 }],
      } as Building,
    ],
    resourceNodes: [],
    playerResources: { player1: playerResources(), player2: playerResources() },
  });

  const context = (map: ProceduralMapResult): SimulationContext => ({
    playerSlot: 'player1',
    mode: 'host',
    map,
    nearestOceanCell: (x, z, maxRadius) => findNearestOceanCell(map, x, z, maxRadius),
    gatherRadiusLimit: 14,
    sustainableForestryEnabled: false,
    buildingDefinitions: {
      dock: { name: 'Cais & Doca Naval', buildTimeSeconds: 15 },
    },
    random: () => 0.9,
    createId: () => 'boat-1',
  });

  it('cais válido põe o barco em água navegável próxima, sem salto de ilha', () => {
    SEEDS.forEach((seed) => {
      const map = getMap(seed);
      const spot = findValidDockSpot(map, map.resourceNodes);
      expect(spot, `seed ${seed}: falta costa válida para o cais`).not.toBeNull();

      const state = createState(spot!);
      const result = tickGameState(state, context(map));

      const boat = result.state.units.find((unit) => unit.id === 'boat-1');
      expect(boat, `seed ${seed}: barco não nasceu`).toBeDefined();
      expect(boat!.type).toBe('fishing_boat');
      expect(
        map.isOceanAt(boat!.position.x, boat!.position.z),
        `seed ${seed}: barco fora do oceano em ${JSON.stringify(boat!.position)}`
      ).toBe(true);

      // Spawn fica na janela do cais (±2) ou no ponto preferido (+2.5/+2.5):
      // nunca há salto para outra ilha.
      const distance = Math.hypot(
        boat!.position.x - spot!.x,
        boat!.position.z - spot!.z
      );
      expect(
        distance,
        `seed ${seed}: barco nasceu a ${distance.toFixed(2)} células do cais`
      ).toBeLessThanOrEqual(3.6);

      expect(result.state.buildings[0].trainingQueue).toEqual([]);
      expect(result.state.playerResources.player1.pop).toBe(3);
    });
  });

  it('sem mapa aguarda sem consumir fila, aumentar população ou criar barco', () => {
    const map = getMap(SEEDS[0]);
    const spot = findValidDockSpot(map, map.resourceNodes)!;
    const state = createState(spot);
    const result = tickGameState(state, { ...context(map), map: undefined });
    expect(result.state.units).toEqual([]);
    expect(result.state.buildings[0].trainingQueue).toEqual(state.buildings[0].trainingQueue);
    expect(result.state.playerResources.player1.pop).toBe(2);
  });

  it('cais legado sem oceano não produz barco em terra nem perde fila', () => {
    const map = getMap(SEEDS[0]);
    let spot: {x:number;z:number} | null = null;
    for (let x=4;x<56&&!spot;x++) for(let z=4;z<56;z++) {
      if (!hasOceanNearDock(map.isOceanAt,x,z) && !map.isOceanAt(x+2.5,z+2.5)) { spot={x,z}; break; }
    }
    expect(spot).not.toBeNull();
    const state=createState(spot!);
    const result=tickGameState(state,context(map));
    expect(result.state.units).toEqual([]);
    expect(result.state.buildings[0].trainingQueue).toEqual(state.buildings[0].trainingQueue);
    expect(result.state.playerResources.player1.pop).toBe(2);
  });
});

describe('margem e aplicação atômica do host', () => {
  it('recusa cais sem a consulta autoritativa de oceano', () => {
    expect(checkBuildingPlacementValid('dock',20,20,[],[],SIZE).isValid).toBe(false);
    expect(checkBuildingPlacementValid('dock',20,20,[],[],SIZE,()=>true).isValid).toBe(false);
  });

  it('recusa janela inteiramente oceânica distante da terra', () => {
    const map=getMap(SEEDS[0]);
    let spot: {x:number;z:number} | null=null;
    for(let x=4;x<56&&!spot;x++) for(let z=4;z<56;z++) {
      let allOcean=true;
      for(let ox=-3;ox<=3;ox++) for(let oz=-3;oz<=3;oz++) if(!map.isOceanAt(x+ox,z+oz)) allOcean=false;
      if(allOcean) {spot={x,z};break;}
    }
    expect(spot).not.toBeNull();
    expect(checkDock(map,spot!.x,spot!.z)).toMatchObject({isValid:false,reason:REASON_OCEAN});
  });

  it('comando autorizado constrói na costa, debita uma vez e mantém estado nas recusas', () => {
    const map=getMap(SEEDS[0]);
    const spot=findValidDockSpot(map,map.resourceNodes)!;
    expect(spot).toBeDefined();
    const def=BUILDING_CATALOG.dock;
    const foundation:Building={id:'dock-host',type:'dock',owner:'player1',position:spot,
      health:70,maxHealth:700,isComplete:false,buildProgress:0,trainingQueue:[]};
    const state:GameState={units:[{id:'builder',type:'villager',owner:'player1',position:map.player1Spawn,
      health:100,maxHealth:100,attackDamage:2,state:'idle',targetPosition:null,targetEntityId:null}],
      buildings:[],resourceNodes:map.resourceNodes,
      playerResources:{player1:{wood:300,food:100,gold:100,stone:0,planks:0,pop:1,maxPop:15}}};
    const original=JSON.stringify(state);
    const command={type:'build',buildingType:'dock',owner:'player1',position:spot,builderIds:['builder']} as const;
    // Simula o JSON de rede, não um cast de payload autorizado.
    const payload:unknown=JSON.parse(JSON.stringify(command));
    expect(isValidNetworkCommand(payload)).toBe(true);
    expect(isAuthorizedPlayerCommand(state,payload,'player1')).toBe(true);
    const allowed=(current:GameState)=>checkBuildingPlacementValid('dock',spot.x,spot.z,
      current.buildings,current.resourceNodes,SIZE,map.isWaterAt,map.isCliffAt,map.getHeightAt,map.isOceanAt).isValid;
    const result=applyBuildingFoundation(state,foundation,def.cost,['builder'],allowed);
    expect(result.buildings).toEqual([foundation]);
    expect(result.playerResources.player1.wood).toBe(160);
    expect(result.units[0]).toMatchObject({state:'building',targetEntityId:'dock-host'});
    expect(applyBuildingFoundation(result,foundation,def.cost,['builder'],allowed)).toBe(result);
    expect(applyBuildingFoundation(state,foundation,def.cost,['builder'],()=>false)).toBe(state);
    expect(applyBuildingFoundation(state,foundation,def.cost,['foreign-builder'],allowed)).toBe(state);
    const poor={...state,playerResources:{player1:{...state.playerResources.player1,wood:139}}};
    expect(applyBuildingFoundation(poor,foundation,def.cost,['builder'],allowed)).toBe(poor);
    expect(isAuthorizedPlayerCommand(state,payload,'player2')).toBe(false);
    const inland=findInteriorWaterSpot(map);
    expect(inland).not.toBeNull();
    const inlandFoundation={...foundation,position:inland!};
    expect(applyBuildingFoundation(state,inlandFoundation,def.cost,['builder'],current=>
      checkBuildingPlacementValid('dock',inland!.x,inland!.z,current.buildings,[],SIZE,
        map.isWaterAt,map.isCliffAt,map.getHeightAt,map.isOceanAt).isValid)).toBe(state);
    expect(JSON.stringify(state)).toBe(original);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
