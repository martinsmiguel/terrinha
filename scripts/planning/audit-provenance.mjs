import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const BEGIN = '<!-- terrinha-execution-map:start -->';
const END = '<!-- terrinha-execution-map:end -->';

export function auditProvenance(issues, sha) {
  if (!Array.isArray(issues) || issues.length === 0 || !/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error('Snapshot deve ser uma lista; SHA candidato deve ter 40 caracteres hexadecimais.');
  }
  const seen = new Set();
  const rows = issues.map(issue => {
    if (!Number.isSafeInteger(issue.number) || issue.number <= 0 || seen.has(issue.number) || typeof issue.body !== 'string') {
      throw new Error('Snapshot contém número inválido/duplicado ou corpo ausente.');
    }
    seen.add(issue.number);
    const body = issue.body;
    const start = body.indexOf(BEGIN), end = body.indexOf(END);
    const marked = start !== -1 || end !== -1;
    const validBlock = start >= 0 && end > start && body.split(BEGIN).length === 2 && body.split(END).length === 2;
    // Histórico, comentários e exemplos não preenchem lacunas do contrato vigente.
    const current = (validBlock ? body.slice(start + BEGIN.length, end) : marked ? '' : body.split(/<details\b/i)[0])
      .replace(/<!--[\s\S]*?-->/g, '').replace(/```[\s\S]*?```/g, '');
    const fields = {
      baseline: /Baseline[^\n]*[a-f0-9]{7,40}/i.test(current),
      origin: /Origem[^\n]*\S+/i.test(current),
      modules: /Módulos?[^\n]*[:][^\n]*\S+/i.test(current),
      scope: /Fora do escopo[^\n]*[:][^\n]*\S+/i.test(current),
      dependencies: /Dependências[^\n]*[:][^\n]*\S+/.test(current) || /Decisão humana em #\d+/.test(current),
      priority: /\bP[0-3]\b/.test(current) || /avaliação condicional em #\d+/.test(current),
      criteria: /^- \[[ xX]\] \S+/m.test(current),
      evidence: /prova por critério.*SHA.*limites/i.test(current),
      commitment: /Responsável e data comprometida[^\n]*não definidos/i.test(current),
      deliveryState: /Código candidato local não representa integração\/aceite/.test(current),
      slice: /\*\*(?:A\d+|N\d+(?:-\d+)?|ALPHA-|DEC-)/.test(current) || /Decisão humana em #\d+/.test(current),
    };
    const missing = Object.entries(fields).filter(([, value]) => !value).map(([key]) => key);
    if (marked && !validBlock) missing.push('managedBlock');
    return { number: issue.number, bodyHash: createHash('sha256').update(body).digest('hex'), missing };
  }).sort((a, b) => a.number - b.number);
  return { schemaVersion: 1, candidateSha: sha, scope: 'issues fornecidas no snapshot; corpos completos apenas no arquivo local',
    decision: rows.some(row => row.missing.length) ? 'findings' : 'structurally-complete',
    limitations: 'Presença de campos não comprova correção semântica, revisão, integração, avaliação humana ou aceite. Não altera issues ou board.', rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [, , input, sha, output] = process.argv;
    if (!input || !output) throw new Error('Uso: node scripts/planning/audit-provenance.mjs snapshot.json SHA report.json');
    let snapshot;
    try { snapshot = JSON.parse(readFileSync(input, 'utf8')); }
    catch { throw new Error('Snapshot ilegível ou JSON inválido; nenhum corpo foi impresso.'); }
    const report = auditProvenance(snapshot, sha);
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(`${report.rows.length} cards: ${report.decision}; relatório ${output}`);
    process.exitCode = report.decision === 'findings' ? 1 : 0;
  } catch (error) {
    console.error(`Inconclusivo: ${error.message}`);
    process.exitCode = 2;
  }
}
