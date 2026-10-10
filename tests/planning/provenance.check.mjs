import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { auditProvenance } from '../../scripts/planning/audit-provenance.mjs';
const sha = 'a'.repeat(40);
const body = `Origem: produto1.1.0 e execução1.0.1.
Baseline: checkout abc1234.
Módulos: simulation.
Fora do escopo: HUD.
Dependências: Nenhuma.
A050 — P0
**A050 — primeira fatia**
Responsável e data comprometida: não definidos.
Código candidato local não representa integração/aceite.
- [ ] Registrar prova por critério no SHA final, ambiente/seed/limites.`;
test('contrato completo passa sem modificar o snapshot ou declarar aceite', () => {
  const input = [{ number: 50, body }], before = JSON.stringify(input);
  const result = auditProvenance(input, sha);
  assert.equal(result.decision, 'structurally-complete');
  assert.deepEqual(result.rows[0].missing, []);
  assert.equal(JSON.stringify(input), before);
  assert.match(result.limitations, /não comprova/);
});
test('histórico, comentários e exemplos não suprem contrato incompleto', () => {
  const current = body.replace('Baseline: checkout abc1234.', '');
  for (const tail of [`<details>${body}</details>`, `<!-- ${body} -->`, `\n\`\`\`\n${body}\n\`\`\``]) {
    assert.ok(auditProvenance([{ number: 50, body: current + tail }], sha).rows[0].missing.includes('baseline'));
  }
});
test('bloco vigente prevalece sobre texto histórico', () => {
  const text = `<!-- terrinha-execution-map:start -->${body.replace('Módulos: simulation.', '')}<!-- terrinha-execution-map:end -->${body}`;
  assert.ok(auditProvenance([{ number: 50, body: text }], sha).rows[0].missing.includes('modules'));
});
test('bloco malformado é achado, não relatório limpo', () => {
  const result = auditProvenance([{ number: 50, body: '<!-- terrinha-execution-map:start -->' + body }], sha);
  assert.equal(result.decision, 'findings');
  assert.ok(result.rows[0].missing.includes('managedBlock'));
});
test('snapshot e SHA inválidos são inconclusivos', () => {
  for (const input of [null, [], [{ number: 1, body }, { number: 1, body }], [{ number: 1 }]]) {
    assert.throws(() => auditProvenance(input, sha));
  }
  assert.throws(() => auditProvenance([], 'unknown'));
});
test('relatório não contém corpos nem textos manuais', () => {
  const privateText = 'INTERVENCAO-LOCAL-NAO-PUBLICAR';
  const result = auditProvenance([{ number: 50, body: body + privateText }], sha);
  assert.ok(!JSON.stringify(result).includes(privateText));
});

test('atividade N03 sem subfatia também é identificada', () => {
  assert.equal(auditProvenance([{number: 100, body: body.replaceAll('A050', 'N03')}], sha).decision, 'structurally-complete');
});

test('CLI recusa JSON inválido sem expor seu conteúdo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'terrinha-provenance-'));
  try {
    const input = join(dir, 'invalid.json');
    writeFileSync(input, 'PRIVATE-SENTINEL-invalid-json');
    const result = spawnSync(process.execPath, ['scripts/planning/audit-provenance.mjs', input, sha, join(dir, 'report.json')], {encoding: 'utf8'});
    assert.equal(result.status, 2);
    assert.ok(!result.stderr.includes('PRIVATE-SENTINEL'));
    assert.match(result.stderr, /Inconclusivo/);
  } finally { rmSync(dir, {recursive: true}); }
});
