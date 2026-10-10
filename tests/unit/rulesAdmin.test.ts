import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '../../src/game/model';
import { DeltaReceiver, DeltaSender } from '../../src/game/snapshotDelta';
import { applyRules, canEditRules, diffRules, emptyRules, exportRules, importRules, layeredRows, resetRules, setDraftValue } from '../../src/game/rulesAdmin';
import { UNIT_ATTRIBUTES, type RuleSettings } from '../../src/game/unitAttributes';

const soldier = (id: string, health: number, extra: Partial<Unit> = {}): Unit => ({
  id, type: 'soldier', owner: 'player1', position: { x: 1, z: 1 }, targetPosition: null, targetEntityId: null, health, maxHealth: 150, attackDamage: 24, state: 'idle', ...extra,
});
const world = (units: Unit[], extra: Partial<GameState> = {}): GameState => ({
  units, buildings: [{ id: 'b', type: 'barracks', owner: 'player1', position: { x: 5, z: 5 }, health: 800, maxHealth: 800, isComplete: true, trainingQueue: [{ unitType: 'soldier', progress: 40 }] }],
  resourceNodes: [], mapSize: 100, playerResources: { player1: { wood: 10, food: 20, gold: 30, stone: 0, planks: 0, pop: 2, maxPop: 9 } }, ...extra,
});
const rules = (units: RuleSettings['units']): RuleSettings => ({ version: 1, units });

describe('camadas, origem, limite e unidade', () => {
  it('padrão → local → sessão → rascunho: a camada mais forte vence e a origem é informada', () => {
    const rows = layeredRows(rules({ soldier: { attackDamage: 30 } }), rules({ soldier: { attackDamage: 35, visionRadius: 12 } }), rules({ soldier: { attackDamage: 40 } }));
    const dmg = rows.find((r) => r.unit === 'soldier' && r.stat === 'attackDamage')!;
    expect(dmg).toMatchObject({ value: 40, source: 'rascunho', base: UNIT_ATTRIBUTES.soldier.attackDamage, min: 0, max: 1000, unitLabel: 'HP por golpe' });
    expect(rows.find((r) => r.unit === 'soldier' && r.stat === 'visionRadius')).toMatchObject({ value: 12, source: 'sessão' });
    expect(layeredRows(rules({ soldier: { maxHealth: 160 } }), undefined, undefined).find((r) => r.unit === 'soldier' && r.stat === 'maxHealth')).toMatchObject({ value: 160, source: 'local' });
    expect(layeredRows(undefined, undefined, undefined).every((r) => r.source === 'padrão' && r.value === r.base)).toBe(true);
  });

  it('valor fora do limite ou igual ao padrão: recusa com mensagem ou remove o override', () => {
    expect(setDraftValue(emptyRules(), 'soldier', 'maxHealth', 0).error).toMatch(/entre 1 e 10000/);
    expect(setDraftValue(emptyRules(), 'soldier', 'movePerTick', NaN).error).toBeDefined();
    const set = setDraftValue(emptyRules(), 'soldier', 'attackDamage', 40).draft;
    expect(set.units.soldier?.attackDamage).toBe(40);
    expect(setDraftValue(set, 'soldier', 'attackDamage', UNIT_ATTRIBUTES.soldier.attackDamage).draft.units).toEqual({});
  });
});

describe('JSON e formulário no mesmo esquema; recusa atômica', () => {
  it('exporta e reimporta sem perda', () => {
    const r = rules({ soldier: { maxHealth: 200 }, villager: { visionRadius: 10 } });
    expect(importRules(exportRules(r)).rules).toEqual(r);
    expect(importRules(exportRules(undefined)).rules).toEqual(emptyRules());
  });

  it('chave desconhecida, NaN, fora do limite, versão errada e JSON quebrado recusam tudo, sem aplicar pela metade', () => {
    for (const text of [
      '{"version":1,"units":{"soldier":{"hp":10}}}', '{"version":1,"units":{"dragon":{"maxHealth":10}}}', '{"version":1,"units":{"soldier":{"maxHealth":99999}}}',
      '{"version":2,"units":{}}', '{"version":1,"units":{"soldier":{"maxHealth":"alto"}}}', 'não é json', '{"version":1,"units":{"soldier":{"attackDamage":null}}}',
    ]) {
      const result = importRules(text);
      expect(result.rules, text).toBeUndefined();
      expect(result.error, text).toBeTruthy();
    }
    // nada de eval: código vira erro de JSON, não execução
    expect(importRules('(() => ({version:1,units:{}}))()').error).toBeTruthy();
  });

  it('só o host (e o solo) edita; o convidado consulta e exporta', () => {
    expect([canEditRules('host'), canEditRules('single'), canEditRules('client')]).toEqual([true, true, false]);
  });
});

