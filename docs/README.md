# Documentação do Terrinha

Documentação organizada pelo framework [Diátaxis](https://diataxis.fr/), em quatro
quadrantes. Escolha pelo que você quer fazer:

| Quadrante | Necessidade | Onde |
| --- | --- | --- |
| **Tutorial** | "Quero aprender, passo a passo" | [`tutorials/`](tutorials/) |
| **How-to** | "Quero resolver um problema concreto" | [`how-to/`](how-to/) |
| **Referência** | "Preciso de dados técnicos exatos" | [`reference/`](reference/) |
| **Explicação** | "Quero entender o porquê e o como" | [`explanation/`](explanation/) |

Páginas mais consultadas:

- [Contrato da alpha](explanation/contrato-alpha.md) ·
  [Comandos de teclado](reference/comandos-teclado.md) ·
  [Unidades e edifícios](reference/unidades-edificios.md) ·
  [Eras e tecnologias](reference/tecnologias-eras.md)
- [Hospedar na Wi-Fi](how-to/hospedar-partida-wifi.md) ·
  [Lançar uma release](how-to/lancar-release.md) ·
  [Fluxo de desenvolvimento](how-to/fluxo-de-desenvolvimento.md) ·
  [Revisar pull requests](how-to/revisar-pull-requests.md)

Decisões arquiteturais são registradas como **ADRs** em
[`explanation/adr/`](explanation/adr/):
[0001](explanation/adr/0001-evoluir-prototipo.md) ·
[0002](explanation/adr/0002-manter-socket-io.md) ·
[0003](explanation/adr/0003-modulos-puros-testaveis.md) ·
[0004](explanation/adr/0004-nevoa-por-cliente-no-shader.md) ·
[0005](explanation/adr/0005-participantes-dinamicos-da-partida.md) ·
[0006](explanation/adr/0006-fila-unica-de-pesquisa-validada-no-host.md) ·
[0007](explanation/adr/0007-geografia-por-semente-e-exploracao-local.md) ·
[0008](explanation/adr/0008-acessibilidade-do-hud-escala-contraste-e-remapeamento.md) ·
[0009](explanation/adr/0009-visao-autoritativa-por-dono-no-host.md) ·
[0010](explanation/adr/0010-decisoes-de-escala-e-rede-do-alpha.md)

## Todas as páginas

- Tutoriais: [configurando o ambiente](tutorials/configurando-ambiente.md) · [primeira partida](tutorials/primeira-partida.md)
- How-to: [entrar em partida](how-to/entrar-em-partida.md) · [criar novo módulo](how-to/criar-novo-modulo.md) ·
  [auditar procedência dos cards](how-to/auditar-procedencia-cards.md) · [proteção da main](how-to/protecao-main.md) ·
  [executar em produção](how-to/executar-producao.md)
- Referência: [mundo e ilhas](reference/mundo-e-ilhas.md) · [economia das ilhas](reference/economia-das-ilhas.md) ·
  [atributos das unidades](reference/atributos-unidades.md) · [toolchain](reference/toolchain.md) · [análise estática](reference/analise-estatica.md)

A checagem local `npm run docs:check` verifica links, âncoras, índice de ADRs, páginas órfãs e referências a arquivos do código; falha se algo não existir.

A especificação completa do produto está em
[`explanation/especificacao-v2.html`](explanation/especificacao-v2.html) (CC BY 4.0).

## Regras

- Um documento pertence a **um** quadrante — não misture tutorial com referência.
- Tudo que muda no jogo deve virar commit (Conventional Commits) ligado a um card.
- Decisão arquitetural nova = novo ADR numerado.
