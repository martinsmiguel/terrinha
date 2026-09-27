# How-to: lançar uma release

> Quadrante **How-to** — checklist completo de versão do Terrinha.

O projeto usa [Semantic Versioning](https://semver.org/lang/pt-BR/) e
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/). A versão é a do
`package.json`; a tag é `vX.Y.Z`.

## Checklist

### 1. Conteúdo

- [ ] Todos os cards com **Versão Alvo = X.Y.Z** estão em **Done** no
      [quadro](https://github.com/users/martinsmiguel/projects/3).
- [ ] Nenhum card em `In Progress`/`Blocked` ficou de fora por engano.

### 2. Gates (obrigatório)

```bash
npm run lint      # typecheck (tsc --noEmit)
npx vitest run    # suíte Vitest
npm run build     # build de produção (vite build)
```

- [ ] `lint` sem erros, testes verdes, `build` concluído.

### 3. CHANGELOG

- [ ] Criar a seção `## [X.Y.Z] - AAAA-MM-DD` no `CHANGELOG.md`, com as
      subsections `Added` / `Changed` / `Fixed` / `Removed` conforme o caso.
- [ ] Mover o que existia em `## [Unreleased]` para a nova seção.
- [ ] Atualizar os links do rodapé (`[X.Y.Z]: .../compare/v-ANTERIOR...vX.Y.Z`).

### 4. Versão e tag

O workflow `version-bump.yml` sobe a versão e cria a tag automaticamente em
cada push na `main` (usa os Conventional Commits desde a última tag). Para
release manual:

```bash
# confira a versão proposta
node -p "require('./package.json').version"

# bump + tag (ex.: patch)
npm version patch --no-git-tag-version
git commit -am "chore(release): vX.Y.Z"
git tag vX.Y.Z
git push && git push --tags
```

- [ ] Regra SemVer: quebra de compatibilidade = MAJOR, funcionalidade nova =
      MINOR, correção = PATCH (ver tabela em [CONTRIBUTING.md](../../CONTRIBUTING.md)).

### 5. Release no GitHub

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file CHANGELOG.md
```

Para limitar as notas a uma seção:

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes "$(awk '/^## \[X.Y.Z\]/{f=1;next} /^## \[/{f=0} f' CHANGELOG.md)"
```

- [ ] Página da release abre e mostra as notas corretas.

### 6. Pós-release

- [ ] `## [Unreleased]` no `CHANGELOG.md` volta a ficar vazio (ou recebe o que
      já estiver em andamento).
- [ ] Cards da próxima versão atualizados no quadro.

## Releases passadas

- [v0.1.0](https://github.com/martinsmiguel/terrinha/releases/tag/v0.1.0) —
  protótipo base + fundação do repositório.
