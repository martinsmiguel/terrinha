// Checagem local de documentação (card #94): links relativos, índice, status dos ADRs e referências a arquivos do código.
// Sem rede: nunca consulta URL externa. Falha (exit 1) com a lista de problemas; DOCS_REPORT=<arquivo> grava o relatório.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_FILES = ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== 'evidence') walk(full, out); }
    else if (name.endsWith('.md')) out.push(full);
  }
  return out;
}

const slug = (heading) => heading.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').trim().replace(/\s+/g, '-');

export function checkDocs(root) {
  const problems = [];
  const docsDir = path.join(root, 'docs');
  const files = [...(existsSync(docsDir) ? walk(docsDir) : []), ...ROOT_FILES.map((f) => path.join(root, f)).filter(existsSync)];
  const rel = (file) => path.relative(root, file);

  for (const file of files) {
    const raw = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
    const text = raw.replace(/`[^`\n]*`/g, (span) => (/^`(?:src|tests|scripts)\//.test(span) ? span : ''));
    // 1) links relativos [texto](destino) e âncoras
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = match[1];
      if (/^(https?:|mailto:|#)/.test(target)) {
        if (target.startsWith('#')) {
          const headings = [...text.matchAll(/^#{1,6}\s+(.*)$/gm)].map((m) => slug(m[1]));
          if (!headings.includes(target.slice(1))) problems.push(`${rel(file)}: âncora inexistente ${target}`);
        }
        continue;
      }
      const [filePart, anchor] = target.split('#');
      const resolved = path.resolve(path.dirname(file), filePart);
      if (!existsSync(resolved)) { problems.push(`${rel(file)}: link para arquivo inexistente ${target}`); continue; }
      if (anchor && resolved.endsWith('.md') && statSync(resolved).isFile()) {
        const headings = [...readFileSync(resolved, 'utf8').matchAll(/^#{1,6}\s+(.*)$/gm)].map((m) => slug(m[1]));
        if (!headings.includes(anchor.normalize('NFC'))) problems.push(`${rel(file)}: âncora inexistente em ${target}`);
      }
    }
    // 2) referências a arquivos do código entre crases (src/, tests/, scripts/) devem existir
    for (const match of text.matchAll(/`((?:src|tests|scripts)\/[A-Za-z0-9_./-]+\.[a-z]+)(?::\d+)?`/g)) {
      if (!existsSync(path.join(root, match[1]))) problems.push(`${rel(file)}: referência a arquivo inexistente ${match[1]}`);
    }
  }

  // 3) todo ADR tem Status e consta no índice de docs/README.md
  const adrDir = path.join(docsDir, 'explanation', 'adr');
  const index = existsSync(path.join(docsDir, 'README.md')) ? readFileSync(path.join(docsDir, 'README.md'), 'utf8') : '';
  if (existsSync(adrDir)) {
    for (const name of readdirSync(adrDir).filter((n) => n.endsWith('.md'))) {
      const body = readFileSync(path.join(adrDir, name), 'utf8');
      if (!/^##\s+Status/m.test(body)) problems.push(`docs/explanation/adr/${name}: ADR sem seção Status`);
      if (!index.includes(name)) problems.push(`docs/README.md: ADR fora do índice ${name}`);
    }
  }
  // 4) toda página de referência/how-to/tutorial consta no índice ou é citada por outra página
  const cited = new Set();
  for (const file of files) for (const m of readFileSync(file, 'utf8').matchAll(/\]\(([^)#\s]+\.md)/g)) cited.add(path.basename(m[1]));
  for (const file of files.filter((f) => /docs\/(reference|how-to|tutorials)\//.test(f))) {
    if (!cited.has(path.basename(file))) problems.push(`${rel(file)}: página órfã (nenhuma outra página aponta para ela)`);
  }
  return { checked: files.length, problems };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = checkDocs(root);
  const lines = [`Documentos verificados: ${result.checked}`, ...(result.problems.length ? result.problems.map((p) => `- ${p}`) : ['Nenhum problema.'])];
  if (process.env.DOCS_REPORT) writeFileSync(process.env.DOCS_REPORT, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  process.exit(result.problems.length ? 1 : 0);
}
