---
name: Tarefa de Desenvolvimento
about: Template padrão para cards do quadro de atividades
labels: ['backlog']
---

## Procedência e estado

- Baseline: branch e SHA completo do código consultado; data da consulta.
- Origem: requisito, decisão ou diagnóstico autossuficiente; resumir o que será feito.
- Estado observado: planejado / candidato local / integrado / avaliado / aceito.
- Primeira fatia: ID, escopo executável e critérios que demonstra.
- Prioridade: P0–P3; complexidade não representa prazo.
- Responsável humano e data comprometida: não definidos até compromisso explícito.
- Fora do escopo:

<!-- Não publicar documentos privados. Resumir aqui os requisitos necessários;
links públicos verificáveis complementam o resumo, não substituem o escopo.
Preservar checkboxes, intervenções manuais e histórico em atualizações. -->

## História de Usuário

<!-- Como <papel>, quero <ação> para <benefício>. -->

## Critério de Aceite (verificável)

- [ ] Critério 1 (teste manual ou automatizado)
- [ ] Critério 2
- [ ] Checks obrigatórios do CI passam (`npm run lint`, `npm test`, `npm run build`)

## Evidências e acompanhamento

<!-- Ao iniciar, registre abordagem/dependências. Ao abrir PR e em cada passada, atualize checkboxes e comente SHA, evidências, decisões e bloqueios. -->
- [ ] Critérios demonstrados com evidência (comando, teste ou passos reproduzíveis)
- [ ] PR vinculado e revisão independente concluída no SHA aprovado
- [ ] Decisões, follow-ups e estado final registrados neste card

| Critério | Cenário e prova acessível | SHA / ambiente / seed | Resultado e limites |
| --- | --- | --- | --- |
| | | | Atendido / Não atendido / Inconclusivo |

<!-- Merge registra integração. Done exige aceite por critério e revisão independente. -->

## Versão Alvo (SemVer)

<!-- 0.1.0 / 0.2.0 / … — qual bump este card representa -->

## Épico

<!-- Fundação · Sistemas Centrais · Multiplayer · Polimento -->

## Módulo Afetado

<!-- ex: src/game/combat.ts, docs/, server.ts -->

## Dependências

<!-- IDs das fatias e links das issues; identificar aceite pendente e ordem de integração. Uma issue pode conter fatias diferentes. -->

## Notas Técnicas

<!-- Links para docs/explanation/, ADRs, decisões -->
