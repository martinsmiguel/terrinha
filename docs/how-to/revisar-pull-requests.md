# Revisar pull requests

> Quadrante **How-to** — como revisar uma mudança, registrar evidências e decidir se ela está pronta para integração.

## Objetivo e princípios

A revisão independente verifica se a mudança atende ao card, preserva o comportamento existente e pode ser integrada com segurança. CI e revisão humana são gates complementares: CI executa verificações repetíveis; a pessoa revisora avalia intenção, contratos, impacto e evidências. Ferramentas automatizadas podem ajudar, mas não aprovam nem substituem a revisão humana.

- Revisar o estado exato do PR, identificado por SHA; uma aprovação anterior não cobre commits novos.
- Relacionar cada achado a um arquivo/linha, comportamento e consequência reproduzível.
- Separar bloqueios de sugestões. Não exigir perfeição nem bloquear por preferência de estilo sem efeito concreto.
- Registrar no PR o que foi verificado e no issue as decisões, mudanças de escopo, bloqueios e estado do card.
- Se uma verificação planejada não puder ser executada, registrar **inconclusivo**; ausência de evidência não é resultado aprovado.
- Decisões arquiteturais duradouras vão para um ADR; o issue mantém o contexto e aponta para o ADR.

## Papéis

1. **Responsável pela mudança** prepara o PR, demonstra os critérios de aceite, atualiza o issue e responde aos achados com o SHA que os resolve.
2. **Revisor independente** não aprova a própria mudança; verifica o diff e publica achados e veredito. Para trabalho em dupla, o mantenedor pode assumir esse papel.
3. **Mantenedor** confirma os gates obrigatórios e a ordem de integração, resolve dúvidas de escopo e faz o merge segundo as regras do repositório.

Uma pessoa pode acumular responsabilidade e manutenção em mudanças pequenas, mas a revisão independente continua necessária antes do merge. Se não houver outra pessoa disponível, o PR fica em `In Review` e aguarda; uma autoaprovação não conta como revisão.

## Antes de abrir ou revisar

O card deve permitir que alguém sem o contexto da conversa implemente e verifique a mudança. Confirme:

- problema e comportamento esperado estão descritos;
- critérios de aceite são observáveis e incluem como obter evidência;
- dependências, bloqueios e itens fora de escopo estão explícitos;
- não há caminhos locais, segredos ou instruções dependentes da máquina de quem escreveu;
- o PR aponta para o issue, resume o comportamento e lista verificações executadas e não executadas.

Se faltar informação essencial, registre a pergunta no issue e mova o card para `Blocked` até a resposta. Não invente critérios durante a revisão.

## Roteiro de revisão

1. **Fixe a procedência.** Anote PR, issue, branch, base, SHA revisado e data. Confira novamente o SHA antes do veredito. Use o diff contra a base do PR, não a comparação com a árvore local sem confirmação.
2. **Leia o contrato.** Compare descrição do PR, issue, critérios de aceite, documentação relevante e comportamento prometido.
3. **Avalie o alcance.** Observe arquivos tocados, superfície pública, rede, persistência, configuração e consumidores. Confira dependências entre PRs e mudanças paralelas antes de indicar ordem de merge.
4. **Siga dados e efeitos.** Para novos estados/valores, rastreie origem, validação, atualização, consumo e falha. Considere entradas inválidas, reconexão, concorrência e limpeza quando aplicável.
5. **Execute as provas pertinentes.** Consulte checks do GitHub e reproduza localmente o que muda o veredito. Registre comando e resultado (ou motivo de não execução). Não declare cobertura que não foi observada.
6. **Escreva achados acionáveis.** Cada bloqueio indica localização, cenário, impacto e resultado esperado. Verifique a sugestão contra o critério que a motivou. Questões fora do escopo viram issue relacionado, não bloqueio disfarçado.
7. **Dê um veredito operacional.** Diga se pode integrar, o que impede, quais ressalvas permanecem e qual ordem/estratégia de integração é segura. O veredito vale somente para o SHA identificado.
8. **Faça a segunda passada.** Após correções, compare o novo SHA ao anterior, confira cada resposta e reavalie regressões no diff completo. Preserve as passadas anteriores como histórico.

Para mudanças sobrepostas, revise no máximo duas ou três PRs por passada, determine a ordem antes de aprovar e registre dependências. Verifique colisões de arquivos e contratos compartilhados; cada PR precisa continuar compreensível e validável na ordem indicada.

## Severidade e resposta

- **Bloqueador:** defeito reproduzível, critério de aceite descumprido, risco relevante de segurança/dados ou quebra de contrato que torna inseguro integrar.
- **Não bloqueador:** melhoria concreta sem impacto que impeça este PR; diga claramente que não bloqueia.
- **Pergunta:** informação necessária para avaliar uma hipótese. Ainda não é defeito confirmado.
- **Fora de escopo:** registre como sugestão ou issue vinculada e explique por que não altera o veredito.

O responsável responde a cada item como **corrigido**, **aceito como follow-up**, **não reproduzido** ou **não será alterado**, com justificativa e SHA quando aplicável. Se a resposta muda código, o revisor verifica o novo SHA antes de encerrar o item. Achado incorreto é retirado explicitamente.

