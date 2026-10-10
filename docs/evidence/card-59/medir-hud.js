// Medição do HUD no navegador (card #59). Cole no console de http://localhost:3000/poc.html
// depois de `npm run dev`, no viewport desejado, com a página recarregada nesse tamanho
// (o minimapa só decide se começa recolhido ao carregar).
// Mede: encaixe do header, menus suspensos, alvos de toque e contraste renderizado (WCAG 2.x)
// no HUD, no catálogo (K) e nas zonas de trabalho (Z). Retorna um objeto JSON.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fire = (key) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  while (document.querySelector('[role=dialog]')) { fire('Escape'); await wait(250); }
  await wait(300);

  const W = innerWidth;
  const H = innerHeight;
  const out = { size: `${W}x${H}` };

  const header = document.querySelector('header');
  out.header = { cabe: header.scrollWidth <= header.clientWidth, alturaPct: Math.round(header.getBoundingClientRect().height / H * 100) };
  out.hScrollPagina = document.documentElement.scrollWidth > W;

  const botoes = [...document.querySelectorAll('header button, header [role=button]')].filter((b) => b.getBoundingClientRect().width > 0);
  const lado = (b) => { const r = b.getBoundingClientRect(); return [r.width, r.height]; };
  out.alvos = {
    total: botoes.length,
    foraDaTela: botoes.filter((b) => { const r = b.getBoundingClientRect(); return r.right > W + 1 || r.left < -1; }).length,
    menorQue24: botoes.filter((b) => lado(b).some((v) => v < 24)).length,
    menorQue44: botoes.filter((b) => lado(b).some((v) => v < 44)).length,
  };

  out.menus = {};
  for (const nome of ['Madeira', 'Alimento', 'Ouro e minério', 'Rio e pesca']) {
    const botao = header.querySelector(`button[aria-label="${nome}"]`);
    if (!botao) { out.menus[nome] = 'sem botão'; continue; }
    botao.click(); await wait(200);
    const menu = botao.parentElement.querySelector('[class*="backdrop-blur-xl"]');
    const r = menu?.getBoundingClientRect();
    out.menus[nome] = r ? (r.left >= 0 && r.right <= W && r.bottom <= H ? 'cabe' : 'NAO CABE') : 'nao abriu';
    botao.click(); await wait(120);
  }

  // Contraste: cor do texto composta sobre a cadeia de fundos dos ancestrais (canvas escuro como base).
  const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  const rgba = (css) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const sobre = (f, b) => [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3])).concat(1);
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const razao = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const fundo = (el) => {
    const cadeia = [];
    for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0) cadeia.push(c); if (c[3] >= 1) break; }
    let base = cadeia.length && cadeia[cadeia.length - 1][3] >= 1 ? cadeia.pop() : [2, 6, 23, 1];
    while (cadeia.length) base = sobre(cadeia.pop(), base);
    return base;
  };
  const medir = () => {
    const falhas = []; let textos = 0; const vistos = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const no = walker.currentNode; const el = no.parentElement;
      if (!no.textContent.trim() || !el || vistos.has(el)) continue;
      vistos.add(el);
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[aria-hidden=true],.sr-only')) continue;
      const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
      let opacidade = 1; for (let e = el; e; e = e.parentElement) opacidade *= parseFloat(getComputedStyle(e).opacity);
      const bg = fundo(el); const fg = rgba(cs.color); fg[3] *= opacidade;
      const px = parseFloat(cs.fontSize); const grande = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
      const rt = +razao(sobre(fg, bg), bg).toFixed(2);
      textos += 1;
      if (rt < (grande ? 3 : 4.5)) falhas.push(`${rt} ${px}px ${no.textContent.trim().slice(0, 24)}`);
    }
    return { textos, falhas };
  };
  out.contraste = { hud: medir() };
  fire('k'); await wait(450); out.contraste.catalogo = medir(); fire('Escape'); await wait(250);
  fire('z'); await wait(450); out.contraste.zonas = medir();
  const dialogo = document.querySelector('[role=dialog]');
  if (dialogo) out.modalZonasCabe = dialogo.getBoundingClientRect().bottom <= H + 1 && getComputedStyle(dialogo).overflowY === 'auto';
  fire('Escape');
  return out;
})();