describe('prévia, aplicação e reset', () => {
  it('a prévia lista o que mudaria com impacto, e sem diferença não há mudança', () => {
    const changes = diffRules(undefined, rules({ soldier: { maxHealth: 200, movePerTick: 0.25 } }));
    expect(changes.map((c) => `${c.unit}.${c.stat}:${c.from}->${c.to}`)).toEqual(['soldier.maxHealth:150->200', 'soldier.movePerTick:0.2->0.25']);
    expect(changes[0].impact).toMatch(/mantém a fração/);
    expect(diffRules(undefined, emptyRules())).toEqual([]);
    const state = world([soldier('s', 100)]);
    expect(applyRules(state, emptyRules()).state).toBe(state);
  });

  it('vida conserva a fração sem reviver; custo/fila, porão, passageiros e posse ficam intactos', () => {
    const passenger = soldier('p', 75, { owner: 'player1' });
    const boat: Unit = { ...soldier('boat', 80), type: 'trade_boat', maxHealth: 220, passengers: [{ ...passenger }], cargo: { wood: 30, food: 0, gold: 0, stone: 0, planks: 0 } };
    const dead = soldier('dead', 0);
    const state = world([soldier('s', 75), soldier('s2', 150), dead, boat]);
    const applied = applyRules(state, rules({ soldier: { maxHealth: 300 }, trade_boat: { maxHealth: 440 } }));
    const byId = (id: string) => applied.state.units.find((u) => u.id === id)!;
    expect(byId('s')).toMatchObject({ health: 150, maxHealth: 300 }); // 50% de 300
    expect(byId('s2')).toMatchObject({ health: 300, maxHealth: 300 });
    expect(byId('dead')).toMatchObject({ health: 0 }); // não revive
    expect(byId('boat')).toMatchObject({ health: 160, maxHealth: 440, owner: 'player1' });
    expect(byId('boat').passengers![0]).toMatchObject({ id: 'p', health: 150, maxHealth: 300 }); // passageiro é soldado: também escala (50% de 300)
    expect(byId('boat').cargo).toEqual({ wood: 30, food: 0, gold: 0, stone: 0, planks: 0 });
    expect(applied.state.buildings).toBe(state.buildings); // filas e custos não são tocados
    expect(applied.state.playerResources).toBe(state.playerResources);
    expect(applied.state.units.map((u) => u.id)).toEqual(state.units.map((u) => u.id)); // IDs
  });

  it('redefinir volta ao padrão sem desfazer o que já aconteceu', () => {
    const buffed = applyRules(world([soldier('s', 150)]), rules({ soldier: { maxHealth: 300 } })).state;
    const hurt = { ...buffed, units: buffed.units.map((u) => ({ ...u, health: 30 })) }; // dano sofrido sob a regra nova
    const reset = resetRules(hurt).state;
    expect(reset.ruleSettings).toEqual(emptyRules());
    expect(reset.units[0]).toMatchObject({ maxHealth: 150, health: 15 }); // fração 10% mantida; o dano não foi desfeito
  });

  it('registra revisão e instante; a revisão nova obriga um quadro completo antes de qualquer delta', () => {
    const base = world([soldier('s', 100)], { elapsed: 42 });
    const applied = applyRules(base, rules({ soldier: { attackDamage: 30 } }));
    expect(applied.state.rulesApplied).toEqual({ revision: applied.revision, atElapsed: 42 });
    const sender = new DeltaSender('s');
    const receiver = new DeltaReceiver();
    receiver.apply(sender.next(base, 1));
    const packet = sender.next(applied.state, applied.revision);
    expect(packet.kind).toBe('full'); // a configuração precede o estado dependente
    expect(receiver.apply(packet).state?.ruleSettings).toEqual(rules({ soldier: { attackDamage: 30 } }));
  });
});
