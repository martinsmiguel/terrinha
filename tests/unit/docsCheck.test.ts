import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDocs } from '../../scripts/check-docs.mjs';

const makeDocs = (files: Record<string, string>): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'docs-'));
  for (const [name, text] of Object.entries(files)) {
    const full = path.join(root, name);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
};

describe('checagem local de documentação', () => {
  it('a documentação do repositório passa sem problemas', () => {
    const result = checkDocs(path.resolve(__dirname, '../..'));
    expect(result.problems).toEqual([]);
    expect(result.checked).toBeGreaterThan(20);
  });

  it('falha em link para arquivo inexistente, âncora ausente, referência a código inexistente, ADR fora do índice e página órfã', () => {
    const root = makeDocs({
      'README.md': '# Projeto\n',
      'docs/README.md': '# Docs\n[ok](reference/a.md) [quebrado](reference/nada.md) [âncora](reference/a.md#nao-existe)\n',
      'docs/reference/a.md': '# A\nVeja `src/game/inexistente.ts` e `src/game/ok.ts`.\n',
      'docs/reference/orfa.md': '# Órfã\n',
      'docs/explanation/adr/0001-x.md': '# ADR\n\n## Status\n\nAceito\n',
      'docs/explanation/adr/0002-y.md': '# ADR sem status\n',
      'src/game/ok.ts': 'export {};\n',
    });
    const text = checkDocs(root).problems.join('\n');
    expect(text).toMatch(/arquivo inexistente reference\/nada\.md/);
    expect(text).toMatch(/âncora inexistente em reference\/a\.md#nao-existe/);
    expect(text).toMatch(/referência a arquivo inexistente src\/game\/inexistente\.ts/);
    expect(text).not.toMatch(/src\/game\/ok\.ts/);
    expect(text).toMatch(/ADR fora do índice 0001-x\.md/);
    expect(text).toMatch(/0002-y\.md: ADR sem seção Status/);
    expect(text).toMatch(/orfa\.md: página órfã/);
  });

  it('não consulta rede: link externo e âncora do próprio arquivo válida passam', () => {
    const root = makeDocs({ 'docs/README.md': '# Docs\n[site](https://exemplo.invalid/x) [aqui](#docs)\n' });
    expect(checkDocs(root).problems).toEqual([]);
  });
});
