# Changelog

Todas as mudanças notáveis serão documentadas aqui.

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/)
Versionamento: [Semantic Versioning 2.0.0](https://semver.org/lang/pt-BR/)

As entradas são geradas a partir dos [Conventional Commits](https://www.conventionalcommits.org/pt-br/)
referenciados nos cards do quadro de atividades do GitHub.

## [Unreleased]

### Fixed

- Cais exige **oceano navegável** na janela de posicionamento, tanto na prévia
  quanto na aplicação autorizada no host; cais em rio/lago interior é recusado
  com mensagem clara (`src/game/buildingGhost.ts`,
  `src/game/dockPlacement.ts`, 4 call-sites em `src/App.tsx`). O nascimento do
  barco passa a usar a mesma janela do cais (raio limitado), sem teleporte
  para outra ilha (`src/game/simulation.ts`). Testes com geografia real de
  costa, lago/rio interior e cardume em `tests/unit/buildingGhost.test.ts`.
  Instruções e referências públicas atualizadas. [#50]

## [0.1.0] - 2026-09-27

### Added

- Protótipo jogável importado como base do projeto: mapa procedural, recursos,
  construção, combate, treino, minimapa com névoa de guerra, IA básica e
  multiplayer local via Socket.io (host autoritativo).
- Fundação do repositório: licença MIT, documentação Diátaxis (4 quadrantes),
  ADRs, CHANGELOG, CONTRIBUTING e templates de issue.
- Versionamento Semântico (SemVer) e Conventional Commits como processo padrão.
- Quadro de atividades no GitHub Projects V2 com 6 colunas.
- Workflows do GitHub Actions: issues no quadro, sincronização com PRs,
  CI de lint/teste e bump de versão.

[Unreleased]: https://github.com/martinsmiguel/terrinha/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/martinsmiguel/terrinha/releases/tag/v0.1.0
