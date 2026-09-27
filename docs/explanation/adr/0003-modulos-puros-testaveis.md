# ADR-0003: Simulação em módulos puros testáveis com Vitest

## Status

Aceito — 2026-09-27 · Implementado nos cards #13, #15, #16, #18 e #19

## Contexto

O `App.tsx` concentra mais de 7 mil linhas: lobby, HUD, input, renderização e o
tick de simulação (20 Hz). Antes dos cards de simulação não havia nenhum teste
automatizado, e qualquer mudança de regra de jogo (movimento, combate, vitória)
só era validada jogando.

A [ADR-0001](0001-evoluir-prototipo.md) determina evoluir o protótipo em vez de
reescrever; a [ADR-0002](0002-manter-socket-io.md) mantém o host autoritativo.
Ambas pressupõem regras de jogo confiáveis — o que exige testes rápidos.

## Decisão

Extrair toda regra de jogo para **módulos puros** em `src/game/`, sem dependência
de DOM, Three.js, React ou Socket.io, e cobri-los com **Vitest**
(`tests/unit/*.test.ts`):

| Módulo | Regra coberta |
| --- | --- |
| `economy.ts` | custos, aquisição, reembolso, custo pela metade |
| `victory.ts` | partida, participantes, fim por destruição |
| `pathfinding.ts` / `separation.ts` | deslocamento e empilhamento de unidades |
| `visibility.ts` | grade de névoa de guerra |
| `tech.ts` | eras, tecnologias, fila e efeitos multiplicativos |
| `networkCommands.ts` | validação e autorização de comandos do cliente |

O `App.tsx` fica responsável apenas pelo **orquestramento**: rodar o tick,
aplicar efeitos colaterais (sons, notificações, áudio) e desenhar a cena.
A autorização de comandos também é pura para que a regra "o cliente só pode
mover as próprias unidades" seja testável sem rede.

## Consequências

- Pro: 113 testes rodam em milissegundos; regras de jogo mudam com segurança.
- Pro: os módulos puros podem ser reusados pelo refactor #14 (extrair simulação
  do `App.tsx`) e, no futuro, por um "Plugin Host" (ver especificação).
- Pro: `networkCommands.ts` é a única porta de entrada dos comandos — testada
  isoladamente do loop de rede.
- Contra: o `App.tsx` ainda contém o wiring (estado, efeitos, HUD) — a extração
  total é um card separado (#14).
- Contra: testes não cobrem a renderização Three.js; regressões visuais exigem
  jogar a partida.

## Alternativas descartadas

- **Testes E2E com Playwright**: dão cobertura da cena, mas são lentas e
  frágeis para um jogo; adiado.
- **Mocks pesados de React (`render` + seletores)**: testam JSX, não regras —
  custo alto, retorno baixo.
- **Sem testes até a v1**: inviável com dois agentes alterando o mesmo tick.
