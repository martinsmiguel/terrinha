import { describe, expect, it } from 'vitest';
import { BOT, attemptGap, planBot, type BotClock } from '../../src/game/bots';
import type { Building, GameState, Unit } from '../../src/game/model';
import { isAuthorizedPlayerCommand } from '../../src/game/networkCommands';
import { tickGameState, type SimulationContext } from '../../src/game/simulation';
import { updateOwnerVision } from '../../src/game/visionAuthority';

const unit = (id: string, owner: string, x: number, z: number, type: Unit['type'] = 'soldier', state: Unit['state'] = 'idle'): Unit => ({
  id, type, owner, position: { x, z }, targetPosition: null, targetEntityId: null, health: 150, maxHealth: 150, attackDamage: 24, state,
});
const tc = (id: string, owner: string, x: number, z: number, complete = true): Building => ({ id, type: 'town_center', owner, position: { x, z }, health: 2400, maxHealth: 2400, isComplete: complete, trainingQueue: [] });
const res = { wood: 600, food: 600, gold: 600, stone: 0, planks: 0, pop: 4, maxPop: 30 };
const OWNERS = ['player1', 'player2'];
const see = (state: Pick<GameState, 'units' | 'buildings'>) => updateOwnerVision(undefined, state as GameState, OWNERS, 200);
const army = (n = 4) => Array.from({ length: n }, (_, i) => unit(`b${i}`, 'player2', 100 + i, 100));
const base = (units: Unit[], extra: Partial<GameState> = {}): GameState => ({
  units, buildings: [tc('tcb', 'player2', 100, 102), tc('tca', 'player1', 112, 102)], resourceNodes: [], mapSize: 200,
  playerResources: { player1: res, player2: res }, ...extra,
});

describe('perfis: o que cada um faz e não faz', () => {
  it('Pacífico nunca inicia agressão, nem com inimigo perto e alvo conhecido', () => {
    const state = base([...army(), unit('foe', 'player1', 104, 102)]);
    const plan = planBot(state, 'player2', 'peaceful', { attempts: 0, capitalAt: 0 }, 9999, see(state));
    expect(plan.commands).toEqual([]);
  });

  it('Defensivo reage a inimigo visível perto da base e não parte para o ataque sem ameaça', () => {
    const calm = base(army());
    expect(planBot(calm, 'player2', 'defensive', { attempts: 0, capitalAt: 0 }, 9999, see(calm)).commands).toEqual([]);
    const threatened = base([...army(), unit('foe', 'player1', 105, 102)]);
    const plan = planBot(threatened, 'player2', 'defensive', { attempts: 0 }, 10, see(threatened));
    expect(plan.commands.length).toBe(4);
    expect(plan.commands.every((c) => c.type === 'attack' && c.targetId === 'foe')).toBe(true);
  });

  it('Defensivo encerra a perseguição ao passar da coleira e volta à base', () => {
    const far = unit('b0', 'player2', 100 + BOT.chaseLeash + 3, 102, 'soldier', 'attacking');
    const state = base([far]);
    const plan = planBot(state, 'player2', 'defensive', { attempts: 0 }, 10, see(state));
    expect(plan.commands).toEqual([{ type: 'move', unitId: 'b0', target: { x: 103, z: 105 } }]);
  });

  it('Incursões respeita a graça de 300 s depois da capital, e só então sai', () => {
    const state = base(army());
    const clock: BotClock = { attempts: 0, capitalAt: 100 };
    expect(planBot(state, 'player2', 'raids', clock, 399, see(state)).commands).toEqual([]); // dentro da graça
    const go = planBot(state, 'player2', 'raids', clock, 401, see(state));
    expect(go.commands.length).toBe(4);
    expect(go.clock.raid).toMatchObject({ startCount: 4, targetId: 'tca' });
    expect(go.notes[0]).toMatch(/incursão iniciada/);
  });

  it('só uma incursão ativa, grupo de 3 a 6 e intervalo de 180 a 300 s entre tentativas', () => {
    const state = base(army(9));
    const first = planBot(state, 'player2', 'raids', { attempts: 0, capitalAt: 0 }, 400, see(state));
    expect(first.clock.raid!.ids.length).toBe(BOT.groupMax);
    const second = planBot({ ...state, units: state.units.map((u) => (first.clock.raid!.ids.includes(u.id) ? { ...u, state: 'attacking' as const } : u)) }, 'player2', 'raids', first.clock, first.clock.nextRaidAt! + 1, see(state));
    expect(second.clock.raid).toEqual(first.clock.raid); // a ativa continua; nenhuma segunda sai
    for (let n = 1; n < 40; n += 1) expect(attemptGap('player2', n)).toBeGreaterThanOrEqual(180), expect(attemptGap('player2', n)).toBeLessThanOrEqual(300);
  });

  it('retira com 35% de perdas e encerra quando o grupo some', () => {
    const state = base(army(6));
    const started = planBot(state, 'player2', 'raids', { attempts: 0, capitalAt: 0 }, 400, see(state));
    const survivors = state.units.slice(0, 3).map((u) => ({ ...u, state: 'attacking' as const })); // 3 de 6 = 50% de perdas
    const retreat = planBot({ ...state, units: survivors }, 'player2', 'raids', started.clock, 420, see(state));
    expect(retreat.notes.join(' ')).toMatch(/retirada/);
    expect(retreat.commands.every((c) => c.type === 'move')).toBe(true);
    expect(retreat.clock.raid).toBeUndefined();
  });

  it('sem tropas, sem alvo conhecido ou fora de alcance a incursão adia e não cria nada', () => {
    const few = base(army(2));
    expect(planBot(few, 'player2', 'raids', { attempts: 0, capitalAt: 0 }, 400, see(few)).notes.join(' ')).toMatch(/adiada: sem tropas/);
    const state = base(army());
    const blind = see(state); blind.player2.fill(0);
    expect(planBot(state, 'player2', 'raids', { attempts: 0, capitalAt: 0 }, 400, blind).notes.join(' ')).toMatch(/adiada: sem alvo/);
    expect(planBot(state, 'player2', 'raids', { attempts: 0, capitalAt: 0 }, 400, see(state), () => false).notes.join(' ')).toMatch(/adiada: sem alvo/);
    const farTarget = { ...state, buildings: [tc('tcb', 'player2', 100, 102), tc('tca', 'player1', 100 + BOT.raidReach + 10, 102)] };
    expect(planBot(farTarget, 'player2', 'raids', { attempts: 0, capitalAt: 0 }, 400, see(farTarget)).notes.join(' ')).toMatch(/adiada/);
  });

  it('os comandos do bot passam pela mesma autorização do jogador: alvo oculto é recusado', () => {
    const state = base(army());
    const plan = planBot(state, 'player2', 'raids', { attempts: 0, capitalAt: 0 }, 400, see(state));
    const cmd = plan.commands[0];
    expect(isAuthorizedPlayerCommand(state, cmd, 'player2', see(state))).toBe(true);
    const blind = see(state); blind.player2.fill(0);
    expect(isAuthorizedPlayerCommand(state, cmd, 'player2', blind)).toBe(false);
  });
});

