# Publicador de planejamento opt-in

Python3.12+ e gh autenticado; macOS/Linux (lock via flock). O padrão só lê GitHub,
imprime o plano e salva snapshots locais. Não importa/escreve ao importar o módulo.
Criação/edição exigem --apply e --limit de1 a12 escritas por lote.

## Especificação e preparação

Um arquivo JSON explícito contém repo e operations. Cada operação tem id único,
kind (issues ou milestones), number opcional para criação e fields. Exemplo:

```json
{
  "repo": "martinsmiguel/terrinha",
  "operations": [
    {
      "id": "card95",
      "kind": "issues",
      "number": 95,
      "fields": { "planning": "Anotação de planejamento aprovada para este card." }
    }
  ]
}
```

Para texto de objeto existente, usar planning: só substitui o bloco com
terrinha-planning:start/end; preserva literalmente o texto manual externo.
body/description integrais são permitidos apenas na criação, nunca para substituir
objeto existente. Outros campos permitidos: title e milestone de issue (número/null).
Não há state, labels, delete ou operação de fechar cards. Milestones aceitam title
mais planning/description, com a mesma proteção de texto.

```bash
python3 tools/planning/publish-entrega.py --spec /tmp/planejamento.json --state .planning-state/lote1
# Leia plan.json/diff antes de aplicar. Estado preparado não é reescrito silenciosamente.
python3 tools/planning/publish-entrega.py --state .planning-state/lote1 --apply --limit 5
# Repetir o último comando retoma o journal, sem repetir objetos confirmados.
```

O JSON legado entrega-arquipelago.json é histórico e recusado: reconcile para
operations com escopo atual. Nenhum default antigo é publicado automaticamente.
workspace-entrypoint.py é o encaminhamento versionado da antiga entrada do workspace;
a cópia em tools/planning no diretório pai aponta para esta implementação. Sem
spec/estado preparado, a entrada antiga também não escreve no GitHub.

## Snapshots e recuperação

plan.json guarda os objetos antes da escrita; journal.json guarda intenção antes da
API, número retornado, snapshot após leitura independente e campos pretendidos.
Plano tem hash e estado tem lock contra processos concorrentes. Campos escritos são
relidos, inclusive todos os campos de cada PATCH/POST. No-op não chama POST/PATCH.
Conflito com baseline ou intervenção manual posterior para a execução.

```bash
python3 tools/planning/publish-entrega.py --state .planning-state/lote1 --recover
# Preview dos campos a restaurar, sem escrita.
python3 tools/planning/publish-entrega.py --state .planning-state/lote1 --recover --apply --limit 5
```

Recuperação restaura somente campos alterados de objetos preexistentes e confirma
readback. Objetos criados permanecem e não são deletados/fechados. Plano recuperado
não é reaplicado: preparar outro diretório. Preservar todo o diretório de estado,
inclusive lock, snapshots e journal, fora do Git; backups permanecem responsabilidade
do operador. A recuperação não modifica labels, estado ou conversas.

Resposta perdida após criação: retomada consulta título/payload; se não puder
identificar univocamente o objeto, para sem repetir POST. Conferir o remoto e o
journal antes de decidir um novo plano; não limpar estado para tentar novamente
às cegas. PATCH/readback divergente é registrado antes de falhar; recuperação
recusa mudança humana e não tenta adivinhar um estado não observado.

Comparação antes/depois não é transação CAS no GitHub: intervenção entre GET/PATCH
é um limite da API. O lock só protege este estado local, não outros usuários.
Não executar lotes concorrentes nem automatizar confirmação de conflito. Não há
rollback global de rede ou de campos que o script não controla.

## Checks

```bash
python3 -m unittest discover -s tools/planning -p 'test_*.py' -v
```

CI executa esses testes com API simulada. O dry-run real deve usar plano revisado;
nenhuma necessidade de escrever nos cards reais para testar recuperação.
