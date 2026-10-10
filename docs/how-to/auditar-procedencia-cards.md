# Auditar a procedência dos cards

A auditoria é somente leitura. Snapshot e documentos de produto permanecem
locais; o relatório contém números, hashes dos corpos e campos ausentes.
Não publica os textos, altera checkboxes ou transforma presença de campos em aceite.

```sh
gh issue list --repo martinsmiguel/terrinha --state open --limit 200 --json number,title,body,labels,url > /tmp/terrinha-issues.json
git rev-parse HEAD
node scripts/planning/audit-provenance.mjs /tmp/terrinha-issues.json <SHA-completo> /tmp/terrinha-procedencia.json
node --test tests/planning/provenance.check.mjs
```

Confirmar a quantidade consultada antes de interpretar cobertura: o limite não
prova ausência de paginação. Selecionar explicitamente os cards da entrega no
snapshot quando o repositório também tiver outros trabalhos. Para esta passagem,
os 52 cards abertos são #50–101; #49 está fechado e tem registro de aceite separado.

Código de saída0 significa campos presentes; 1 identifica lacunas; 2 significa
entrada/execução inconclusiva. Histórico em details, comentários e exemplos não
preenchem lacunas do contrato vigente. Sem conexão ao GitHub, snapshot antigo não
prova o estado remoto atual. Uma decisão de aceite nunca é inferida pelo script.

Revisar semanticamente cada issue contra a matriz local de produto/execução:
requisito → atividade → critérios → módulos atuais/previstos → prova exigida.
No primeiro commit registrar a fatia realmente implementada, sem apresentar
regras futuras como código existente. Atualizações preservam texto anterior,
checkboxes e intervenções manuais; mudanças de escopo exigem decisão explícita.
Responsável humano e datas ficam não definidos até compromisso real.

Uma PR dependente pode ser preparada sobre outro candidato, mas sua dependência
continua pendente. Registrar base, ordem de integração e necessidade de repetir
checks no SHA posterior; não mergear uma PR empilhada na branch de apoio apenas
porque ela não tem proteção. A revisão independente e aceite são etapas próprias.
