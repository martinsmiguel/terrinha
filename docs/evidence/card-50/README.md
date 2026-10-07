# Evidências de desenvolvimento — cais #50

Candidato executado: `2f5ed40640bcc77bc300be1bc0e314fd417da199`, branch
`fix/cais-oceano-50`, sobre o servidor `b2c2beb6f3f2192c3deb6cc49be8cc9257db5a6b`
da PR #105. O servidor ainda não foi integrado na main; a PR #107 usa essa
branch como base temporária para revisão do diff exclusivo do cais.

## Cenário e ambiente

2026-10-06, macOS, Safari, janela1313×1050, `/poc.html` via Docker Node22-alpine,
porta local3010. Tamanho60, seed113924 observada na notificação do botão de
regeneração existente. Sem console/injeção de recursos/unidades. A regeneração
mantém a base inicial e não prova o spawn da fundação por carroça previsto no
produto; esta evidência cobre somente o cais da baseline.

## Critério → prova

1. Prévia/host: onze testes de `tests/unit/buildingGhost.test.ts` chamam a
   regra de placement e `applyBuildingFoundation`, que o App usa na aplicação.
   O teste de comando usa JSON validado e verifica autorização, saldo,
   atribuição do aldeão, repetição/recusa e snapshot imutável.
2. Costa versus água indevida: [recusa no oceano](oceano-recusado.png), com
   mensagem e saldo350 preservado. Lago/rio isolado, mapa ausente, terreno,
   cardume e costa cobertos com geografia real, seeds24680/13579/777 nos testes.
3. Spawn oceânico próximo: teste conclui treino de cais válido, valida
   `isOceanAt` e distância≤3.6; estados sem mapa/saída mantêm fila/população.
4. Fluxo normal da UI: [fundação na costa](fundacao-costa.png), madeira350→210,
   aldeão atribuído e construção iniciada. Limites adicionais abaixo.
5. Referência arquivada `fix/integridade-naval-49:src/game/buildingGhost.ts`
   conferida: usa isOceanAt; não foi copiada a PoC inteira.
6. Lint, 203 testes/20 arquivos, build cliente+servidor e build Docker passaram.
   Smoke real confirmou200 das quatro páginas, assets compilados, API LAN e
   conexão Socket.IO WebSocket. A primeira tentativa do smoke aconteceu antes
   do servidor estar pronto e falhou; a repetição após log de inicialização
   passou, não foi atribuída uma aprovação à tentativa falha.
7. Registro técnico do candidato, sem revisão independente/aceite integrado.
   Atualização posterior da base exige repetir checks e provas afetadas.

## Docker e reprodução

Imagem testada: `terrinha-card50-review:2f5ed406`, ID
`sha256:f281a997b7f33de284b4d006039b08d6871f5394f394e1938792316ac934ab9e`.
Base resolvida: node22-alpine digest
`sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402`.

```sh
npm run lint
npm test
npm run build
docker build -t terrinha-card50-review:2f5ed406 .
docker run --rm -d --name terrinha-card50-smoke-2f5ed406 -p 127.0.0.1:3010:3000 terrinha-card50-review:2f5ed406
docker logs terrinha-card50-smoke-2f5ed406
node scripts/smoke-production.mjs http://127.0.0.1:3010
```

## Limites

Sem LAN em aparelhos distintos (não exigido pelo #50), sem avaliação humana
formal de HUD. A primeira sessão visual encerrou antes de registrar o barco;
a passagem adicional abaixo conclui essa prova. Spawn naval também é verificado automaticamente; os screenshots
isolados não comprovam conservação ou autorização. Docker relatou uma
vulnerabilidade alta já existente, rastreada para triagem em #93; não é resultado
zero vulnerabilidades nem alteração de dependências nesta PR.

Estes artefatos documentais foram adicionados após a execução: não alteram
fontes, package/lock, Dockerfile ou configuração do build. Identificar também
o SHA que os publica; revisão não é aprovação anterior nem aceite fictício.

## Passagem visual adicional — treino e spawn naval

2026-10-06, Safari/macOS1313×1050, mesma imagem/runtime2f5ed406, porta3010,
mapa60 regenerado normalmente, seed915663 observada na notificação da UI.
A seed113924 acima identifica exclusivamente a primeira passagem; não misturar
as duas capturas/cenários. Código do candidato448b14f difere do runtime apenas
pelos artefatos documentais, como verificado por git diff.

1. Fixar câmera, centrar base e regenerar mapa; selecionar aldeão ocioso/B.
2. Construir cais em margem livre: madeira350→210, builder atribuído; completar.
3. Outro aldeão constrói serralheria: madeira210→100. Ordenar coleta numa árvore
   pelo botão direito; aguardar refino normal até botão naval habilitado.
4. Selecionar cais completo700/700, clicar Barco de Pesca75M/25T uma vez.
   UI mostrou fila1/5, progresso e mensagem de inclusão; ao terminar, fila0/5
   e população3→4. A captura [treino concluído](treino-concluido.png) registra
   a conclusão, não uma fila ainda em progresso. Coleta/refino continuam durante
   os screenshots, por isso saldos entre quadros não isolam o débito do treino.
5. [Barco na água junto ao cais](barco-na-agua.png), antes de qualquer ordem
   de deslocamento; [unidade identificada](barco-identificado.png) confirma
   Barco de Pesca Idle220/220HP, passageiros0/2 e pop4/15. A UI não expõe
   isOceanAt/coordenadas; a prova automatizada complementa a classificação
   navegável/distância≤3.6. Nenhum teletransporte/injeção/console foi usado.

Esta passagem fecha a pendência de demonstração visual naval do candidato,
sem equivaler a revisão independente ou aceite na main. A atualização da base
após integração do servidor exige repetir provas/checks afetados.
