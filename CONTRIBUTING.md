# Contribuindo com o Terrinha

Ao participar você concorda com o nosso [Código de Conduta](CODE_OF_CONDUCT.md).

Este projeto é 100% open source (MIT) e segue três diretrizes obrigatórias:

1. **Documentação** — [Diátaxis](https://diataxis.fr/) (4 quadrantes)
2. **Versionamento** — [Semantic Versioning 2.0.0](https://semver.org/)
3. **Commits** — [Conventional Commits](https://www.conventionalcommits.org/pt-br/)

## Fluxo de trabalho (card a card)

Todo trabalho é um **card no quadro de atividades** do GitHub Projects:

```
Issue criada (card) → Ready → In Progress → In Review → Done
```

1. **Crie/pegue um card** — cada issue tem história de usuário, critério de
   aceite e versão alvo (SemVer).
2. **Trabalhe em um branch**: `git checkout -b feat/<escopo>-<issue>`
3. **Commite referenciando o card**: o corpo do commit (ou a mensagem) deve
   citar `#<número da issue>` — um commit = uma parte descritível de um card.
4. **Abra um PR** apontando para `main`, citando `#<número>` no corpo.
5. **CI deve passar** (`npm run lint`, testes).
6. **Merge** → card vai para Done → bump de versão SemVer + CHANGELOG.

### Formato dos commits

```
<tipo>(<escopo>): <descrição imperative> [#<issue>]

Tipos: feat | fix | docs | test | refactor | perf | chore | build | ci | plugin
```

Exemplos:

```
feat(combat): adiciona condição de vitória por destruição da TC [#14]
fix(pop): decrementa população ao perder unidades [#9]
docs(adr): registra decisão ADR-0002 de manter Socket.io [#5]
```

Breaking change: use `!` após o tipo ou o rodapé `BREAKING CHANGE:` (bump MAJOR).

### Versões (SemVer)

| Tipo de mudança        | Exemplo                              | Bump   |
| ---------------------- | ------------------------------------ | ------ |
| Incompatível (protocolo/remoção) | quebra API de rede       | MAJOR  |
| Funcionalidade nova    | novo plugin, nova unidade            | MINOR  |
| Correção de bug        | fix de sincronização                 | PATCH  |
| Docs/testes/refactor   | sem mudança de comportamento         | —      |

A versão é a do `package.json`. O `CHANGELOG.md` é atualizado em cada release.
O passo a passo completo (gates, CHANGELOG, tag e `gh release`) está em
[docs/how-to/lancar-release.md](docs/how-to/lancar-release.md).

## Estilo

- Não use emojis no código, nos commits nem na documentação — texto puro.
- Interface do jogo em português (pt-BR).

## Documentação (Diátaxis)

Antes de documentar qualquer coisa, escolha o quadrante certo:

| Quadrante  | Pergunta do leitor        | Pasta             |
| ---------- | -------------------------- | ----------------- |
| Tutorial   | "Quero aprender"           | `docs/tutorials/` |
| How-to     | "Quero resolver um problema" | `docs/how-to/`  |
| Referência | "Preciso de dados técnicos" | `docs/reference/` |
| Explicação | "Quero entender o porquê"  | `docs/explanation/` |

Decisões arquiteturais vão em `docs/explanation/adr/` (ADR-NNNN).

## Desenvolvimento local

```bash
npm install
npm run dev        # servidor em http://localhost:3000
npm run lint       # typecheck (tsc --noEmit)
```

Multiplayer na LAN: compartilhe `http://<ip-da-máquina>:3000` com os amigos.

## Padrões do quadro

- Colunas: Backlog · Ready · In Progress · In Review · Done · Blocked
- Campos: Épico, Versão Alvo, Critério de Aceite, Estimativa, Módulo
- `./scripts/board.sh <issue> <coluna>` move um card via API do GitHub
