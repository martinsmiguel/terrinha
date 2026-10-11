import type { Unit } from './model';

/**
 * Efeito de uma ordem de ataque sobre a unidade. Limpa o destino de marcha pendente: a simulação trata primeiro o ramo
 * "andando até `targetPosition`", então uma ordem de ataque que o preservasse deixaria a unidade caminhando para o ponto
 * antigo (e, se nunca chegasse, sem atacar). `gather`, `build_order` e `move` já limpam o que não é mais seu.
 */
export const attackOrder = (unit: Unit, targetId: string): Unit => ({ ...unit, targetEntityId: targetId, targetPosition: null, state: 'attacking' });
