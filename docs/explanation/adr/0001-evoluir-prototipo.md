# ADR-0001: Evoluir o protótipo existente como base do projeto

## Status

Aceito — 2026-09-27

## Contexto

O repositório já contém um protótipo jogável (~11 mil linhas) com mapa
procedural, economia, construção, combate, minimapa com névoa e multiplayer
local. A [especificação do produto](../especificacao-v2.html) descreve um
alvo com arquitetura em plugins (Plugin Host + Event Bus) escrito do zero.

Duas estratégias possíveis:

- **(A)** Reescrever do zero seguindo a spec (Plugin Host primeiro).
- **(B)** Evoluir o protótipo card a card na direção da spec.

## Decisão

**Estratégia B.** O protótipo é a versão `0.1.0` da linha de tempo SemVer e
serve de base evolutiva. A arquitetura em plugins é alcançada por
refatorações incrementais, cada uma coberta por card com critério de aceite.

## Consequências

- ✅ Jogo jogável desde o primeiro commit; progresso visível card a card.
- ✅ Risco baixo: cada refactor é pequeno e verificável manualmente.
- ✅ Multiplayer LAN já funciona — objetivo central do produto.
- ❌ Convivemos temporariamente com o "god component" `App.tsx` (~6300 linhas).
- ❌ A spec não é obedecida literalmente em ordem (há dívidas mapeadas em cards).

## Alternativas descartadas

- Reescrever do zero: meses sem jogo jogável; risco de abandono.
