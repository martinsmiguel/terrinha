import { describe, expect, it } from 'vitest';
import type { Building, GameState, PlayerResources, Unit } from '../../src/game/engine';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';
import { parseRuleSettings } from '../../src/game/unitAttributes';
import { updateOwnerVision } from '../../src/game/visionAuthority';

const playerResources = (): PlayerResources => ({
  wood: 100,
  food: 100,
  gold: 50,
  stone: 0,
  planks: 0,
  pop: 2,
  maxPop: 15,
});

const createState = (overrides: Partial<GameState> = {}): GameState => ({
  units: [],
  buildings: [],
  resourceNodes: [],
  playerResources: { player1: playerResources(), player2: playerResources() },
  ...overrides,
});

const createUnit = (overrides: Partial<Unit> = {}): Unit => ({
  id: 'unit-1',
  type: 'villager',
  owner: 'player1',
  position: { x: 10, z: 10 },
  targetPosition: null,
  targetEntityId: null,
  health: 100,
  maxHealth: 100,
  attackDamage: 5,
  state: 'idle',
  ...overrides,
});

const createBuilding = (overrides: Partial<Building> = {}): Building => ({
  id: 'building-1',
  type: 'town_center',
  owner: 'player1',
  position: { x: 10, z: 10 },
  health: 500,
  maxHealth: 500,
  isComplete: true,
  trainingQueue: [],
  ...overrides,
});

const context = (overrides: Partial<SimulationContext> = {}): SimulationContext => ({
  playerSlot: 'player1',
  mode: 'host',
  gatherRadiusLimit: 14,
  sustainableForestryEnabled: false,
  buildingDefinitions: {
    house: { name: 'Casa', buildTimeSeconds: 1 },
    town_center: { name: 'Centro da Vila', buildTimeSeconds: 10 },
  },
  random: () => 0.9,
  createId: () => 'trained-unit',
  ...overrides,
});

