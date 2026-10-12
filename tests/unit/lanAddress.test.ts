import { describe, expect, it } from 'vitest';
import { isLoopbackHost, lanAddresses, lanShareUrl } from '../../src/game/lanAddress';

const interfaces = {
  lo0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
  en0: [{ family: 'IPv4', internal: false, address: '192.168.1.135' }, { family: 'IPv6', internal: false, address: 'fe80::1' }],
  eth0: [{ family: 4, internal: false, address: '10.0.0.7' }],
};

describe('endereço de convite na rede local (#192)', () => {
  it('reconhece endereços que só valem no próprio aparelho', () => {
    for (const host of ['localhost', '127.0.0.1', '127.0.1.1', '::1', '[::1]', '0.0.0.0', '']) expect(isLoopbackHost(host)).toBe(true);
    for (const host of ['192.168.1.135', 'meu-mac.local', '10.0.0.7']) expect(isLoopbackHost(host)).toBe(false);
  });

  it('servidor fora do Docker anuncia os IPv4 reais; dentro do Docker, só o LAN_HOST informado', () => {
    expect(lanAddresses({ inContainer: false, interfaces })).toEqual(['192.168.1.135', '10.0.0.7']);
    expect(lanAddresses({ inContainer: true, interfaces: { eth0: [{ family: 'IPv4', internal: false, address: '172.17.0.2' }] } })).toEqual([]);
    expect(lanAddresses({ inContainer: true, lanHost: ' 192.168.1.135 ', interfaces })).toEqual(['192.168.1.135']);
  });

  it('o link usa a página aberta pelo IP da rede, senão o IP anunciado pelo servidor, com a porta certa', () => {
    expect(lanShareUrl({ pageHost: '192.168.1.135', pagePort: '3000', serverIps: [] })).toBe('http://192.168.1.135:3000');
    expect(lanShareUrl({ pageHost: 'localhost', pagePort: '3000', serverIps: ['192.168.1.135'] })).toBe('http://192.168.1.135:3000');
    expect(lanShareUrl({ pageHost: '127.0.0.1', pagePort: '', serverIps: ['10.0.0.7'], serverPort: 8080 })).toBe('http://10.0.0.7:8080');
  });

  it('CONTROLE NEGATIVO: no Docker sem LAN_HOST, aberto em localhost, não há link (antes saía 172.17.0.2 ou 127.0.0.1)', () => {
    expect(lanShareUrl({ pageHost: 'localhost', pagePort: '3000', serverIps: [] })).toBeNull();
    expect(lanShareUrl({ pageHost: '127.0.0.1', pagePort: '3000', serverIps: ['127.0.0.1'] })).toBeNull();
  });
});
