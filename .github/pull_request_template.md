## Issue e critérios

- Issue relacionada: #<número>
- Critérios de aceite atendidos:

## Alterações

- Problema e solução:
- Impacto em jogo, rede ou interface:
- Documentação atualizada (quadrante Diátaxis), quando aplicável:

## Quality gate

- [ ] O diff contém somente arquivos necessários para esta issue.
- [ ] Regras de domínio permanecem em módulos de jogo e podem ser testadas sem React ou Three.js.
- [ ] Comandos multiplayer validam jogador, propriedade, recursos e limites no host.
- [ ] Testes cobrem casos normais, limites e entradas inválidas relevantes.
- [ ] Alterações de interface ou multiplayer incluem passos de verificação manual quando necessário.
- [ ] `npm run lint` passou.
- [ ] `npm test` passou.
- [ ] `npm run build` passou.
- [ ] A documentação e o protocolo de rede refletem o comportamento alterado.
- [ ] Revisei o diff completo e removi mudanças acidentais ou temporárias.

## Verificação manual

Descreva os passos e resultados, ou informe por que não se aplicam.

## Procedência da fatia

- Branch/base e SHA candidato:
- Primeira fatia e critérios demonstrados:
- Estado: candidato; integração, avaliação e aceite precisam de prova própria.
- Dependências pendentes e ordem de integração:
- Critério → cenário → prova acessível → resultado/limites:
- Responsável humano e data comprometida: não definidos até compromisso.

Preservar histórico e intervenções manuais do card. Fontes privadas permanecem
locais; a descrição pública precisa explicar o escopo sem depender delas.
Resultado inconclusivo não atende ao critério; merge sozinho não fecha o card.
