import { describe, expect, it } from 'vitest';
import { pageForUrl } from '../../serverPages';

describe('páginas de avaliação no servidor de desenvolvimento', () => {
  it('serve cada página de avaliação pela própria URL, com ou sem query', () => {
    expect(pageForUrl('/poc.html')).toBe('poc.html');
    expect(pageForUrl('/poc-hud.html')).toBe('poc-hud.html');
    expect(pageForUrl('/poc-avaliacao.html?x=1')).toBe('poc-avaliacao.html');
    expect(pageForUrl('/poc-radial.html')).toBe('poc-radial.html');
    expect(pageForUrl('/poc.html?hud-preview=1#topo')).toBe('poc.html');
  });

  it('qualquer outra rota cai no index.html, inclusive a raiz', () => {
    expect(pageForUrl('/')).toBe('index.html');
    expect(pageForUrl('/sala/abc')).toBe('index.html');
    expect(pageForUrl('/poc.html/extra')).toBe('index.html');
  });
});
