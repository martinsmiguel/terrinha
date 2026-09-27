# Referência: eras e tecnologias

> Quadrante **Referência** — dados exatos. Fonte: `src/game/tech.ts`
> (`ERA_UPGRADES`, `TECH_DEFS`, `MAX_RESEARCH_QUEUE`) e
> `src/App.tsx` (aplicação no tick).

## Eras

A colonia começa na **Era Colonial**. Avançar de era é uma pesquisa com custo
e duração próprios, feita pelo botão **Tecnologias** (barra do HUD).

| Era | Custo | Duração | Desbloqueia |
| --- | --- | --- | --- |
| Colonial (inicial) | — | — | Canais de Irrigação, Cunhagem, Estriamento do Cano |
| Era do Comércio | 300 madeira + 250 ouro | 30 s | Cartografia, Corpo de Fuzileiros |
| Era Industrial | 500 madeira + 500 ouro | 45 s | Logística Montada, Serrarias a Vapor |

## Tecnologias

| Id | Nome | Era | Categoria | Custo | Duração | Pré-requisito | Efeito |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `irrigation` | Canais de Irrigação | Colonial | Economia | 150 M + 60 O | 20 s | — | +25% coleta de madeira |
| `coinage` | Cunhagem | Colonial | Economia | 120 M + 80 O | 25 s | — | +25% extração de ouro |
| `rifling` | Estriamento do Cano | Colonial | Militar | 100 M + 120 O | 30 s | — | +25% dano da infantaria |
| `cartography` | Cartografia | Comércio | Economia | 250 M + 200 O | 35 s | Cunhagem | +25% extração de ouro (acumula) |
| `musketeer_corps` | Corpo de Fuzileiros | Comércio | Militar | 300 M + 250 O | 40 s | Estriamento do Cano | +35% dano da infantaria |
| `logistics` | Logística Montada | Industrial | Militar | 350 M + 300 O | 40 s | Corpo de Fuzileiros | +30% dano da cavalaria |
| `steam_mills` | Serrarias a Vapor | Industrial | Economia | 400 M + 350 O | 45 s | Cartografia | +40% coleta de madeira |

M = madeira, O = ouro.

## Regras da fila

- Fila única por jogador, com **máximo de 3 itens** (`MAX_RESEARCH_QUEUE`).
- Era e tecnologias compartilham a mesma fila; o item seguinte só começa quando
  o atual chega a 100%.
- Os recursos são debitados **no início** da pesquisa (custo único de verdade:
  `canAfford`/`applyCost` em `src/game/economy.ts`).
- O host valida tudo antes de debitar: era, pré-requisito, custo e espaço na
  fila (`researchBlock` em `src/game/tech.ts`; comando de rede `research`).
- Requisitos bloqueados aparecem no `TechPanel` com o motivo (`era`,
  `requires`, `cost`, `busy`, `already`).

## Como o efeito é aplicado

- **Coleta**: `gatherMultiplier(techs, tipoDeRecurso)` multiplica a taxa final
  da unidade no tick (já aplicados os bônus de Serralheria/Mineradora).
- **Combate**: `unitDamageMultiplier(techs, unidade)` multiplica o dano base no
  momento do ataque; bônus do mesmo estatuto **acumulam multiplicativamente**
  (Cunhagem + Cartografia = ×1,5 de ouro).
- O estado fica em `GameState.techs[slot]` e é sincronizado com todos os
  clientes — a UI só lê o estado recebido.
