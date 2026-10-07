import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function check(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'terrinha-boundaries-'));
  try {
    for (const [name, source] of Object.entries(files)) writeFileSync(join(dir, name), source);
    return spawnSync(process.execPath, ['--experimental-vm-modules', resolve('scripts/check-boundaries.mjs'), dir, 'simulation'], { encoding: 'utf8' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
describe('fronteiras runtime das regras #51', () => {
  it('permite import de tipo gráfico e dependência local pura sem executar o código', () => {
    expect(check({ 'simulation.ts': "import type { Scene } from 'three'; import { n } from './model'; export const value = n;", 'model.ts': 'export const n = 1;' }).status).toBe(0);
  });
  it('recusa dependência gráfica transitiva com o caminho do problema', () => {
    const result = check({ 'simulation.ts': "export { n } from './model';", 'model.ts': "import * as THREE from 'three'; export const n = THREE.REVISION;" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('simulation → model.ts → three');
  });
  it.each(["import 'react';", "export * from 'three';", 'document.createElement("div");', 'new Audio();', 'import("./model");', 'require("three");'])('recusa runtime proibido: %s', (source) => {
    expect(check({ 'simulation.ts': source }).status).not.toBe(0);
  });
});
