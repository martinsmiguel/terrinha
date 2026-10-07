#!/usr/bin/env bash
set -euo pipefail

# Uso: ./scripts/board.sh <issue_number> <coluna>
# Move um card (issue) para a coluna do quadro de atividades via API GraphQL do GitHub.
#
# Colunas aceitas: backlog | ready | in-progress | in-review | done | blocked
# Requer: gh CLI autenticado (gh auth login)

OWNER="martinsmiguel"
REPO="terrinha"
PROJECT_NUMBER=3

ISSUE="${1:?Uso: ./scripts/board.sh <issue> <coluna>}"
COLUNA="${2:?Uso: ./scripts/board.sh <issue> <coluna>}"

# bash 3.2 (macOS) nao tem arrays associativos — usa case
case "$COLUNA" in
  backlog)     LABEL="Backlog" ;;
  ready)       LABEL="Ready" ;;
  in-progress) LABEL="In Progress" ;;
  in-review)   LABEL="In Review" ;;
  done)        LABEL="Done" ;;
  blocked)     LABEL="Blocked" ;;
  *) echo "Coluna inválida: $COLUNA"; exit 1 ;;
esac

case "$ISSUE" in
  ''|*[!0-9]*) echo "Número de issue inválido." >&2; exit 2 ;;
esac

# 1. Descobre o ID do projeto e do campo Status (com as opções)
read -r PROJECT_ID FIELD_ID OPTION_ID < <(gh api graphql -f query='
  query($login: String!, $number: Int!) {
    user(login: $login) {
      projectV2(number: $number) {
        id
        fields(first: 30) {
          nodes {
            ... on ProjectV2SingleSelectField {
              id
              name
              options { id name }
            }
          }
        }
      }
    }
  }' -F login="$OWNER" -F number="$PROJECT_NUMBER" --jq "
    .data.user.projectV2 as \$p
    | (\$p.fields.nodes[] | select(.name == \"Status\")) as \$f
    | (\$f.options[] | select(.name == \"$LABEL\")) as \$o
    | \"\(\$p.id) \(\$f.id) \(\$o.id)\"")

if [[ -z "$PROJECT_ID" || -z "$FIELD_ID" || -z "$OPTION_ID" ]]; then
  echo "Projeto, campo Status ou opção '$LABEL' não encontrados." >&2
  exit 1
fi

# 2. Descobre o ID do item (card) da issue no projeto
ITEM_ID=$(gh api graphql -f query='
  query($owner: String!, $repo: String!, $issue: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $issue) {
        projectItems(first: 10) {
          nodes { id project { id } }
        }
      }
    }
  }' -F owner="$OWNER" -F repo="$REPO" -F issue="$ISSUE" --jq \
  ".data.repository.issue.projectItems.nodes[] | select(.project.id == \"$PROJECT_ID\") | .id")

if [[ -z "$ITEM_ID" ]]; then
  echo "Issue #$ISSUE não está no quadro — adicione-a primeiro."
  exit 1
fi

# 3. Move para a coluna
gh api graphql -f query='
  mutation($project: ID!, $item: ID!, $field: ID!, $value: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $project
      itemId: $item
      fieldId: $field
      value: { singleSelectOptionId: $value }
    }) { projectV2Item { id } }
  }' -F project="$PROJECT_ID" -F item="$ITEM_ID" -F field="$FIELD_ID" -f value="$OPTION_ID" > /dev/null

# Confirma a escrita, inclusive quando a API devolve HTTP sem erro.
ACTUAL=$(gh api graphql -f query='
  query($item: ID!) {
    node(id: $item) {
      ... on ProjectV2Item {
        fieldValueByName(name: "Status") {
          ... on ProjectV2ItemFieldSingleSelectValue { name }
        }
      }
    }
  }' -F item="$ITEM_ID" --jq '.data.node.fieldValueByName.name')
if [[ "$ACTUAL" != "$LABEL" ]]; then
  echo "Status não confirmado: esperado '$LABEL', obtido '$ACTUAL'." >&2
  exit 1
fi

echo "Issue #$ISSUE movida para '$LABEL'"