describe('tickGameState', () => {
  it('credits only the remainder of a nearly exhausted deposit', () => {
    const state = createState({
      units: [createUnit({ targetEntityId: 'ore', state: 'gathering' })],
      resourceNodes: [{ id: 'ore', type: 'stone', position: { x: 10.5, z: 10 }, remaining: 0.1 }],
    });
    const result = tickGameState(state, context());
    expect(result.state.playerResources.player1.stone).toBeCloseTo(0.1);
    expect(result.state.resourceNodes).toEqual([]);
  });

  it('does not let a civilian boat damage a target even with a forged attack state', () => {
    const state = createState({ units: [
      createUnit({ id: 'boat', type: 'trade_boat', state: 'attacking', targetEntityId: 'enemy' }),
      createUnit({ id: 'enemy', owner: 'player2', position: { x: 11, z: 10 } }),
    ] });
    const result = tickGameState(state, context());
    expect(result.state.units.find((unit) => unit.id === 'enemy')?.health).toBe(100);
    expect(result.state.units.find((unit) => unit.id === 'boat')).toMatchObject({ state: 'idle', targetEntityId: null });
  });
  it('moves units toward their target by one simulation step', () => {
    const state = createState({
      units: [createUnit({ targetPosition: { x: 12, z: 10 }, state: 'moving' })],
    });

    const result = tickGameState(state, context());

    expect(result.state.units[0].position).toEqual({ x: 10.16, z: 10 });
    expect(state.units[0].position).toEqual({ x: 10, z: 10 });
  });

  it('uses a validated rules override in the authoritative tick', () => {
    const state = createState({ units: [createUnit({ type: 'soldier', targetPosition: { x: 12, z: 10 }, state: 'moving' })] });
    const ruleSettings = parseRuleSettings({ version: 1, units: { soldier: { movePerTick: 0.25 } } });
    state.ruleSettings = ruleSettings;
    const result = tickGameState(state, context());
    expect(result.state.units[0].position.x).toBeCloseTo(10.25);
  });

  it('gathers resources and removes an exhausted deposit without mutating the input state', () => {
    const state = createState({
      units: [createUnit({ position: { x: 10, z: 10 }, targetEntityId: 'tree-1', state: 'gathering' })],
      resourceNodes: [{ id: 'tree-1', type: 'tree', position: { x: 10.5, z: 10 }, remaining: 0.5 }],
    });

    const result = tickGameState(state, context());

    expect(result.state.playerResources.player1.wood).toBe(100.5);
    expect(result.state.units[0]).toMatchObject({ state: 'idle', targetEntityId: null });
    expect(result.state.resourceNodes).toEqual([]);
    expect(state.playerResources.player1.wood).toBe(100);
    expect(state.resourceNodes[0].remaining).toBe(0.5);
  });

  it('applies combat damage and starts the attacker cooldown', () => {
    const state = createState({
      units: [
        createUnit({ id: 'soldier-1', type: 'soldier', state: 'attacking', targetEntityId: 'enemy-1' }),
        createUnit({ id: 'enemy-1', owner: 'player2', position: { x: 11, z: 10 }, health: 100 }),
      ],
    });

    const result = tickGameState(state, context());

    expect(result.state.units.find((unit) => unit.id === 'enemy-1')?.health).toBe(76);
    expect(result.state.units.find((unit) => unit.id === 'soldier-1')?.attackCooldown).toBe(12);
    expect(result.effects).toContainEqual({ type: 'sound', sound: 'combat-hit', musket: true });
  });

  it('completes unit training, creates a unit, and updates population', () => {
    const state = createState({
      buildings: [createBuilding({ trainingQueue: [{ unitType: 'soldier', progress: 98 }] })],
    });

    const result = tickGameState(state, context());

    expect(result.state.units).toContainEqual(expect.objectContaining({ id: 'trained-unit', type: 'soldier' }));
    expect(result.state.buildings[0].trainingQueue).toEqual([]);
    expect(result.state.playerResources.player1.pop).toBe(3);
    expect(result.effects).toContainEqual({ type: 'sound', sound: 'unit-trained', unitType: 'soldier' });
  });

  it('completes construction, restores building health, and grants house capacity', () => {
    const state = createState({
      units: [createUnit({ state: 'building', targetEntityId: 'house-1' })],
      buildings: [createBuilding({ id: 'house-1', type: 'house', isComplete: false, buildProgress: 99, health: 400, maxHealth: 450 })],
    });

    const result = tickGameState(state, context());

    expect(result.state.buildings[0]).toMatchObject({ isComplete: true, buildProgress: 100, health: 450 });
    expect(result.state.playerResources.player1.maxPop).toBe(20);
    expect(result.state.units[0]).toMatchObject({ state: 'idle', targetEntityId: null });
    expect(result.effects).toContainEqual({ type: 'notification', message: 'Construção Concluída: Casa!', level: 'success' });
  });
});

describe('single-player AI on the archipelago', () => {
  const aiContext = () =>
    context({ mode: 'single', playerSlot: 'player1', activeSlots: ['player1', 'player2'] });

  it('gathers from the nearest tree of its own base, never from another island', () => {
    const state = createState({
      units: [createUnit({ id: 'ai-villager', owner: 'player2', position: { x: 41, z: 41 } })],
      buildings: [
        createBuilding({ id: 'ai-tc', owner: 'player2', position: { x: 40, z: 40 } }),
        createBuilding({ id: 'human-tc', owner: 'player1', position: { x: 10, z: 10 } }),
      ],
      resourceNodes: [
        { id: 'near-tree', type: 'tree', position: { x: 43, z: 41 }, remaining: 100 },
        { id: 'far-tree', type: 'tree', position: { x: 11, z: 11 }, remaining: 100 },
      ],
    });

    const result = tickGameState(state, aiContext());
    const villager = result.state.units.find((unit) => unit.id === 'ai-villager');
    expect(villager?.targetEntityId).toBe('near-tree');
  });

  it('does not order the AI army to march across the ocean to the human base', () => {
    const soldiers = [1, 2, 3].map((index) =>
      createUnit({
        id: `ai-soldier-${index}`,
        type: 'soldier',
        owner: 'player2',
        position: { x: 41 + index, z: 41 },
      })
    );
    const state = createState({
      units: soldiers,
      buildings: [
        createBuilding({ id: 'ai-tc', owner: 'player2', position: { x: 40, z: 40 } }),
        createBuilding({ id: 'human-tc', owner: 'player1', position: { x: 10, z: 10 } }),
      ],
    });

    const result = tickGameState(state, aiContext());
    for (const soldier of result.state.units) {
      expect(soldier.targetPosition).toBeNull();
    }
  });
});

