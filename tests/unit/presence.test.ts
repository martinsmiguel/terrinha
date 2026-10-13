import { describe, expect, it } from 'vitest';
import { isPresenceList, onlineCount, presenceJoin, presenceLeave } from '../../src/game/presence';

describe('presença na sala (#211)', () => {
  it('entrar marca online; sair mantém o jogador como offline; reentrar atualiza o mesmo registro', () => {
    let list = presenceJoin([], { slot: 'player1', name: 'Ana', isHost: true }, 1);
    list = presenceJoin(list, { slot: 'player2', name: 'Beto', isHost: false }, 2);
    expect(onlineCount(list)).toBe(2);
    list = presenceLeave(list, 'player2', 3);
    expect(list.map((p) => [p.slot, p.online])).toEqual([['player1', true], ['player2', false]]);
    list = presenceJoin(list, { slot: 'player2', name: 'Beto Jr', isHost: false }, 4);
    expect(list).toHaveLength(2);
    expect(list.find((p) => p.slot === 'player2')).toMatchObject({ name: 'Beto Jr', online: true, lastSeen: 4 });
  });

  it('CONTROLE NEGATIVO: lista malformada da rede é recusada', () => {
    expect(isPresenceList([{ slot: 'player1', name: 'Ana', isHost: true, online: true, lastSeen: 1 }])).toBe(true);
    expect(isPresenceList([{ slot: 'player1', name: 7 }])).toBe(false);
    expect(isPresenceList('x')).toBe(false);
    expect(isPresenceList(Array.from({ length: 20 }, () => ({ slot: 'p', name: 'n', isHost: false, online: true, lastSeen: 0 })))).toBe(false);
  });
});
