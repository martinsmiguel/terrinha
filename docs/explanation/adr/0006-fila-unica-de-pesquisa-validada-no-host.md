# ADR-0006: Fila única de pesquisa (eras + tecnologias) validada no host

## Status

Aceito — 2026-09-27 · Implementado no card #18

## Contexto

Eras e tecnologias são a base da progressão de um RTS, mas o projeto não tinha
nenhuma: a colonia começava e terminava no mesmo estágio. Existiam precedentes
úteis no código: fila de treino dos edifícios (máx. 5, reembolso ao cancelar),
custo centralizado em `economy.ts` (`canAfford`/`applyCost`) e validação de
comandos no host ([#20](https://github.com/martinsmiguel/terrinha/issues/20)).

As perguntas de projeto eram: (a) o tempo de pesquisa é por aldeão, por
edifício ou global? (b) quem valida o custo? (c) como aplicar efeitos no tick
sem espalhar `if (techCompleted)` por todo o `App.tsx`?

## Decisão

- **Uma fila global por jogador** em `GameState.techs[slot]`
  (`{ era, completed[], queue[] }`), com **máximo de 3 itens simultâneos**.
- **Avanços de era entram na mesma fila** com id `era:<era>` — a era é
  "pesquisada" como qualquer tecnologia, com custo e duração próprios
  (`ERA_UPGRADES`), e libera as tecnologias da era seguinte.
- **Comando de rede `research { id }`** validado no host: existência da
  tecnologia, era alcançada, pré-requisito atendido, custo disponível
  (`canAfford`) e fila não cheia (`researchBlock` em `tech.ts`).
- **Efeitos são funções puras** — `gatherMultiplier(techs, recurso)` e
  `unitDamageMultiplier(techs, tipo/unidade)` — aplicadas no tick: a coleta
  multiplica a taxa final e o combate multiplica o dano base. Bônus do mesmo
  estatuto acumulam (Cunhagem + Cartografia = ×1,5).
- **UI**: botão "Tecnologias" na barra do HUD abre o `TechPanel` (era atual,
  avanço de era, fila com barra de progresso, cards de Economia/Militar com
  custo e motivo de bloqueio).

## Consequências

- Pro: efeitos reais e testados, sem hardcode de "se completou X, +25%" no
  componente.
- Pro: custo é debitado uma única vez, na origem (`economy.ts`), igual às
  unidades.
- Pro: fila única evita ordem ambígua entre era e tecnologias; a UI mostra o
  mesmo que o host executa.
- Contra: não há pesquisa simultânea em múltiplas filas nem por aldeão (AoE2
  usa edifícios específicos; não existe Universidade no catálogo).
- Contra: a UI ainda não cancela pesquisa com reembolso (fila de treino já
  reembolsa — candidato a card futuro).
- Contra: sem bônus por civilização/estratégia — o catálogo é único.

## Alternativas descartadas

- **Fila por edifício**: exige novos edifícios (Universidade/Serraria
  especializada) — escopo maior que o card.
- **Pesquisa instantânea com só custo**: perde a tensão de timing que define o
  gênero.
- **Validar só no cliente**: qualquer um enviaria `research` de graça — viola o
  host autoritativo da [ADR-0002](0002-manter-socket-io.md).
