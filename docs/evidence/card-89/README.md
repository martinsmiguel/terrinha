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
