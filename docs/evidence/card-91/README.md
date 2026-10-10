# Procedência dos cards #91 — candidato

Auditoria de 2026-10-06 em macOS/Node22.23.1. Código executado:
`384a192ff344f81a07af78d3e5621221442cb77a`, sobre contrato PR104
`d2c9ed6192558ee4b628d0ae9cd37dd680ecaf15`. Fontes documentais e snapshot
completo permanecem no Git local de docs. Não houve escrita nos corpos dos cards.

## Critério → prova e limite

1. Os 52 cards abertos (#50–101) possuem baseline, origem, módulos/limites,
   dependências/prioridade, critérios e prova exigida no bloco vigente:
   [relatório por card](provenance.json). #49 fechado não faz parte da amostra.
   A presença estrutural não comprova que a implementação atende esses textos.
2. Auditor somente leitura, hashes dos corpos e teste de imutabilidade do
   snapshot; templates pedem preservar histórico/checkboxes/intervenções.
   Nenhuma atualização em lote ou aceite foi realizado.
3. Cards distinguem candidato de integração/aceite; atividades do mapa foram
   cruzadas localmente e todos os IDs aplicáveis aparecem nos blocos vigentes.
   Matriz atividade→critérios→módulos→prova permanece local. Template exige
   explicitar a primeira fatia; implementações futuras ainda precisam preencher
   a prova observada dessa fatia, não apenas citar o planejamento.
4. Todos os cards declaram responsável/data não definidos; agente-1 rastreia
   quem está preparando este candidato, sem inventar compromisso humano.
5. Lista local reconcilia produto1.1.0, mapa, decisões, auditorias e cards.
   Não foram publicados os estudos privados, snapshot integral ou corpos manuais.
6. Oito controles Node: completude sem aceite/mutação; histórico/comentários/
   exemplos; bloco vigente; bloco malformado; entrada/SHA inválidos; ausência
   de corpos no relatório; atividade N03; CLI inválida sem expor conteúdo.
   Lint, testes do jogo e build são checks complementares. Sem alteração de
   comportamento visual/API/gameplay, screenshot não se aplica.

## Reprodução e limites

Ver [auditar procedência](../../how-to/auditar-procedencia-cards.md).
Código de saída0 = campos presentes, 1 = lacunas, 2 = inconclusivo. Não é SAST,
controle de segredos ou aprovação de produto. A consulta52 ficou abaixo do limite200;
nenhum card fora da faixa50–101 estava aberto. Snapshot pode envelhecer e deve ser
consultado novamente antes do aceite. Prova visual e LAN não foram executadas:
não há alteração de runtime nesta fatia.

PR preparada sobre outro candidato: depende da integração/aceite #62 e da
revisão independente. Não concluir #91 nem seus dependentes só com este relatório.
Após integrar #62 na main, atualizar a base/mesclar mudanças do processo #90,
revisar conflitos de templates e repetir checks/provas afetadas. Não mergear esta
branch na branch do contrato. Artefatos adicionados depois da auditoria não
alteram o script testado; identificar o SHA publicado na descrição da PR.

## Reexecução na base integrada (2026-10-10)

Depois da integração do #62 e dos processos #90 a #96 na main, a branch foi sincronizada com a
`main` e a auditoria repetida sobre as issues abertas naquele momento.

- Código executado: `scripts/planning/audit-provenance.mjs` neste branch, SHA do relatório
  `0a39dfe555e2c312a827bf0d7f92696003e81c00`; testes `node --test tests/planning/provenance.check.mjs`: 8 de 8.
- Consulta: `gh issue list --state open --limit 200` retornou 41 cards, abaixo do limite 200.
- Primeiro resultado: `findings` (código de saída 1). A única lacuna era a #115, o follow-up do #59
  criado em 2026-10-10 sem o bloco de procedência. O corpo da #115 foi completado no formato do
  template e a auditoria repetida: `structurally-complete`, código de saída 0, 41 de 41 cards.
- Limite: presença estrutural de campos não comprova correção semântica nem aceite de cada card.
  Esta rodada também não escreveu nos corpos dos outros 40 cards.
