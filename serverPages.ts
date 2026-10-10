/** Páginas de avaliação do HUD servidas pelo servidor de desenvolvimento; qualquer outra rota cai no `index.html`. */
export const EVALUATION_PAGES = ['/poc.html', '/poc-hud.html', '/poc-avaliacao.html'] as const;

/** Arquivo HTML para uma URL. Dentro de `app.use('*')` o `req.path` é sempre '/', por isso a decisão usa a URL original. */
export function pageForUrl(originalUrl: string): string {
  const pathname = originalUrl.split('?')[0].split('#')[0];
  return (EVALUATION_PAGES as readonly string[]).includes(pathname) ? pathname.slice(1) : 'index.html';
}
