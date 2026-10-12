import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Building, Unit } from '../../src/game/model';
import { bodyOf } from '../../src/game/bodyModel';
import { planGroupMove } from '../../src/game/groupMove';
import { canTarget } from '../../src/game/visionAuthority';
import { UNIT_COSTS } from '../../src/game/economy';
import { canAffordResources } from '../../src/game/networkCommands';
import { evaluateMatch } from '../../src/game/victory';
import { ScenarioHost, TICKS_PER_SECOND } from './host';
import { craftLevel } from '../../src/game/mastery';
import { isUnlocked, missingFor } from '../../src/game/unlocks';

/**
 * ROTEIRO BÁSICO DE PARTIDA, passo a passo (20 passos de simulação por segundo; "F" = frame = passo).
 *
 * Objetivo: sair da chegada, fundar a capital, montar a economia, construir quartel e cais, cruzar o mar com um transporte
 * colonial, ter posto avançado numa SEGUNDA ILHA (a do inimigo) e derrotar o inimigo até a vitória.
 *
 * Cada etapa tem um orçamento de passos (o roteiro falha se estourar) e registra em que passo começou e terminou.
 * Reproduzir e gravar o relatório:  SCENARIO_REPORT=docs/evidence/roteiro/execucao.json npx vitest run tests/scenario
 *
 * O inimigo é a IA do slot 2 só com a capital e a força inicial (sem bot ativo): o roteiro mede o jogador, não a IA.
 */

const SIZE = 280;
const SEED = 4242;

interface Etapa {
  id: string;
  fase: string;
  nome: string;
  inicio: number;
  fim: number;
  orcamento: number;
  passos: number;
  recursos: { wood: number; food: number; gold: number; stone: number; planks: number; pop: string };
}

