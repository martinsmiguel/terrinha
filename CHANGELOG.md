# Changelog

Todas as mudanças notáveis serão documentadas aqui.

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/)
Versionamento: [Semantic Versioning 2.0.0](https://semver.org/lang/pt-BR/)

As entradas são geradas a partir dos [Conventional Commits](https://www.conventionalcommits.org/pt-br/)
referenciados nos cards do quadro de atividades do GitHub.

## [Unreleased]

> **Reconstruído em 2026-10-10 a partir dos PRs mergeados na `main` depois da tag `v0.7.1`** (`git log --first-parent v0.7.1..main`).
> A `v0.7.1` é uma **tag Git**; ainda **não há GitHub Release** publicada. Nada abaixo foi validado por jogador: o alpha `v0.8.0-alpha.1`
> só existe depois do gate do card #89. Itens com `[#N]` apontam para o card; `(#N)` é o PR.

### Added

- regras da sessão por formulário e JSON, prévia, aplicação e reset no host [#88] (#156)
- alertas por objeto, carga e rotas no minimapa [#86] (#153)
- ociosos e ordens autorizadas com alvo e efeito explícitos [#87] (#152)
- perfis de bot Pacífico, Defensivo e Incursões pelos mesmos comandos [#101] (#150)
- pontes internas com validação, deck e destruição segura [#100] (#148)
- tempestades determinísticas com aviso, dano naval e alerta conhecido [#80] (#145)
- ondas de Gerstner compartilhadas por malha e cascos, só visuais [#79] (#144)
- fluxo líquido por minuto com estoque local, trânsito e agregado [#85] (#143)
- plantas, monumentos, bênção, runa e estações [#84] (#142)
- constelação de talentos com Alt+T sem pausar a partida [#83] (#141)
- seis talentos com compra validada no host [#82] (#138)
- maestrias e XP por eventos autoritativos do host [#81] (#137)
- deltas sequenciados por destinatário com ressincronização [#76] (#136)
- snapshots filtrados por destinatário pela visão do host [#75] (#135)
- busca Ctrl+K com ações, tecnologias e localidades descobertas [#58] (#134)
- composição contextual e painéis recolhíveis [#57] (#133)
- interface de rotas, pausa e alertas de comboio [#73] (#131)
- administração de colônias, saldo aplicável e câmbio local [#69] (#130)
- rotas automáticas do mercante entre dois cais [#72] (#129)
- prévia e comandos de carga e kit do porão com UI [#71] (#128)
- transporte colonial com porão, kit e desembarque gradual [#70] (#127)
- estoques locais por ilha [#68] (#126)
- fundar posto avançado com território e cura [#67] (#125)
- superfícies, corpos e travessia [#99] (#123)

### Changed

- validação final do arquipélago e limite suportado documentado [#52] (#155)
- medir compressão e delta em quatro jogadores no relay [#53] (#154)
- gradiente compartilhado por destino para grupos [#78] (#147)
- medir A* real por escala e registrar a decisão sobre HPA* [#77] (#146)
- eliminar timeouts de testes de mundo procedural sob carga (#140)
- rodada do agente da avaliação do HUD e correção das páginas no dev server [#56] (#132)
- sede e jornada no mundo ampliado e convidado desconectado [#98] (#124)
- fixar referências da toolchain (#112)
- adicionar controles de segredos e dependências (#111)
- registrar proteção efetiva da main (#110)
- isolar regras gráficas e verificar fronteiras runtime (#103)
- reconciliar contrato público com definição oficial [#62] (#104)

### Fixed

- exigir cais na margem do oceano navegável [#50] (#107)
- publicar somente com opt-in e preservar recuperação (#108)
- separar revisão integração aceite e release (#106)
- compilar produção e servir páginas de avaliação corretamente (#105)

### Histórico anterior de [Unreleased]

### Fixed

- Cais exige contato com terra e oceano na mesma janela; recusa mar aberto e
  geografia ausente. Treino naval sem saída válida conserva a fila sem criar
  barco em terra. Aplicação de fundações no host revalida posicionamento,
  saldo e aldeões no estado vigente antes do débito atômico. [#50]

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
