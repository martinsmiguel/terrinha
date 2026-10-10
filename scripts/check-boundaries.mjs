import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

// V8 lê os imports estáticos do JS sem executar código. Tipos são removidos antes.
const rulesDir = path.resolve(process.argv[2] ?? 'src/game');
const roots = process.argv[3] ? [process.argv[3]] : [
  'model', 'simulation', 'navalTransport', 'networkCommands', 'buildingCatalog',
  'economy', 'tech', 'population', 'victory', 'visibility', 'foundation', 'capitalSite', 'worldProofs', 'visionAuthority', 'islandEconomy', 'bodyModel', 'colonies', 'depots', 'colonialTransport', 'tradeRoutes', 'hudConfig', 'commandPalette', 'snapshotFilter', 'snapshotDelta', 'mastery', 'talents', 'mysticism', 'flows', 'waves', 'storms', 'bridges', 'bots',
];
const visited = new Set();
function visit(file, chain) {
  if (visited.has(file)) return;
  visited.add(file);
  const output = stripTypeScriptTypes(fs.readFileSync(file, 'utf8'));
  const module = new vm.SourceTextModule(output, { identifier: file });
  const code = output.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  if (/\b(?:window|document|navigator|Audio|AudioContext|HTMLElement|globalThis|eval|Function)\b|\b(?:import|require)\s*\(/.test(code)) {
    throw new Error(`API de browser ou carregamento dinâmico não permitido: ${chain.join(' → ')}`);
  }
  for (const spec of module.dependencySpecifiers) {
    if (!spec.startsWith('.')) throw new Error(`Dependência runtime externa: ${chain.join(' → ')} → ${spec}`);
    const next = path.resolve(path.dirname(file), spec + (path.extname(spec) ? '' : '.ts'));
    if (!next.startsWith(rulesDir + path.sep)) throw new Error(`Dependência fora das regras: ${chain.join(' → ')} → ${spec}`);
    visit(next, [...chain, path.basename(next)]);
  }
}
for (const root of roots) visit(path.resolve(rulesDir, `${root}.ts`), [root]);
console.log(`Fronteiras puras: ${visited.size} módulos verificados.`);

// Caminho customizado é usado apenas pelos testes de controles positivos/negativos.
if (!process.argv[2]) {
  for (const file of ['poc.html', 'poc-hud.html', 'poc-avaliacao.html']) {
    const html = fs.readFileSync(file, 'utf8');
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc\s*=|type\s*=\s*["']application\/json/i.test(match[1])) continue;
      if (/type\s*=\s*["']module/i.test(match[1])) new vm.SourceTextModule(match[2], { identifier: file });
      else new vm.Script(match[2], { filename: file });
    }
  }
  console.log('Sintaxe dos scripts inline verificada.');
}
