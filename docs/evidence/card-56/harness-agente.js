// Harness do agente (card #56). Cole no console de http://localhost:3000/poc-avaliacao.html (1366x768, recém-carregada).
// Executa as tarefas pela DOM do iframe, conta passos de interação e confere o estado final.
// NÃO mede tempo nem facilidade: esses números são exclusivos da avaliação humana (ver avaliacao-humana.csv).
(async () => {
  const frame = () => document.getElementById('alvo');
  const doc = () => frame().contentDocument;
  const win = () => frame().contentWindow;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const labelOf = (e) => (e.getAttribute('aria-label') || e.title || e.textContent || e.placeholder || '').trim();
  const buttons = () => [...doc().querySelectorAll('button,[role=button],[role=option],[role=menuitem]')].filter(vis);
  const find = (re) => buttons().find((e) => re.test(labelOf(e)));
  let steps = 0;
  const click = async (re) => { const e = find(re); if (!e) return false; steps += 1; e.click(); await wait(300); return true; };
  const key = async (init) => { steps += 1; for (const type of ['keydown', 'keyup']) doc().dispatchEvent(new (win().KeyboardEvent)(type, { bubbles: true, ...init })); await wait(300); };
  const escape = () => key({ key: 'Escape', code: 'Escape' });
  const dialogs = () => [...doc().querySelectorAll('[role=dialog],[aria-label="Menu radial de comandos"]')].filter(vis);
  const typeInSearch = async (value) => { steps += 1; const input = [...doc().querySelectorAll('input')].find((e) => /^Buscar/.test(e.placeholder || '')); Object.getOwnPropertyDescriptor(win().HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new (win().Event)('input', { bubbles: true })); await wait(300); };
  const switchTo = async (name) => { document.querySelector(`[data-interface="${name}"]`).click(); await wait(10000); };
  const run = async (fn) => { steps = 0; let ok = false; let note = ''; try { [ok, note] = await fn(); } catch (error) { note = `erro do harness: ${error.message}`; } return { concluiu: ok, passos: steps, nota: note }; };
  const out = {};

  // ---- HUD atual (/poc.html) ----
  await switchTo('atual');
  out.atual = {};
  out.atual.madeira = await run(async () => {
    const ok = await click(/^Madeira/); const text = doc().body.innerText;
    return [ok && /Gestão de Madeira/.test(text), 'Menu com dados reais da partida (lenhadores, refino, silvicultura) e ações'];
  });
  await escape();
  out.atual.aldeao = await run(async () => {
    await click(/Ocioso/); return [/Aldeão Construtor[\s\S]{0,60}Idle/.test(doc().body.innerText), 'Um clique seleciona um aldeão ocioso real'];
  });
  out.atual.catalogo = await run(async () => {
    const ok = await click(/Cat[áa]logo/); const open = dialogs().length > 0; await escape();
    return [ok && open && dialogs().length === 0, 'Diálogo do catálogo abre (K) e Esc fecha'];
  });
  out.atual.mundo = await run(async () => {
    const ok = await click(/mapa-múndi/); await wait(500);
    const islands = [...doc().querySelectorAll('[role=dialog] aside button')].filter(vis).filter((e) => !/^Ir$/.test(e.innerText.trim()));
    const found = islands.length >= 2; await escape();
    return [ok && found, `Mapa abre, mas lista ${islands.length} ilha(s) descoberta(s): outra ilha só aparece depois de explorada`];
  });

  // ---- PoC (/poc-hud.html) ----
  await switchTo('poc');
  out.poc = {};
  out.poc.madeira = await run(async () => {
    const ok = await click(/^Madeira/); return [ok && /\+12\/min/.test(doc().body.innerText) && /Economia/.test(doc().body.innerText), 'Painel de Economia abre, mas com números ilustrativos e sem ações reais'];
  });
  out.poc.aldeao = await run(async () => {
    await click(/^Aldeões/); const text = doc().body.innerText;
    return [false, `Só mostra a contagem (${/6 disponíveis/.test(text) ? '6 disponíveis' : '?'}); não seleciona nenhum aldeão ocioso`];
  });
  out.poc.catalogo = await run(async () => {
    const ok = await click(/^Buscar menu/); await typeInSearch('catálogo');
    const hits = buttons().filter((e) => /cat[áa]logo/i.test(e.textContent) && !/Buscar/.test(labelOf(e))).length; await escape();
    return [ok, `Busca abre, mas o termo "catálogo" devolve ${hits} resultado(s)`];
  });
  out.poc.mundo = await run(async () => {
    const ok = await click(/^Mundo$/); const text = doc().body.innerText;
    const listed = (text.match(/Ilha \d/g) || []).length; return [ok && listed >= 2, `Lista ${listed} localidades, mas os nomes são ilustrativos ("Nomes ilustrativos")`];
  });
  out.poc.localidade = await run(async () => {
    await click(/^Mundo$/); const a = await click(/^Enseada do Norte/); const focused = /Destacando Enseada/.test(doc().body.innerText);
    const b = await click(/^Limpar foco/); const cleared = !/Destacando/.test(doc().body.innerText);
    return [a && focused && b && cleared, 'Foco marca no minimapa e "Limpar foco" remove; não restaura o foco anterior, apenas limpa; não move a câmera sozinho'];
  });
  out.poc.lote = await run(async () => {
    await click(/^Buscar menu/); await typeInSearch('!'); await click(/designar coleta/i);
    const modal = !doc().getElementById('batch-modal').hidden; doc().querySelector('[data-action="batch-confirm"]').click(); steps += 1; await wait(300);
    const applied = !doc().getElementById('batch-bar').hidden; doc().querySelector('[data-action="batch-undo"]').click(); steps += 1; await wait(300);
    return [modal && applied && doc().getElementById('batch-bar').hidden, 'Prévia dos 3 alvos, confirmação e desfazer funcionam (ilustrativo, sem ordem real)'];
  });
  out.poc.radial = await run(async () => {
    await click(/^Radial$/); const open = dialogs().length > 0;
    const cmd = [...doc().querySelectorAll('[aria-label="Menu radial de comandos"] button')].find((e) => /Alternar minimapa/.test(labelOf(e))); if (cmd) { steps += 1; cmd.click(); await wait(300); }
    await click(/^Radial$/); await escape();
    return [open && Boolean(cmd) && dialogs().length === 0, 'Radial abre, executa "Alternar minimapa" e Esc fecha'];
  });
  out.poc.minimizar = await run(async () => {
    await click(/^Radial$/); const cmd = [...doc().querySelectorAll('[aria-label="Menu radial de comandos"] button')].find((e) => /Modo minimalista/.test(labelOf(e))); if (cmd) { steps += 1; cmd.click(); await wait(400); }
    const minimized = Boolean(doc().querySelector('.hud-minimized')); await click(/Mostrar HUD/);
    return [minimized && !doc().querySelector('.hud-minimized'), 'Radial minimiza; botão "Mostrar HUD" (Alt+H) restaura'];
  });
  out.poc.historico = await run(async () => {
    // Mudança de painel: ocultar/mostrar o painel de seleção (independe do estado do minimapa).
    const shown = () => !doc().getElementById('bottom-dock').classList.contains('closed');
    const start = shown(); await click(/^Ocultar painel de seleção/); const changed = shown() !== start;
    await key({ key: 'z', code: 'KeyZ', ctrlKey: true }); const undone = shown() === start;
    await key({ key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true }); const redone = shown() !== start;
    await key({ key: 'z', code: 'KeyZ', ctrlKey: true });
    await key({ key: 'Z', code: 'KeyZ', shiftKey: true }); const shiftOnly = shown() !== start;
    return [changed && undone && redone, `Ctrl+Z desfaz e Ctrl+Shift+Z refaz; Shift+Z sozinho ${shiftOnly ? 'refaz' : 'não refaz'} (o enunciado diz "Shift+Z")`];
  });
  return out;
})();
