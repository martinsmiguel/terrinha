import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function move(actual: string) {
  const dir = mkdtempSync(join(tmpdir(), 'terrinha-board-test-'));
  try {
    const fake = join(dir, 'gh');
    writeFileSync(fake, `#!/usr/bin/env node\nconst args=process.argv.slice(2).join(' ');\nif(args.includes('user(login:')) console.log('project field option');\nelse if(args.includes('repository(owner:')) console.log('item');\nelse if(args.includes('fieldValueByName')) console.log(process.env.TEST_BOARD_ACTUAL);\n`);
    chmodSync(fake, 0o755);
    return spawnSync('bash', ['scripts/board.sh', '90', 'in-review'], {
      encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TEST_BOARD_ACTUAL: actual },
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
describe('confirmação do comando manual do board #90', () => {
  it('só informa sucesso se a leitura confirmar o status escrito', () => {
    const result = move('In Review');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("movida para 'In Review'");
  });
  it('falha se a API de escrita não tiver erro mas a leitura discordar', () => {
    const result = move('Ready');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Status não confirmado');
    expect(result.stdout).not.toContain('movida');
  });
});