## Formato do comentário de revisão

```markdown
## Veredito
Pode integrar / Não pode integrar / Inconclusivo — uma frase com a condição principal.

## Procedência
- PR e issue:
- Base e SHA revisado:
- Data da passada:

## Evidências
- Critério de aceite → prova observada:
- Checks/comandos → resultado:
- Verificações não executadas → motivo:

## Achados
- [Bloqueador | Não bloqueador | Pergunta] `arquivo:linha` — cenário, impacto e ação/decisão pedida.

## Pontos bem resolvidos
- comportamento ou risco que o PR tratou corretamente.

## Integração
- ressalvas, dependências e ordem segura; ou “sem ressalvas conhecidas”.
```

Não é necessário preencher uma seção artificialmente: escreva “nenhum” quando não houver achados. Comentários inline devem ficar nas linhas mínimas que demonstram o problema. O resumo da review deve conter veredito e procedência.

## Trilha do card e quadro

- Ao começar: mova `Ready` → `In Progress` e registre responsável, abordagem e dependências relevantes.
- Ao abrir PR: mova para `In Review`, vincule PR e atualize o checklist do issue com o que foi concluído e o que falta.
- A cada passada relevante: comente no issue o SHA revisado, veredito, bloqueios/decisões e links para comentários da PR. Atualize checkboxes junto com evidências; não marque item só porque o código foi escrito.
- Em bloqueio externo: mova para `Blocked` e registre causa, responsável pela resposta e próximo passo. Ao remover o bloqueio, retorne à etapa real.
- Após merge e validação: marque critérios comprovados, registre SHA de merge/release quando aplicável e mova para `Done`.
- Mudança de escopo/arquitetura: registre motivo e alternativas no issue; decisões duradouras também recebem ADR.

Use `./scripts/board.sh <issue> <coluna>` para atualizar o Project quando a automação não o fizer. Confirme o estado resultante; um comando sem erro não prova que o card mudou.

## Gates para merge

Antes de integrar, confirme critérios de aceite com evidência, checks obrigatórios no SHA atual, revisão independente no SHA atual, bloqueadores respondidos e rechecados, riscos/follow-ups no issue e dependências de merge resolvidas.

Se um check necessário não rodou, falhou ou não pode ser lido, o gate está **inconclusivo**, não verde. O workflow atual executa typecheck (`npm run lint`), testes (`npm test`) e build (`npm run build`); verifique a configuração vigente antes de afirmar que outros scanners estão ativos.

Acrescente provas conforme a área alterada:

- `package.json` ou lockfile: instalação limpa (`npm ci`), consistência do lockfile e `npm audit --audit-level=high`; falha de rede é **não medido**, não zero vulnerabilidades.
- `Dockerfile` ou Compose: `docker compose config`, build da imagem e smoke test HTTP do container em produção. Se Compose Watch mudou, confirme também que uma edição rastreada dispara a reconstrução esperada.
- Multiplayer/LAN: quando o aceite fala de dispositivos ou Wi-Fi, teste em aparelhos distintos na mesma rede e registre versões, topologia e medições. Vários contextos de navegador na mesma máquina provam o relay local, não a conectividade entre aparelhos.

## Piloto e medição

Aplicar este roteiro por duas semanas corridas, ou até revisar ao menos cinco PRs se o volume for baixo. Fazer lotes pequenos e registrar dados no issue/PR; na retrospectiva, consolidar uma tabela em um issue de acompanhamento. Não ampliar gates automáticos durante o piloto sem decisão registrada.

### Linha de base

Na abertura do piloto, registrar data, PRs abertas e estado de revisão, tamanho (arquivos/linhas do diff), checks disponíveis e duração observável entre PR pronta para revisão e primeira review. Não inferir ausência de revisão, tempo ou qualidade de uma tela incompleta. Anotar limitações e fonte dos números. É um retrato, não uma nota de desempenho.

#### Baseline inicial do Terrinha

Retrato público coletado em **2026-09-27 15:42 UTC** (navegação sem login):

