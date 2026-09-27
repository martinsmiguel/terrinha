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

# 5. CI verde → review → merge → card em Done
# 6. Release: bump SemVer + CHANGELOG (automatizado pelo workflow)
```

## Mover cards na API do GitHub

```bash
./scripts/board.sh 14 in-progress   # move o card para In Progress
```

Colunas aceitas: `backlog`, `ready`, `in-progress`, `in-review`, `done`, `blocked`.

## Commits pequenos

Um card pode gerar vários commits, mas cada um deve ser uma unidade
descritível ("parte de atividade"): um fix lógico, um módulo novo, um
documento. Nada de "wip", "ajustes", "correção final".
