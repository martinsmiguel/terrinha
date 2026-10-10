# Card #94 — ADRs, changelog e frescor da documentação

- **ADRs:** o ADR-0004 recebeu uma "Atualização 2026-10-10" datada (superado em parte pelo ADR-0009) sem reescrever o contexto histórico; o ADR-0009 passou de Proposto a
  "Aceito e implementado (sem validação humana)"; novo ADR-0010 com as decisões de escala, rede e estoques e o estado de cada uma (implementado, medido só em loopback, a confirmar).
- **Changelog:** a seção Unreleased foi reconstruída dos PRs mergeados depois da tag `v0.7.1` (`git log --first-parent v0.7.1..main`), com a distinção explícita entre tag Git e
  GitHub Release (não há release publicada) e o aviso de que nada foi validado por jogador.
- **Checagem local:** `npm run docs:check` (`scripts/check-docs.mjs`, também no `npm run lint`) verifica links relativos, âncoras, índice de ADRs, ADR sem Status, páginas órfãs e referências
  a arquivos do código entre crases; não usa rede; falha com exit 1. Relatório atual em `relatorio-docs.txt` (35 documentos, nenhum problema). Testes em `tests/unit/docsCheck.test.ts`
  (inclui casos que devem falhar).
- **Referências técnicas:** a tabela do mundo (`docs/reference/mundo-e-ilhas.md`) e a de unidades/edifícios/atalhos foram atualizadas junto de cada card (posto, transporte colonial, atalhos).

## Limites

- A checagem não valida os números descritos em texto contra o código (por exemplo tick, vida, dano e velocidade): ela só garante que os arquivos citados existem. A conferência de valores
  continua manual.
- O changelog foi gerado por título de PR; a classificação Added/Changed/Fixed segue o tipo do commit convencional e pode precisar de revisão editorial.
