# Referência: ofícios do império

> Quadrante **Referência**. Fontes: [`src/game/crafts/`](../../src/game/crafts/), [`src/game/mastery.ts`](../../src/game/mastery.ts). Card [#176](https://github.com/martinsmiguel/terrinha/issues/176), épico [#182](https://github.com/martinsmiguel/terrinha/issues/182).

O conhecimento é **do império**: não se perde quando um aldeão morre. Cada ofício evolui de duas formas: **trabalho** (eventos reais da partida, validados pelo host) e **estudo pago**. Níveis vão de 1 a 10; cada nível dá um ponto de talento. A curva é `ceil(100 × nível^1,95)` XP por nível, crescente para limitar a disparada de quem sai na frente.

## Ofícios e o que os treina

| Ofício | Aprende com | XP |
| --- | --- | --- |
| Carpintaria | Cortar madeira; produzir tábuas na serralheria | 0,1 por madeira; 0,5 por tábua |
| Cantaria | Extrair pedra | 0,1 por pedra |
| Mineração e Metalurgia | Extrair ouro (metais nas eras seguintes) | 0,1 por ouro |
| Agricultura | Colher comida em terra | 0,1 por comida |
| Navegação | Pescar; levar carga por mar | 0,2 por peixe; 0,15 por carga entregue |
| Comércio | Levar carga por mar | 0,15 por carga entregue |
| Guerra | Causar dano | 0,05 por ponto de dano efetivo |
| Exploração | Descobrir setores, plantas e monumentos | 10, 25 e 40 (uma vez por chave) |
| Colonização | Fundar capital e postos avançados | 60 (uma vez por construção) |

Mais trabalhadores produzem mais e, por isso, evoluem o ofício mais rápido.

## Estudo pago

- **Próximos desbloqueios:** o painel de Talentos (Alt+T) e a aba Ofícios do livro do império (Alt+L) mostram, para cada ofício, o próximo nível que abre algo: receitas, construções, unidades e eras (`craftUnlocks`, `nextCraftUnlock` em `src/game/recipeBook.ts`).
- Comando `study_craft` (botão "Estudar" no painel de Talentos, Alt+T). O host valida ofício, teto e recursos; recusa não debita.
- Custo: o custo base do ofício vezes o nível atual, pago pela **metrópole**.
- Cada sessão rende metade do XP que falta para o próximo nível (duas sessões por nível).
- **Teto por era:** o estudo leva até o nível 2 na Pedra, 3 no Bronze, 4 no Ferro, 5 na Medieval, 7 nas Navegações e 10 na Industrial. O trabalho pode passar do teto.
- **Passagem de era:** cada avanço exige níveis de ofício que cabem no teto da era anterior ([eras](tecnologias-eras.md)).
- A **IA** estuda sozinha a cada 30 s o ofício de economia mais atrasado (carpintaria, agricultura, mineração, cantaria), só se sobrar o dobro do custo.

## Receitas por nível

Cada receita declara o ofício que treina e o nível mínimo (`requires.craftLevel`); o host só produz com o nível atingido (`canUseRecipe`).

## Migração das maestrias antigas

Exploração → Exploração; Navegação (seafaring) → Navegação; Colonização (settlement) → Colonização; Combate → Guerra; Extração → Agricultura, Carpintaria, Cantaria e Mineração (cada um herda o nível). Pontos de talento e eventos já creditados ficam como estavam; talentos comprados continuam válidos.

## Acrescentar um ofício

Criar `src/game/crafts/<id>.ts` (`id`, `name`, `learnedBy`, `studyCost`), incluir em `CRAFT_DEFS` e dizer em `xpGains` (`mastery.ts`) quais eventos o treinam. O teste `crafts.test.ts` falha se um arquivo da pasta não estiver registrado.
