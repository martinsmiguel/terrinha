import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = mkdtempSync(join(tmpdir(), 'terrinha-secret-scan-'));
try {
  writeFileSync(join(dir, 'clean.txt'), 'ordinary documentation\n');
  let result = spawnSync(process.execPath, ['scripts/security-scan.mjs', dir], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);

  const synthetic = ['ghp_', 'abcdefghijklmnopqrstuvwxyz123456'].join('');
  writeFileSync(join(dir, 'synthetic.txt'), `token=${synthetic}\n`);
  result = spawnSync(process.execPath, ['scripts/security-scan.mjs', dir], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, new RegExp(synthetic));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log('security-scan control-negative: passed');