describe('o bot na simulação: mesmas regras de custo, população e fila', () => {
  const ctx = (): SimulationContext => ({
    playerSlot: 'player1', mode: 'single', activeSlots: OWNERS, gatherRadiusLimit: 14, sustainableForestryEnabled: false,
    buildingDefinitions: { barracks: { name: 'Quartel', buildTimeSeconds: 14 }, town_center: { name: 'Centro', buildTimeSeconds: 10 } },
    random: () => 0.5, createId: (() => { let n = 0; return () => `gen-${n++}`; })(),
  });

  it('o Centro só treina aldeões e o quartel nasce pago e atrasa a tropa até concluir', () => {
    const villagers = [0, 1, 2].map((i) => unit(`v${i}`, 'player2', 98 + i, 100, 'villager'));
    let state = base(villagers);
    let seenSoldierInTc = false;
    for (let i = 0; i < 400; i += 1) {
      state = tickGameState(state, ctx()).state;
      const centre = state.buildings.find((b) => b.id === 'tcb')!;
      if (centre.trainingQueue.some((item) => item.unitType !== 'villager')) seenSoldierInTc = true;
    }
    expect(seenSoldierInTc).toBe(false);
    const barracks = state.buildings.find((b) => b.owner === 'player2' && b.type === 'barracks');
    expect(barracks).toBeDefined();
    expect(state.playerResources.player2.wood).toBeLessThan(600); // quartel pago pelo mesmo custo
  });

  it('sem recurso a IA não treina nada e a população máxima limita a fila', () => {
    const poor = { ...base([unit('v0', 'player2', 98, 100, 'villager')]), playerResources: { player1: res, player2: { ...res, food: 0, wood: 0, gold: 0 } } };
    const after = tickGameState(poor, ctx()).state.buildings.find((b) => b.id === 'tcb')!;
    expect(after.trainingQueue).toHaveLength(0);
    const capped = { ...base([unit('v0', 'player2', 98, 100, 'villager')]), playerResources: { player1: res, player2: { ...res, pop: 30, maxPop: 30 } } };
    expect(tickGameState(capped, ctx()).state.buildings.find((b) => b.id === 'tcb')!.trainingQueue).toHaveLength(0);
  });

  it('a graça: o relógio do bot só nasce com a capital concluída e o timer não cria tropas', () => {
    const state = base([], { botProfile: 'raids' });
    const out = tickGameState(state, ctx()).state;
    expect(out.botClocks?.player2.capitalAt).toBeCloseTo(0.05, 5);
    expect(out.units.filter((u) => u.owner === 'player2')).toHaveLength(0); // sem recurso/força, adia sem criar tropa
  });
});
