# How-to: seguir o fluxo de desenvolvimento (card a card)

> Quadrante **How-to** — como entregar trabalho neste repositório.

## Regra de ouro

**Cada commit é uma parte descritível de um card (issue) do quadro.**
Se não cabe em um card, o card ainda não está pronto.

## Passo a passo

```bash
# 1. Pegue um card em Ready no quadro de atividades (issue #N)

# 2. Branch
git checkout -b feat/<escopo>-#N     # ou fix/…, docs/…, test/…

# 3. Trabalhe e commite (Conventional Commits + referência ao card)
git commit -m "feat(combat): adiciona checagem de vitória [#14]"

# 4. Push e PR
git push -u origin HEAD
gh pr create --fill

# 5. CI verde → review independente no SHA atual → merge → card em Done
# 6. Release: bump SemVer + CHANGELOG (automatizado pelo workflow)
```

Na abertura do PR, mova o card para `In Review`, vincule o PR e mantenha os
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
issue que deve ser fechada quando a PR for mergeada; nesse evento, o card vai para
**Done**. Uma referência `Refs` sozinha nunca fecha a issue.

## Commits pequenos

Um card pode gerar vários commits, mas cada um deve ser uma unidade
descritível ("parte de atividade"): um fix lógico, um módulo novo, um
documento. Nada de "wip", "ajustes", "correção final".