| Sinal | Observação | Limite da evidência |
| --- | --- | --- |
| PRs abertas | 7: [#26–#31 e #33](https://github.com/martinsmiguel/terrinha/pulls) | Estado no momento da coleta |
| Primeira review | 0/7 tinham review; o filtro [`review:none`](https://github.com/martinsmiguel/terrinha/pulls?q=is%3Apr+state%3Aopen+review%3Anone) retornou as sete | Não há duração até primeira review para comparar |
| CI visível | 7/7 listavam checks aprovados; #30 está em Draft | Statuses visíveis na lista; não foram reexecutados nesta coleta |
| Issues abertas | 7: [#8–#12, #14 e #21](https://github.com/martinsmiguel/terrinha/issues) | Estado no momento da coleta |
| Milestones do repositório | nenhuma criada | Página pública [`milestones`](https://github.com/martinsmiguel/terrinha/milestones) |
| Projetos do repositório | nenhum listado na página pública | O board de conta `/users/martinsmiguel/projects/3` não ficou acessível sem login; seu conteúdo/estado não foi verificado |
| Trilha da issue #14 | checklist visível 0/3; label `backlog`; timeline registra PR #31 e #33 como abertas e comentários automáticos “card em revisão” | A issue tem evidência pública; não prova a posição no board privado |
| Integração das PRs #31 e #33 | `git merge-tree` entre as refs locais termina em conflito de conteúdo em `src/App.tsx`; ambas derivam da mesma base local `a483eb6` | Refs locais não puderam ser atualizadas por DNS; confirmar SHAs remotos antes de tomar decisão de merge |

**Follow-up autenticado (2026-09-27 15:50 UTC):** a sessão existente do Brave mostrou o campo Status do Project `Atividades` em **In Review** para as issues [#11](https://github.com/martinsmiguel/terrinha/issues/11) e [#21](https://github.com/martinsmiguel/terrinha/issues/21), embora ambas também exibam o label `backlog`. Portanto, o campo Status do Project é a fonte da etapa do card; labels de classificação não devem ser interpretados como etapa. A sessão foi retomada pelo usuário antes de conferir o Status do Project da issue #14; esse estado permanece **não verificado**. Nenhum status do board foi alterado nesta coleta.

**Follow-up de review (2026-09-27 15:58 UTC):** as PRs [#26](https://github.com/martinsmiguel/terrinha/pull/26), [#27](https://github.com/martinsmiguel/terrinha/pull/27), [#28](https://github.com/martinsmiguel/terrinha/pull/28) e [#30](https://github.com/martinsmiguel/terrinha/pull/30) receberam comentários de avaliação publicados pela própria conta autora das PRs. Os comentários registram SHA, evidências e veredito; as páginas ainda mostram **No reviews**. Contá-los como registros úteis, mas não como revisão independente concluída. A medida de review independente continua 0/7 até outra pessoa revisar o SHA atual.

**Leitura inicial:** há checks verdes, mas não há revisão independente registrada. A issue #14 é o caso piloto prioritário para validar a trilha, pois duas PRs se relacionam com ela e a descrição do PR #31 declara critérios atendidos enquanto o checklist publicado segue desmarcado. A verificação local de integração encontrou conflito real em `src/App.tsx`; nenhum veredito de merge deve ignorar esse conflito. Primeiro confirme SHAs e determine a ordem segura; não trate comentário automático ou check verde como substituto da review. Os tempos até primeira passada e retrabalho ficam **não medidos** até existir review e uma marca confiável de “pronta para revisão”.

Use este registro no issue de acompanhamento e preencha uma linha por PR:

| PR | SHA/base | Tamanho (arquivos/linhas) | Pronta para review em | 1º veredito em | Passadas | Bloqueios e resultado | Regressão em 30 dias |
| --- | --- | --- | --- | --- | ---: | --- | --- |
|  |  |  |  |  |  |  | Pendente |

Ao encerrar cada passada, marque as três dimensões obrigatórias (SHA/procedência, evidência dos critérios e veredito) como sim/não e registre checks executados e limitações. A tabela é preenchida com dados reais do GitHub; valores ausentes ficam como **não medido**, nunca zero.

### Métricas

| Medida | Como contar | Leitura desejada |
| --- | --- | --- |
| Procedência, evidência e veredito | Reviews independentes com SHA, prova dos critérios e veredito ÷ reviews independentes concluídas | 100% ao final do piloto |
| Bloqueios fechados com prova | Bloqueios resolvidos com resposta e SHA verificado antes do merge ÷ bloqueios resolvidos | 100%; analisar qualquer exceção |
| Tempo até primeira passada | Mediana entre PR pronta para review e primeiro veredito; reportar também a amostra | Comparar com a linha de base e explicar outliers |
| Retrabalho de review | Mediana entre SHA com achados e SHA reavaliado; contar passadas | Procurar fluxo previsível e causas de demora |
| Falsos positivos | Achados retirados após confirmação de que eram incorretos | Investigar padrões sem ocultar ocorrências |
| Reaberturas/regressões | Issues reabertas ou defeitos ligados a mudança aprovada em 30 dias | Investigar causa; janela curta é provisória |
| Follow-ups descobertos | Issues criados pela review com link ao PR e motivo | Rastreabilidade; volume não é meta de qualidade |

Registre número de PRs, tamanho do diff e contexto (urgência, dependência externa, disponibilidade de revisor). Compare mudanças de tamanho semelhante quando possível. Mais comentários, menor duração isolada ou zero falsos positivos não provam melhoria.

### Critério de avaliação

O piloto é adotável quando todas as reviews concluídas preenchem procedência, evidência e veredito; bloqueios são confirmados antes do merge; e tempo/retrabalho são explicáveis sem queda de cobertura. Só declare melhoria após comparar com a linha de base e analisar regressões; a janela de 30 dias pode exigir retrospectiva posterior. Se o custo aumentar sem reduzir dúvidas, retrabalho ou regressões, simplifique e meça novamente. Registre decisão **adotar**, **ajustar** ou **reverter**, evidências, limitações e responsável no issue de acompanhamento.