describe('roteiro: duas ilhas e a vitória sobre o inimigo (mundo 280, semente 4242)', () => {
  it('executa as 29 etapas dentro dos orçamentos, sem comando recusado fora do esperado', () => {
    const h = new ScenarioHost({ size: SIZE, seed: SEED });
    const etapas: Etapa[] = [];
    const enemy = 'player2';

    const recursos = () => {
      const r = h.resources();
      return { wood: Math.round(r.wood), food: Math.round(r.food), gold: Math.round(r.gold), stone: Math.round(r.stone), planks: Math.round(r.planks), pop: `${r.pop}/${r.maxPop}` };
    };
    /** Roda uma etapa: executa a ação, avança até a condição valer e confere que coube no orçamento. */
    const etapa = (id: string, fase: string, nome: string, orcamento: number, acao: () => void, pronto: () => boolean, diagnostico: () => string = () => '') => {
      const inicio = h.tick;
      acao();
      const passos = h.runUntil(pronto, orcamento);
      expect(passos, `${id} "${nome}" não terminou em ${orcamento} passos (F${h.tick}). ${diagnostico()}`).not.toBeNull();
      etapas.push({ id, fase, nome, inicio, fim: h.tick, orcamento, passos: h.tick - inicio, recursos: recursos() });
    };
    const diz = (ok: boolean, o: string) => expect(ok, `${o}: ${h.rejections.at(-1)?.why ?? 'sem motivo'}`).toBe(true);

    /* ---------------- Fase 1 · Chegada e capital ---------------- */
    const wagon = h.units('player1', 'wagon')[0];
    expect(h.units('player1').map((u) => u.type).sort()).toEqual(['soldier', 'villager', 'villager', 'wagon']);
    expect(h.buildings(enemy, 'town_center')).toHaveLength(1); // a IA já fundou a capital dela

    etapa('E01', '1 Capital', 'F0: fundar a capital com a carroça no melhor sítio', 450, () => {
      const site = h.capitalSites(wagon)[0];
      expect(site, 'sítio de capital').toBeDefined();
      diz(h.send({ type: 'found_capital', wagonId: wagon.id, position: site }), 'fundar capital');
      expect(h.unit(wagon.id), 'a carroça some ao fundar').toBeUndefined();
    }, () => h.buildings('player1', 'town_center')[0]?.isComplete === true);
    expect(h.tick, 'a capital leva 20 s (400 passos) exatos').toBe(400);
    const capital = h.buildings('player1', 'town_center')[0];

    /* ---------------- Fase 2 · Economia ---------------- */
    const villagers = () => h.units('player1', 'villager');
    const gather = (unit: Unit, type: string, skip = 0) => {
      // Prefere o n-ésimo mais próximo; se ainda não explorado, o mais próximo explorado; sem nenhum (arbusto esgotado
      // e o próximo na névoa), cai na madeira: o jogador também só clica no que vê.
      const node = h.nearestNode(type, capital.position, skip) ?? h.nearestNode(type, capital.position, 0) ?? h.nearestNode('tree', capital.position, skip) ?? h.nearestNode('tree', capital.position, 0)
        ?? h.nearestNode('gold_mine', capital.position, 0); // madeira explorada esgotada: o ouro ainda está à vista
      expect(node, `recurso ${type} (ou madeira) explorado`).toBeDefined();
      return h.send({ type: 'gather', unitId: unit.id, targetId: node!.id });
    };
    const tarefas = ['tree', 'food_bush', 'tree', 'gold_mine', 'food_bush', 'gold_mine'];
    /** Aldeões parados voltam a coletar (a interface não faz isso sozinha). */
    const recolocar = () => villagers().filter((u) => u.state === 'idle').forEach((u, i) => gather(u, tarefas[(villagers().indexOf(u)) % tarefas.length], i % 2));

    etapa('E02', '2 Economia', 'F400: treinar 4 aldeões no Centro (200 comida)', 600, () => {
      for (let i = 0; i < 4; i += 1) diz(h.send({ type: 'train', buildingId: capital.id, unitType: 'villager' }), `treinar aldeão ${i + 1}`);
    }, () => villagers().length >= 6);

    const antes = { ...h.resources() };
    etapa('E03', '2 Economia', 'Aldeões coletam madeira, comida e ouro (só em recurso explorado)', 400, () => {
      villagers().forEach((v, i) => diz(gather(v, tarefas[i % tarefas.length], Math.floor(i / tarefas.length)), `coleta do aldeão ${i + 1}`));
    }, () => { const r = h.resources(); return r.wood > antes.wood + 60 && r.food > antes.food && r.gold > antes.gold; });

    const construtores = () => villagers().slice(2, 4);
    const construir = (type: string, pos: { x: number; z: number } | null, ids = construtores().map((v) => v.id)) => {
      expect(pos, `local válido e explorado para ${type}`).not.toBeNull();
      diz(h.send({ type: 'build', owner: 'player1', buildingType: type, position: pos, builderIds: ids }), `construir ${type}`);
    };
    const concluido = (type: string) => () => h.buildings('player1', type)[0]?.isComplete === true;

    etapa('E04', '2 Economia', 'Construir a casa (60 madeira, 8 s): +5 de população máxima', 500, () => construir('house', h.placementNear('house', capital.position)), concluido('house'));
    expect(h.resources().maxPop).toBe(20);
    recolocar();
    etapa('E04b', '2 Economia', 'Construir a fazenda (75 madeira, 9 s): comida passiva (+2/s), porque arbusto acaba', 500, () => construir('farm', h.placementNear('farm', capital.position)), concluido('farm'));
    recolocar();
    etapa('E05', '2 Economia', 'Construir o quartel (120 madeira + 30 ouro, 14 s)', 700, () => construir('barracks', h.placementNear('barracks', capital.position)), concluido('barracks'));
    recolocar();
    // Desbloqueio (#177): a serralheria exige Carpintaria 2. Cortar madeira dá XP; o estudo completa o que faltar.
    const carpintaria = () => craftLevel(h.state.mastery, 'player1', 'carpintaria');
    const serralheria = { kind: 'building' as const, type: 'sawmill' as const };
    if (carpintaria() < 2) expect(missingFor(h.state, 'player1', serralheria), 'serralheria ainda bloqueada').toEqual([{ kind: 'craft', craft: 'carpintaria', level: carpintaria(), required: 2 }]);
    etapa('E05b', '2 Economia', 'Desbloquear a serralheria: Carpintaria 2 (cortar madeira dá XP; um estudo de 60 madeira + 20 ouro completa)', 1500, () => {
      if (carpintaria() < 2) diz(h.send({ type: 'study_craft', craft: 'carpintaria' }), 'estudar carpintaria');
    }, () => carpintaria() >= 2, () => `carpintaria ${carpintaria()}, xp ${h.state.mastery?.player1?.xp.carpintaria ?? 0}`);
    expect(isUnlocked(h.state, 'player1', serralheria)).toBe(true);
    const tree = h.nearestNode('tree', capital.position)!;
    etapa('E06', '2 Economia', 'Construir a serralheria junto das árvores (110 madeira, 11 s): refina tábuas', 600, () => construir('sawmill', h.placementNear('sawmill', tree.position)), concluido('sawmill'));
    recolocar();

    /* ---------------- Fase 3 · Costa, cais e exército ---------------- */
    let docas: { x: number; z: number } | null = null;
    for (let r = 6; r <= 80 && !docas; r += 2) docas = h.placementNear('dock', capital.position, 'player1', r, false);
    expect(docas, 'sítio de cais na ilha natal').not.toBeNull();
    const scout = h.units('player1', 'soldier')[0];
    etapa('E07', '3 Costa e exército', 'Explorar a costa: o soldado inicial anda até o futuro cais (obra exige local explorado)', 1500, () => {
      expect(h.explored(docas!), 'a costa começa inexplorada').toBe(false);
      diz(h.send({ type: 'move', unitId: scout.id, target: docas! }), 'ordem de exploração');
    }, () => h.explored(docas!));
    etapa('E08', '3 Costa e exército', 'Construir o cais na margem do oceano navegável (140 madeira, 15 s)', 700, () => construir('dock', docas), concluido('dock'));
    recolocar();

    const quartel = h.buildings('player1', 'barracks')[0];
    const soldados = () => h.units('player1', 'soldier');
    etapa('E09', '3 Costa e exército', 'Treinar 9 soldados no quartel (80 comida + 40 ouro cada), enfileirando conforme o ouro chega: 10 com o inicial', 12000, () => undefined, () => {
      const emFila = quartel.id ? h.buildings('player1', 'barracks')[0].trainingQueue.length : 0;
      if (soldados().length + emFila < 10 && emFila < 5 && canAffordResources(h.resources(), UNIT_COSTS.soldier) && h.resources().pop + h.buildings('player1').reduce((t, b) => t + b.trainingQueue.length, 0) < h.resources().maxPop) {
        h.send({ type: 'train', buildingId: quartel.id, unitType: 'soldier' });
      }
      return soldados().length >= 10;
    });
    recolocar();
    etapa('E10', '3 Costa e exército', 'Esperar 50 tábuas refinadas pela serralheria (custo do transporte colonial)', 4000, () => undefined, () => h.resources().planks >= 50);

    /* ---------------- Fase 4 · Mar e segunda ilha ---------------- */
    const doca = h.buildings('player1', 'dock')[0];
    const transporte = () => h.units('player1', 'colonial_transport')[0];
    etapa('E11', '4 Mar e segunda ilha', 'Treinar o transporte colonial no cais (180 madeira + 40 ouro + 50 tábuas)', 6000, () => undefined, () => {
      const r = h.resources();
      if (!transporte() && h.buildings('player1', 'dock')[0].trainingQueue.length === 0 && canAffordResources(r, UNIT_COSTS.colonial_transport)) {
        h.send({ type: 'train', buildingId: doca.id, unitType: 'colonial_transport' });
      }
      return Boolean(transporte());
    });
    expect(transporte().type).toBe('colonial_transport');

    /* ---------------- Cadeia da madeira (#178): lenha, cabo, ferramenta de pedra e, no Bronze, carvão vegetal ---------------- */
    const serraria = h.buildings('player1', 'sawmill')[0];
    const item = (id: 'firewood' | 'tool_handle' | 'stone_tool' | 'charcoal') => h.resources()[id] ?? 0;
    const receita = (buildingId: string, recipeId: string) => diz(h.send({ type: 'set_recipe', buildingId, recipeId }), `receita ${recipeId}`);
    etapa('E11b', '4 Cadeia da madeira', 'Serralheria passa a rachar lenha (combustível): 12 de lenha', 600, () => receita(serraria.id, 'firewood-from-wood'), () => item('firewood') >= 12);
    etapa('E11c', '4 Cadeia da madeira', 'Serralheria entalha cabo de ferramenta (Carpintaria 2): 1 cabo', 600, () => receita(serraria.id, 'tool-handle-from-wood'), () => item('tool_handle') >= 1);
    etapa('E11d', '4 Cadeia da madeira', 'Centro da Vila monta a ferramenta de pedra (1 cabo + 5 pedra): a coleta rende +20%; a serralheria volta à lenha', 600, () => {
      receita(serraria.id, 'firewood-from-wood'); // sem cabo novo, o Centro para depois de uma ferramenta
      receita(capital.id, 'stone-tool');
      // A ferramenta gasta 5 de pedra; kit (50) e posto (50) precisam de 100: um aldeão vai à pedreira explorada.
      const pedreira = h.nearestNode('stone', capital.position);
      if (pedreira) diz(h.send({ type: 'gather', unitId: villagers()[0].id, targetId: pedreira.id }), 'coletar pedra');
    }, () => item('stone_tool') >= 0.99 && h.resources().stone >= 100, () => `pedra ${Math.round(h.resources().stone)}, pedreira ${h.nearestNode('stone', capital.position) ? 'explorada' : 'na névoa'}`);
    const mineracao = () => craftLevel(h.state.mastery, 'player1', 'mineracao');
    etapa('E11e', '4 Cadeia da madeira', 'Avançar à Era do Bronze (Mineração 2 e Carpintaria 2; 100 madeira + 50 ouro, 15 s)', 1500, () => {
      if (mineracao() < 2) diz(h.send({ type: 'study_craft', craft: 'mineracao' }), 'estudar mineração');
    }, () => {
      const tech = h.state.techs?.player1;
      if (tech && tech.era === 'pedra' && tech.queue.length === 0 && mineracao() >= 2 && canAffordResources(h.resources(), { wood: 100, gold: 50 })) {
        diz(h.send({ type: 'research', id: 'era:bronze' }), 'avançar ao Bronze');
      }
      return h.state.techs?.player1.era === 'bronze';
    }, () => `mineração ${mineracao()}, era ${h.state.techs?.player1.era}`);
    etapa('E11f', '4 Cadeia da madeira', 'Serralheria queima a lenha em carvão vegetal (Bronze): 5 de carvão', 600, () => receita(serraria.id, 'charcoal-from-firewood'), () => item('charcoal') >= 5);
    receita(serraria.id, 'planks-from-wood'); // volta às tábuas
    etapa('E12', '4 Mar e segunda ilha', 'Carregar o kit de colonização (150 madeira + 50 pedra) no porão', 60, () => diz(h.send({ type: 'load_kit', boatId: transporte().id }), 'carregar kit'), () => Boolean(transporte().kit));

    const passageiros = [...villagers().slice(2, 4), ...soldados().slice(0, 4)];
    etapa('E13', '4 Mar e segunda ilha', 'Embarcar 2 aldeões e 4 soldados (capacidade 6): primeira viagem', 2500, () => {
      diz(h.send({ type: 'embark', unitIds: passageiros.map((u) => u.id), boatId: transporte().id }), 'embarcar');
    }, () => (transporte().passengers?.length ?? 0) === 6);

    // Destino: o mar aberto mais próximo da capital inimiga. O host leva o destino ao oceano navegável.
    const inimiga = h.buildings(enemy, 'town_center')[0];
    const homeLocality = h.map.localityOf('player1', capital.position);
    etapa('E14', '4 Mar e segunda ilha', 'Navegar até a costa da ilha do inimigo', 12000, () => {
      diz(h.send({ type: 'move', unitId: transporte().id, target: inimiga.position }), 'rota do transporte');
    }, () => { const b = transporte(); return b.state === 'idle' && !b.targetPosition; });
    const costa = transporte().position;
    expect(Math.hypot(costa.x - inimiga.position.x, costa.z - inimiga.position.z), 'o transporte chegou perto da ilha inimiga').toBeLessThan(60);

    etapa('E15', '4 Mar e segunda ilha', 'Desembarcar a tropa (uma unidade a cada 0,5 s) e entregar o kit', 600, () => {
      diz(h.send({ type: 'disembark', boatId: transporte().id }), 'desembarcar');
    }, () => (transporte()?.passengers?.length ?? 1) === 0);
    for (const unit of passageiros) {
      const p = h.unit(unit.id)!.position;
      expect(h.map.canStandAt('human', p.x, p.z), `${unit.type} desembarcou em terra firme`).toBe(true);
    }

    const landed = passageiros.map((u) => h.unit(u.id)!).filter((u) => u.type === 'villager');
    const novaIlha = h.map.localityOf('player1', h.unit(landed[0].id)!.position);
    expect(novaIlha, 'a tropa pisa numa localidade diferente da metrópole').not.toBe(homeLocality);
    h.step(20); // a visão da tropa recém-desembarcada precisa chegar ao host

    etapa('E16', '4 Mar e segunda ilha', 'Fundar o posto avançado (kit) na segunda ilha: duas ilhas ocupadas', 900, () => {
      const base = h.unit(landed[0].id)!.position;
      const local = h.placementNear('outpost', base, 'player1', 14);
      expect(local, 'local válido e explorado para o posto avançado').not.toBeNull();
      diz(h.send({ type: 'build', owner: 'player1', buildingType: 'outpost', position: local, builderIds: landed.map((u) => u.id) }), 'construir posto avançado');
    }, concluido('outpost'));

    const posto = h.buildings('player1', 'outpost')[0];
    expect(h.map.localityOf('player1', posto.position)).toBe(novaIlha);
    const ilhasOcupadas = new Set([...h.buildings('player1')].filter((b) => b.isComplete).map((b: Building) => h.map.localityOf('player1', b.position)));
    expect(ilhasOcupadas.size, 'edifícios próprios concluídos em duas ilhas').toBe(2);

    /* ---------------- Fase 5 · Reforços: segunda viagem do transporte ---------------- */
    // O inimigo tem 1 soldado e vários aldeões que também lutam: 4 soldados não bastam. O transporte volta e traz os outros 6.
    const doca2 = h.buildings('player1', 'dock')[0];
    etapa('E17', '5 Reforços', 'Voltar ao cais: o transporte navega de volta à ilha natal', 12000, () => {
      diz(h.send({ type: 'move', unitId: transporte().id, target: doca2.position }), 'rota de volta');
    }, () => { const b = transporte(); return b.state === 'idle' && !b.targetPosition && Math.hypot(b.position.x - doca2.position.x, b.position.z - doca2.position.z) < 15; });

    const reforcos = () => soldados().filter((u) => !passageiros.some((p) => p.id === u.id));
    etapa('E18', '5 Reforços', 'Embarcar os 6 soldados que ficaram na ilha natal', 2500, () => {
      expect(reforcos(), 'seis soldados esperam no cais').toHaveLength(6);
      diz(h.send({ type: 'embark', unitIds: reforcos().map((u) => u.id), boatId: transporte().id }), 'embarcar reforços');
    }, () => {
      // Quem empacar atrás do cais (o alvo do embarque é o barco, na água): o barco encosta perto deles e a ordem se repete,
      // como faria o jogador.
      const fora = reforcos().filter((u) => !transporte().passengers?.some((p) => p.id === u.id));
      if (fora.length > 0 && h.tick % 400 === 0) diz(h.send({ type: 'move', unitId: transporte().id, target: fora[0].position }), 'aproximar o barco');
      if (fora.length > 0 && h.tick % 400 === 200) diz(h.send({ type: 'embark', unitIds: fora.map((u) => u.id), boatId: transporte().id }), 'reembarcar reforços');
      return (transporte().passengers?.length ?? 0) === 6;
    });
    const idsReforcos = reforcos().map((u) => u.id);

    etapa('E19', '5 Reforços', 'Navegar de novo até a costa da segunda ilha', 12000, () => {
      diz(h.send({ type: 'move', unitId: transporte().id, target: costa }), 'rota de ida');
    }, () => { const b = transporte(); return b.state === 'idle' && !b.targetPosition && Math.hypot(b.position.x - costa.x, b.position.z - costa.z) < 6; });
    etapa('E20', '5 Reforços', 'Desembarcar os reforços junto do posto avançado', 600, () => {
      diz(h.send({ type: 'disembark', boatId: transporte().id }), 'desembarcar reforços');
    }, () => (transporte()?.passengers?.length ?? 1) === 0);
    for (const id of idsReforcos) expect(h.unit(id), 'reforço desembarcado vivo').toBeDefined();

    /* ---------------- Fase 6 · Combate e vitória ---------------- */
    const tropa = () => soldados();
    const inimigosVivos = () => h.units(enemy).filter((u) => u.health > 0 && u.type !== 'wagon');
    expect(tropa(), 'os 10 soldados estão na segunda ilha').toHaveLength(10);

    // Marcha em formação rumo à capital inimiga, pelo lado do desembarque (o jogador clica no chão do mapa).
    const centro = tropa().reduce((p, u) => ({ x: p.x + u.position.x / tropa().length, z: p.z + u.position.z / tropa().length }), { x: 0, z: 0 });
    const dist = Math.hypot(centro.x - inimiga.position.x, centro.z - inimiga.position.z);
    const ponto = { x: inimiga.position.x + ((centro.x - inimiga.position.x) / dist) * 14, z: inimiga.position.z + ((centro.z - inimiga.position.z) / dist) * 14 };
    const algumVisivel = () => inimigosVivos().some((u) => canTarget(h.vision, 'player1', u, 'visible'));
    etapa('E21', '6 Combate', 'Marchar em formação até avistar o inimigo (o host só deixa atacar o que se vê)', 1500, () => {
      expect(algumVisivel(), 'o inimigo começa na névoa').toBe(false);
      const plano = planGroupMove(tropa().map((u) => ({ id: u.id, position: u.position, body: bodyOf(u.type) })), ponto, 'box', SIZE, h.map.canStandAt);
      expect(plano.unplaced, 'toda unidade recebe um destino válido').toEqual([]);
      for (const ordem of plano.orders) diz(h.send({ type: 'move', unitId: ordem.unitId, target: ordem.target }), 'marchar');
    }, algumVisivel);

    /** Alvo que o host aceitaria: o soldado inimigo visível primeiro (a maior ameaça), depois o mais próximo; sem unidade, a capital. */
    const alvo = (de: Unit): { id: string } | null => {
      const visiveis = inimigosVivos().filter((u) => canTarget(h.vision, 'player1', u, 'visible'));
      const rank = (u: Unit) => (u.type === 'soldier' ? 0 : 1) * 1000 + Math.hypot(u.position.x - de.position.x, u.position.z - de.position.z);
      const proximo = [...visiveis].sort((a, b) => rank(a) - rank(b))[0];
      if (proximo) return proximo;
      return h.buildings(enemy).find((b) => b.health > 0 && canTarget(h.vision, 'player1', b, 'explored')) ?? null;
    };
    etapa('E22', '6 Combate', 'Atacar: o soldado inimigo primeiro, depois as demais unidades visíveis e a capital, até a vitória', 14000, () => undefined, () => {
      if (h.tick % 10 === 0) {
        for (const soldado of tropa().filter((u) => u.state !== 'attacking' || !u.targetEntityId)) {
          const t = alvo(soldado);
          if (t) h.send({ type: 'attack', unitId: soldado.id, targetId: t.id });
        }
      }
      return evaluateMatch(h.state.buildings, ['player1', enemy], h.state.units).status === 'finished';
    }, () => `inimigo: capital ${h.buildings(enemy, 'town_center').map((b) => Math.round(b.health)).join(',')} HP, unidades ${inimigosVivos().map((u) => `${u.type}:${Math.round(u.health)}`).join(' ')}; tropa: ${tropa().map((u) => `${u.state}:${Math.round(u.health)}`).join(' ') || 'toda morta'}; rejeições ${h.rejections.length}`);
    const resultado = evaluateMatch(h.state.buildings, ['player1', enemy], h.state.units);
    expect(resultado).toMatchObject({ status: 'finished', winner: 'player1' });
    expect(h.buildings(enemy, 'town_center').every((b) => b.health <= 0) || h.buildings(enemy, 'town_center').length === 0).toBe(true);

    etapas.push({ id: 'E23', fase: '6 Combate', nome: 'Vitória registrada (evaluateMatch: único sobrevivente é o jogador 1)', inicio: h.tick, fim: h.tick, orcamento: 0, passos: 0, recursos: recursos() });

    expect(h.rejections, `comandos recusados (${h.rejections.length}), os 5 primeiros: ${JSON.stringify(h.rejections.slice(0, 5).map((r) => [r.tick, r.command.type, r.why]))}`).toEqual([]);

    const destino = process.env.SCENARIO_REPORT;
    if (destino) {
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, `${JSON.stringify({
        mundo: SIZE, semente: SEED, passosPorSegundo: TICKS_PER_SECOND, passosTotais: h.tick, duracaoSimulada: `${(h.tick / TICKS_PER_SECOND / 60).toFixed(1)} min`,
        ilhas: [...ilhasOcupadas], vitoria: resultado, etapas,
      }, null, 2)}\n`);
    }
  }, 600000);
});
