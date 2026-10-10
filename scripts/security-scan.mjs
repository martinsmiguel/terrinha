#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] || process.cwd();
const ignored = new Set(['.git', 'node_modules', 'dist', 'dist-server', 'coverage']);
const secret = /(github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY-----)/;
const findings = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (ignored.has(name)) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (stat.size < 2_000_000) {
      const text = readFileSync(path, 'utf8');
      if (secret.test(text)) findings.push(relative(root, path));
    }
  }
}

walk(root);
if (findings.length) {
  console.error(`secret-scan: ${findings.length} file(s) contain a credential-like pattern`);
  for (const file of findings) console.error(`- ${file}`);
  process.exit(1);
}
console.log('secret-scan: clean');
