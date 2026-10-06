# Referência: análise estática e fronteiras das regras

`npm run lint` executa TypeScript com `strict`, `noUnusedLocals` e
`noUnusedParameters`, seguido de `scripts/check-boundaries.mjs`. Não é ESLint
nem análise de vulnerabilidades. Os três parâmetros sem uso encontrados antes
foram prefixados com `_`; isso preserva suas assinaturas e comportamento.

O checker parte de model, simulation, navalTransport, networkCommands,
buildingCatalog, economy, tech, population, victory e visibility. Remove tipos
com a API do Node e usa o parser de módulos do V8 para obter imports/reexports
estáticos, sem executar os módulos. Percorre dependências locais transitivas,
recusando pacotes externos ou caminhos fora de src/game. React, Three e a
camada de áudio não podem ser alcançados por import runtime dessas raízes.
Imports apenas de tipos não são dependências runtime.

Também recusa import dinâmico/require e referências textuais a APIs de browser,
globalThis, eval e Function nesses módulos. Essa verificação textual é uma
política conservadora: pode rejeitar uma string com esses nomes, não faz análise
de fluxo de dados nem prova ausência de todo acesso indireto possível. Novo
módulo puro independente precisa ser incluído nas raízes; testes e outros
arquivos não alcançados não estão cobertos por esse grafo. O typecheck cobre
os arquivos incluídos pelo tsconfig.

Scripts inline de poc.html, poc-hud.html e poc-avaliacao.html têm sintaxe
verificada como script clássico ou módulo. Scripts externos e blocos JSON são
ignorados. Isso não executa a PoC nem demonstra comportamento em navegador.

Node 22 disponibiliza as APIs de remoção de tipos e módulos VM utilizadas;
o comando explicita `--experimental-vm-modules`. Avisos experimentais são
esperados. A CI existente chama npm run lint em Node 22, portanto recebe o
checker quando esta alteração for integrada. `tests/unit/boundaries.test.ts`
exercita dependência pura, import type e rejeições diretas/transitivas, com
fixtures temporárias removidas após cada execução.

Tipos e constantes vêm de model.ts; engine.ts os reexporta para compatibilidade.
O catálogo de construção vem de buildingCatalog.ts; buildingDefs.ts continua
responsável por objetos Three e reexporta o catálogo. Não há alteração de
MAP_SIZE, capacidades, custos ou regras de combate neste refactor.
