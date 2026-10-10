# Card #89 — estado do alpha integrado (SHA da main no momento do PR)

**Este card NÃO está pronto para Done:** os gates dependem de validação humana, quatro dispositivos em LAN e aceite explícito, o que a automação não substitui.

## O que a automação já confere (verde no mesmo SHA)

- `npm run lint` (tipos, fronteiras dos módulos puros, checagem de documentação), 693 testes em 69 arquivos, `npm run build` (cliente e servidor).
- Cards de implementação M1–M6 concluídos no quadro (ver issues #49 a #101), cada um com testes e evidência em `docs/evidence/`.
- Medições: A* por escala (#77), ordem em massa e campo de fluxo (#78), compressão em quatro jogadores no relay local (#53), validação final do arquipélago (#52), HUD fechado a 19,3% em 1440x900 (#86).

## O que só humano ou ambiente real fecha

| Fatia do #89 | Situação |
| --- | --- |
| GATE-M1 a GATE-M6 | Demonstração e aceite por jogador: pendentes (roteiro em `docs/how-to/validar-alpha.md`) |
| ALPHA-VERSAO | Changelog reconstruído (#94); `package.json` ainda em 0.7.1: a versão 0.8.0-alpha.1 só deve ser fixada no aceite |
| ALPHA-LAN | Quatro dispositivos em LAN/Wi-Fi: pendente |
| ALPHA-HUMANO | Avaliação do HUD e acessibilidade com jogador: pendente (CSV vazio em `docs/evidence/card-56/avaliacao-humana.csv`) |
| ALPHA-ACEITE / ALPHA-PUBLICAR | Dependem dos anteriores e do seu aceite explícito |

Nenhum número de ganho de 75%, 60 FPS ou usabilidade foi fabricado.

## Validação integrada automatizada em `50506a3` (2026-10-10)

Ambiente: macOS arm64 (Apple M1, 8 núcleos, 8 GB), Node 25.6.1, Docker Desktop. SHA: `50506a3cf8aa829672c6ba2266d6ac6ad3dc9386` (`main`).
Este bloco substitui os números de testes do bloco anterior (693 testes em 69 arquivos).

| Verificação | Comando | Resultado |
| --- | --- | --- |
| Tipos, fronteiras e scripts inline | `npm run lint` | passou |
| Testes | `npx vitest run` | 712 testes em 71 arquivos, todos verdes |
| Build do cliente e do servidor | `npm run build` | passou |
| Documentação | `node scripts/check-docs.mjs` | 36 documentos, nenhum problema |
| Segredos | `node scripts/security-scan.mjs` | `secret-scan: clean` |
| Imagem Docker | `docker build -t terrinha:gate89 .` | passou |
| Produção em container (porta 3001) | `node scripts/smoke-production.mjs http://127.0.0.1:3001` | quatro páginas com assets compilados, `/api/lan-info` e conexão websocket do Socket.IO confirmados |

### Dependências dos gates

Das 49 issues listadas nas fatias GATE-M1 a GATE-M6, 48 estão fechadas e em Done e 1 (#53) está fechada com o card em In Review no quadro. A #53 tem a medição em loopback e em links simulados, mas **não** a avaliação em quatro dispositivos reais.

### Desempenho (`tests/perf/archipelagoBenchmark.test.ts`, orçamento de 50 ms por tick)

| Cenário | 1º tick (ordem em massa) | Tick p95 |
| --- | --- | --- |
| 120 unidades, mundo 60, sementes 1, 42 e 777777 | 17 a 28 ms | 0,6 a 0,8 ms |
| 240 unidades, mundo 60, mesmas sementes | 36 a 39 ms | 1,3 a 1,4 ms |
| 120 unidades, mundo 192 | 21 ms | 0,7 ms |
| 120 unidades, mundo 280 (padrão do lobby) | 35 ms | 0,6 ms |
| 120 unidades, mundo 384 | 51 ms (acima do orçamento) | 0,8 ms |
| 120 unidades, mundo 768 | 141 ms (acima do orçamento) | 0,7 ms |
| Ciclo naval completo (cais, barco, embarque, viagem, desembarque) | pior fase p95 de 0,17 ms | |

Limites: uma máquina, sem carga concorrente; o primeiro tick de ordens em massa passa de 50 ms em 384 e 768; render, quadros por segundo e banda em rede real não foram medidos aqui (banda e latência em loopback e Wi-Fi simulado: `docs/evidence/card-53/`).

### O que não foi coberto nesta execução

- Demonstração de P01 a P25 e M1 a M6 por jogador, e as jornadas natal e marítima sem cheats em quatro dispositivos.
- Cobertura nomeada de F01 a F08: não achei uma matriz F01-F08 no repositório para conferir; fica **inconclusivo**.
- Modo `docker compose watch`, revisão visual, teclado em todos os overlays e avaliação humana do HUD (o CSV do #56 continua vazio).
- Revisão independente no SHA final e aceite explícito.
- Versão, changelog final, tag e release: não foram tocados, porque a versão 0.8.0-alpha.1 só deve ser fixada no aceite.

Conclusão: a parte automatizável está verde no SHA acima. O card #89 **continua sem condição de Done**.
