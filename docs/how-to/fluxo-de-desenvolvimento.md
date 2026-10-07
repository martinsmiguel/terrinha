# How-to: seguir o fluxo de desenvolvimento (card a card)

> Quadrante **How-to** — como entregar trabalho neste repositório.

## Regra de ouro

**Cada commit é uma parte descritível de um card (issue) do quadro.**
Se não cabe em um card, o card ainda não está pronto.

## Passo a passo

```bash
# 1. Pegue um card em Ready no quadro de atividades (issue #N)

# 2. Branch
git checkout -b feat/<escopo>-N     # ou fix/…, docs/…, test/…
./scripts/board.sh N in-progress

# 3. Trabalhe e commite (Conventional Commits + referência ao card)
git commit -m "feat(combat): adiciona checagem de vitória [#14]"

# 4. Push e PR
git push -u origin HEAD
gh pr create --base main --title "<tipo>(<escopo>): <resultado>" --body-file /tmp/terrinha-pr.md
# Preencha /tmp/terrinha-pr.md a partir de .github/pull_request_template.md.
# Registre o link retornado na issue antes de mover para revisão.
./scripts/board.sh N in-review

# 5. CI verde → review independente no SHA atual → merge (integração)
# 6. Confirmar evidências por critério no card → aceite → Done
# 7. Release explícita: versão + CHANGELOG + tag + notas após aceite
```

Na abertura da PR pronta para revisão, registre seu link clicável na issue,
confirme que ele abre a PR correta e então mova o card para `In Review`. Mantenha os
critérios de aceite atualizados com evidências. A revisão registra SHA, provas,
achados e veredito conforme [Revisar pull requests](revisar-pull-requests.md).
Após correções, a nova passada confirma o SHA atualizado antes do merge.

## Mover cards na API do GitHub

```bash
./scripts/board.sh 14 in-progress   # move o card para In Progress
```

Colunas aceitas: `backlog`, `ready`, `in-progress`, `in-review`, `done`, `blocked`.

## Configurar a automação de issues

O workflow `.github/workflows/add-to-board.yml` adiciona issues novas ao projeto 3.
Para habilitar a automação, configure o segredo `ADD_TO_PROJECT_PAT` em
**Settings → Secrets and variables → Actions** no repositório. O token precisa
ter permissão de escrita no projeto pessoal. O valor do token deve ficar apenas
no segredo do GitHub, nunca em arquivos do repositório.

Ao abrir ou reabrir uma issue, o workflow adiciona o card e define **Backlog**.
No corpo da PR, liste as issues relacionadas em uma linha `Refs: #12`; a PR pronta
para revisão move esses cards para **In Review**. Use `Closes #12` apenas para a
issue cujo aceite completo já está demonstrado e que pode ser fechada no merge.
O workflow registra o SHA integrado, mas não move cards automaticamente para
**Done**. Referências em exemplos cercados por crases ou comentários HTML são
ignoradas pela automação. Uma referência `Refs` sozinha nunca fecha a issue.

Após confirmar aceite e revisão no card, use `./scripts/board.sh N done`.
O comando relê o campo Status e só informa sucesso se a mudança for confirmada.
Critério não executado permanece inconclusivo; integração parcial usa `Refs` e
mantém a issue aberta. Se a issue foi fechada sem aceite, registre a lacuna e
reabra antes de retomar o trabalho. Nenhuma dessas etapas corta uma release.

## Commits pequenos

Um card pode gerar vários commits, mas cada um deve ser uma unidade
descritível ("parte de atividade"): um fix lógico, um módulo novo, um
documento. Nada de "wip", "ajustes", "correção final".


## Estados e condições de passagem

| Estado | Condição e registro obrigatório |
| --- | --- |
| Backlog | Proposta ainda sem escopo executável. |
| Ready | Objetivo, critérios observáveis, limites e dependências definidos; pré-requisitos da fatia atendidos. |
| In Progress | Branch de desenvolvimento criada para o card; registrar branch e atualizar o quadro imediatamente. Inclui PR em Draft. |
| In Review | Implementação preparada, checks registrados, PR aberta sem Draft e link clicável da PR na issue; evidências disponíveis por critério. |
| Blocked | Impedimento explícito, próximo passo e dependência registrados. Retomar a etapa real quando resolvido. |
| Done | Revisão independente no SHA atual, integração e aceite de todos os critérios comprovados e registrados na issue. |

Se a revisão exigir nova implementação, retornar a In Progress; solicitar nova
passada com as provas do SHA atualizado. Se a PR for fechada sem merge, registrar
motivo e retornar à etapa real. Checks verdes sem PR não habilitam In Review.
Uma issue com várias fatias só termina quando todas as fatias exigidas forem aceitas.

## PR e vínculo no card

Título: `<tipo>(<escopo>): <resultado concreto>`. Corpo conforme
[template de PR](../../.github/pull_request_template.md): problema, comportamento
resultante, critérios e provas, base/SHA, checks, limites e integração. Remover
seções sem aplicação, registrando o motivo quando uma prova relevante não foi feita.
Usar `Refs: #N` no corpo. A issue deve ter o caminho inverso em uma seção
**Implementação e revisão**, com `PR: [#NUMERO](URL_REAL)`, branch, SHA candidato,
resumo das evidências e pendências. Esses valores são preenchidos com dados reais.
Para várias PRs, listar cada uma com sua fatia e estado.

Não basta citar apenas o número da PR nem contar com o vínculo automático da timeline.
Quando a automação não atualizar esse registro, o autor o faz manualmente e
confirma a leitura remota antes de anunciar a entrada em revisão.

## Evidência adequada à alteração

| Alteração | Prova a anexar ou vincular na PR |
| --- | --- |
| Interface, HUD ou renderização | Screenshot do resultado executado; antes/depois quando útil. Registrar cenário, resolução, estado, seed e SHA. |
| Interação, animação ou fluxo temporal | Vídeo curto ou GIF e passos de reprodução; prints complementam a sequência. |
| HTTP ou Socket.IO | Requisição ou evento real, resposta/ack/erro ou snapshot resultante, esperado versus obtido; incluir caso normal, limite e rejeição relevantes. |
| Regra de jogo sem interface alterada | Teste reproduzível e estado/comando/resultado reais. Screenshot pode ser não aplicável, com motivo. |
| Desempenho | Medição reproduzível com ambiente, carga, seed, baseline e resultado; imagem isolada não demonstra ganho. |

Mapear cada prova ao critério correspondente, com comando, cenário, ambiente,
SHA e limites. JSON deve estar formatado para comparação; mascarar credenciais
antes de anexar. Arquivos precisam estar acessíveis ao revisor por anexo, artefato
ou caminho versionado; caminhos locais privados sozinhos não servem para revisão
no GitHub. PoC/mock é identificado como tal. Screenshot prova aparência observada;
não substitui validação da regra, multiplayer ou avaliação humana exigida pelo card.
