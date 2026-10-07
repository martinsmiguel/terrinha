## Problema e resultado

Descreva o problema, o comportamento resultante e os limites da entrega.

## Issue e critérios

Refs: #<número>

<!-- Use Closes #N somente se o aceite completo da issue já estiver demonstrado.
Merge registra integração; Done exige confirmação do aceite no card. -->

| Critério da issue | Cenário / evidência | SHA | Resultado e limite |
| --- | --- | --- | --- |
| | | | Atendido / Não atendido / Inconclusivo |

- Branch, base e SHA candidato:
- Critérios pendentes e follow-ups:

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
- [ ] Revisão independente no SHA atual registrada; autoavaliação não conta como aprovação.

## Evidências da alteração

<!-- Preencha com resultados reais no SHA candidato. Remova itens não aplicáveis
com motivo. Anexos/artefatos devem estar acessíveis ao revisor. -->

- Interface/renderização: screenshot do resultado e antes/depois quando útil;
  cenário, resolução, seed e SHA. Anexar aqui ou incluir link acessível.
- Interação/fluxo temporal: vídeo/GIF curto com passos e resultado.
- API/rede/regras: requisição/evento/comando, resposta/erro/snapshot real,
  esperado versus obtido; casos normais, limites e rejeições pertinentes.
- Ambiente e comandos de reprodução:
- Evidências não coletadas e motivo:

## Preparação da revisão

- [ ] PR pronta para revisão, sem Draft.
- [ ] Link clicável desta PR registrado na issue, com branch, SHA e pendências.
- [ ] Provas vinculadas aos critérios e acessíveis ao revisor.
- [ ] Status do card confirmado como In Review após abrir e vincular a PR.

## Verificação manual

Descreva os passos e resultados, ou informe por que não se aplicam.

## Integração e aceite

- Dependências e ordem de integração:
- Decisões novas e documento correspondente:
- Responsável pelo aceite, evidência e pendências:
- Release: etapa explícita posterior ao aceite; este PR não altera versão automaticamente.