describe('simulation performance', () => {
  it('keeps twenty ticks responsive with a representative number of moving units', () => {
    const units = Array.from({ length: 120 }, (_, index) =>
      createUnit({
        id: `unit-${index}`,
        owner: index % 3 === 0 ? 'player2' : 'player1',
        position: { x: (index % 40) + 0.5, z: Math.floor(index / 40) + 0.5 },
        targetPosition: { x: (index % 40) + 0.5, z: 55.5 },
        state: 'moving',
      })
    );
    let state = createState({ units });
    const tickContext = context();

    const startedAt = performance.now();
    for (let tick = 0; tick < 20; tick++) {
      state = tickGameState(state, tickContext).state;
    }
    const elapsedMs = performance.now() - startedAt;

    expect(state.units).toHaveLength(120);
    expect(elapsedMs).toBeLessThan(2000);
  });

  describe('passos ilegais (F01)', () => {
    // Terra para x < 12; água e oceano para x >= 12.
    const map = {
      isWaterAt: (x: number) => x >= 12,
      isImpassableAt: (x: number) => x >= 12,
      isOceanAt: (x: number) => x >= 12,
    };
    const run = (state: GameState, ticks = 40) => {
      let current = state;
      for (let i = 0; i < ticks; i += 1) current = tickGameState(current, context({ map })).state;
      return current;
    };

    it('coletor não entra na água ao caminhar até um recurso do outro lado', () => {
      const state = createState({
        units: [createUnit({ position: { x: 10, z: 10 }, targetEntityId: 'tree', state: 'gathering' })],
        resourceNodes: [{ id: 'tree', type: 'tree', position: { x: 16, z: 10 }, remaining: 100 }],
      });
      const unit = run(state).units[0];
      expect(unit.position.x).toBeLessThan(12);
      expect(unit.state).toBe('idle');
      expect(unit.targetEntityId).toBeNull();
    });

    it('atacante terrestre não persegue o alvo para dentro da água', () => {
      const state = createState({
        units: [
          createUnit({ id: 'soldier', type: 'soldier', position: { x: 10, z: 10 }, targetEntityId: 'enemy', state: 'attacking' }),
          createUnit({ id: 'enemy', owner: 'player2', position: { x: 20, z: 10 } }),
        ],
      });
      const soldier = run(state).units.find((unit) => unit.id === 'soldier')!;
      expect(soldier.position.x).toBeLessThan(12);
      expect(soldier.state).toBe('idle');
    });

    it('construtor e reparador não atravessam terreno intransitável', () => {
      const building = createBuilding({ id: 'house', type: 'house', position: { x: 18, z: 10 }, isComplete: false, buildProgress: 0, health: 50, maxHealth: 500 });
      const builder = run(createState({
        units: [createUnit({ position: { x: 10, z: 10 }, targetEntityId: 'house', state: 'building' })],
        buildings: [building],
      })).units[0];
      expect(builder.position.x).toBeLessThan(12);
      const repairer = run(createState({
        units: [createUnit({ position: { x: 10, z: 10 }, targetEntityId: 'house', state: 'repairing' })],
        buildings: [{ ...building, isComplete: true, health: 100 }],
      })).units[0];
      expect(repairer.position.x).toBeLessThan(12);
    });

    it('barco de guerra não persegue alvo em terra e anda com a velocidade do catálogo', () => {
      const ship = createUnit({ id: 'ship', type: 'warship', position: { x: 14, z: 10 }, targetEntityId: 'enemy', state: 'attacking' });
      const enemy = createUnit({ id: 'enemy', owner: 'player2', position: { x: 4, z: 10 } });
      const result = run(createState({ units: [ship, enemy] }));
      expect(result.units.find((unit) => unit.id === 'ship')!.position.x).toBeGreaterThanOrEqual(12);
      const free = tickGameState(createState({
        units: [{ ...ship, position: { x: 14, z: 10 } }, { ...enemy, position: { x: 30, z: 10 } }],
      }), context({ map })).state.units.find((unit) => unit.id === 'ship')!;
      expect(free.position.x - 14).toBeCloseTo(0.16);
    });
  });

  describe('fundação da capital', () => {
    const wagon = (owner: string): Unit => createUnit({ id: `wagon-${owner}`, type: 'wagon', owner, health: 300, maxHealth: 300, attackDamage: 0 });
    const founding = (owner: string) => createBuilding({ id: `tc-${owner}`, owner, isComplete: false, buildProgress: 0, health: 240, maxHealth: 2400 });
    const slots = { activeSlots: ['player1', 'player2'] };

    it('a capital em obras avança sozinha e conclui em 20 s com aviso ao dono', () => {
      let current = createState({ buildings: [founding('player1'), createBuilding({ id: 'tc-player2', owner: 'player2' })], units: [wagon('player2')] });
      const effects: string[] = [];
      for (let tick = 0; tick < 400; tick += 1) {
        const result = tickGameState(current, context(slots));
        current = result.state;
        result.effects.forEach((effect) => effects.push(effect.type));
        if (tick === 398) expect(current.buildings.find((b) => b.id === 'tc-player1')!.isComplete).toBe(false);
      }
      const capital = current.buildings.find((b) => b.id === 'tc-player1')!;
      expect(capital).toMatchObject({ isComplete: true, health: 2400 });
      expect(effects.filter((type) => type === 'notification')).toHaveLength(1);
    });

    it('a partida não termina só porque falta o Centro: a carroça mantém o jogador vivo', () => {
      const state = createState({ units: [wagon('player1'), wagon('player2')] });
      expect(tickGameState(state, context(slots)).state.match).toEqual({ status: 'running', players: ['player1', 'player2'] });
    });

    it('sem carroça e sem capital o jogador é eliminado e o outro vence', () => {
      const state = createState({ units: [wagon('player2')] });
      expect(tickGameState(state, context(slots)).state.match).toEqual({ status: 'finished', winner: 'player2', players: ['player1', 'player2'] });
    });

    it('a IA só treina depois que a capital está concluída', () => {
      const ai = (isComplete: boolean) => createState({
        buildings: [createBuilding({ id: 'tc-ai', owner: 'player2', isComplete, buildProgress: isComplete ? 100 : 0, health: isComplete ? 2400 : 240, maxHealth: 2400 }), createBuilding({ id: 'tc-1', owner: 'player1' })],
        playerResources: { player1: playerResources(), player2: { ...playerResources(), food: 500, gold: 500 } },
      });
      const run = (state: GameState) => tickGameState(state, context({ mode: 'single', ...slots })).state.buildings.find((b) => b.id === 'tc-ai')!;
      expect(run(ai(false)).trainingQueue).toHaveLength(0);
      expect(run(ai(true)).trainingQueue.length).toBeGreaterThan(0);
    });
  });

  describe('eliminação e saída de jogadores', () => {
    it('jogador eliminado perde ordens e fila de produção; quem segue vivo mantém as dele', () => {
      const alive = createBuilding({ id: 'tc-1', owner: 'player1', trainingQueue: [{ unitType: 'villager', progress: 5 }] });
      const dead = createBuilding({ id: 'house-2', type: 'house', owner: 'player2', trainingQueue: [{ unitType: 'soldier', progress: 5 }] });
      const state = createState({
        buildings: [alive, dead],
        units: [
          createUnit({ id: 'mine', owner: 'player1', state: 'moving', targetPosition: { x: 20, z: 20 } }),
          createUnit({ id: 'theirs', owner: 'player2', state: 'moving', targetPosition: { x: 30, z: 30 } }),
        ],
      });
      const result = tickGameState(state, context({ activeSlots: ['player1', 'player2', 'player3'] })).state;
      expect(result.units.find((unit) => unit.id === 'theirs')).toMatchObject({ state: 'idle', targetPosition: null });
      expect(result.buildings.find((building) => building.id === 'house-2')!.trainingQueue).toEqual([]);
      expect(result.units.find((unit) => unit.id === 'mine')!.targetPosition).not.toBeNull();
    });

    it('convidado que saiu do host mantém as últimas ordens e nenhuma IA assume (modo host)', () => {
      const state = createState({
        buildings: [createBuilding({ id: 'tc-1', owner: 'player1' }), createBuilding({ id: 'tc-2', owner: 'player2' })],
        playerResources: { player1: playerResources(), player2: { ...playerResources(), food: 900, gold: 900 } },
        units: [createUnit({ id: 'left', owner: 'player2', state: 'moving', targetPosition: { x: 40, z: 40 } })],
      });
      let current = state;
      for (let tick = 0; tick < 5; tick += 1) current = tickGameState(current, context({ mode: 'host', activeSlots: ['player1'] })).state;
      const unit = current.units.find((candidate) => candidate.id === 'left')!;
      expect(unit.targetPosition).toEqual({ x: 40, z: 40 });
      expect(unit.position.x).toBeGreaterThan(10);
      expect(current.buildings.find((building) => building.id === 'tc-2')!.trainingQueue).toEqual([]);
    });
  });

  describe('visão autoritativa do host', () => {
    const owners = ['player1', 'player2'];
    const visionFor = (state: GameState, size = 60) => updateOwnerVision(undefined, state, owners, size);
    const withVision = (state: GameState, overrides: Partial<SimulationContext> = {}) =>
      context({ activeSlots: owners, vision: visionFor(state), ...overrides });

    it('a perseguição acaba quando o alvo inimigo sai de vista e continua enquanto ele é visível', () => {
      const attacker = createUnit({ id: 'soldier', type: 'soldier', position: { x: 10, z: 10 }, targetEntityId: 'enemy', state: 'attacking' });
      const near = createUnit({ id: 'enemy', owner: 'player2', position: { x: 16, z: 10 } });
      const hidden = { ...near, position: { x: 40, z: 40 } };
      const capital = (owner: string) => createBuilding({ id: `tc-${owner}`, owner, position: { x: owner === 'player1' ? 5 : 55, z: owner === 'player1' ? 5 : 55 } });
      const seen = createState({ units: [attacker, near], buildings: [capital('player1'), capital('player2')] });
      const unseen = createState({ units: [attacker, hidden], buildings: [capital('player1'), capital('player2')] });

      const kept = tickGameState(seen, withVision(seen)).state.units.find((u) => u.id === 'soldier')!;
      expect(kept).toMatchObject({ state: 'attacking', targetEntityId: 'enemy' });

      const lost = tickGameState(unseen, withVision(unseen)).state.units.find((u) => u.id === 'soldier')!;
      expect(lost).toMatchObject({ state: 'idle', targetEntityId: null });
      expect(lost.position).toEqual({ x: 10, z: 10 });
    });

    it('sem visão informada a perseguição segue como antes (legado e testes)', () => {
      const attacker = createUnit({ id: 'soldier', type: 'soldier', position: { x: 10, z: 10 }, targetEntityId: 'enemy', state: 'attacking' });
      const far = createUnit({ id: 'enemy', owner: 'player2', position: { x: 40, z: 40 } });
      const state = createState({ units: [attacker, far], buildings: [createBuilding({ owner: 'player1' }), createBuilding({ id: 'b2', owner: 'player2', position: { x: 55, z: 55 } })] });
      const moved = tickGameState(state, context({ activeSlots: owners })).state.units.find((u) => u.id === 'soldier')!;
      expect(moved.state).toBe('attacking');
    });

    it('a torre só atira em inimigo que o dono enxerga', () => {
      const tower = createBuilding({ id: 'tower', type: 'tower', owner: 'player1', position: { x: 30, z: 30 }, isComplete: true });
      const enemy = createUnit({ id: 'enemy', owner: 'player2', position: { x: 38, z: 30 } });
      const hasScout = (state: GameState) => [...state.units];
      const blindState = createState({ buildings: [tower, createBuilding({ id: 'tc-2', owner: 'player2', position: { x: 50, z: 50 } })], units: hasScout({ units: [enemy] } as GameState) });
      // A torre (visão 9) alcança 12; o inimigo a 8 de distância está visível, então leva dano.
      expect(tickGameState(blindState, withVision(blindState)).state.units[0].health).toBeLessThan(100);

      // Inimigo a 11 (dentro do alcance 12, fora da visão 9 da torre): não é alvo.
      const edge = { ...enemy, position: { x: 41, z: 30 } };
      const edgeState = createState({ buildings: blindState.buildings.map((b) => (b.id === 'tower' ? tower : b)), units: [edge] });
      expect(tickGameState(edgeState, withVision(edgeState)).state.units[0].health).toBe(100);
    });

    it('ao esgotar um recurso o coletor só passa para outro que o dono já explorou', () => {
      const worker = createUnit({ id: 'worker', position: { x: 10, z: 10 }, targetEntityId: 'a', state: 'gathering' });
      const nodes = [
        { id: 'a', type: 'stone' as const, position: { x: 10.5, z: 10 }, remaining: 0.1 },
        { id: 'b', type: 'stone' as const, position: { x: 12, z: 10 }, remaining: 50 },
      ];
      const capitals = [createBuilding({ id: 'tc-1', owner: 'player1', position: { x: 5, z: 5 } }), createBuilding({ id: 'tc-2', owner: 'player2', position: { x: 55, z: 55 } })];
      const known = createState({ units: [worker], resourceNodes: nodes, buildings: capitals });
      const next = tickGameState(known, withVision(known)).state.units[0];
      expect(next.targetEntityId).toBe('b');

      // Mesmo cenário, mas a visão do dono não cobre o recurso b: ele não é escolhido.
      const blind = { ...known };
      const vision = updateOwnerVision(undefined, { units: [{ ...worker, position: { x: 10, z: 10 } }], buildings: [], ruleSettings: undefined }, owners, 60);
      vision.player1.fill(0);
      const stopped = tickGameState(blind, context({ activeSlots: owners, vision })).state.units[0];
      expect(stopped.targetEntityId).not.toBe('b');
    });

    it('a IA só marcha contra o Centro do jogador depois de descobri-lo', () => {
      const soldiers = [1, 2, 3].map((n) => createUnit({ id: `ai-${n}`, owner: 'player2', type: 'soldier', position: { x: 30 + n, z: 30 } }));
      const humanTc = createBuilding({ id: 'tc-1', owner: 'player1', position: { x: 45, z: 30 } });
      const aiTc = createBuilding({ id: 'tc-2', owner: 'player2', position: { x: 31, z: 31 } });
      const state = createState({ units: soldiers, buildings: [humanTc, aiTc], playerResources: { player1: playerResources(), player2: playerResources() } });
      const marching = (vision: ReturnType<typeof visionFor>) =>
        tickGameState(state, context({ mode: 'single', activeSlots: owners, vision })).state.units.filter((u) => u.owner === 'player2' && u.targetPosition).length;

      const unexplored = visionFor(state);
      unexplored.player2.fill(0);
      expect(marching(unexplored)).toBe(0);
      expect(marching(visionFor(state))).toBeGreaterThan(0);
    });
  });
});

