#!/usr/bin/env bash
set -euo pipefail

# Uso: ./scripts/board.sh <issue_number> <coluna>
# Move um card (issue) para a coluna do quadro de atividades via API GraphQL do GitHub.
#
# Colunas aceitas: backlog | ready | in-progress | in-review | done | blocked
# Requer: gh CLI autenticado (gh auth login)

OWNER="miguelrjmartins9"
REPO="terrinha"
PROJECT_NUMBER=1

ISSUE="${1:?Uso: ./scripts/board.sh <issue> <coluna>}"
COLUNA="${2:?Uso: ./scripts/board.sh <issue> <coluna>}"

declare -A LABEL=(
  ["backlog"]="Backlog"
  ["ready"]="Ready"
  ["in-progress"]="In Progress"
  ["in-review"]="In Review"
  ["done"]="Done"
  ["blocked"]="Blocked"
)
[[ -n "${LABEL[$COLUNA]:-}" ]] || { echo "Coluna inválida: $COLUNA"; exit 1; }

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
  }' -F login="$OWNER" -F number="$PROJECT_NUMBER" --jq '
    .data.user.projectV2 as $p
    | ($p.fields.nodes[] | select(.name == "Status")) as $f
    | ($f.options[] | select(.name == $OPT)) as $o
    | "\($p.id) \($f.id) \($o.id)"
  ' --arg OPT "${LABEL[$COLUNA]}")

# 2. Descobre o ID do item (card) da issue no projeto
ITEM_ID=$(gh api graphql -f query='
  query($owner: String!, $repo: String!, $issue: Int!, $project: ID!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $issue) {
        projectItems(first: 10) {
          nodes { id project { id } }
        }
      }
    }
  }' -F owner="$OWNER" -F repo="$REPO" -F issue="$ISSUE" -F project="$PROJECT_ID" --jq \
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
  }' -F project="$PROJECT_ID" -F item="$ITEM_ID" -F field="$FIELD_ID" -F value="$OPTION_ID" > /dev/null

echo "Issue #$ISSUE movida para '${LABEL[$COLUNA]}'"
