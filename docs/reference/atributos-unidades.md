# Atributos e modificadores de unidades

`src/game/unitAttributes.ts` define HP, dano, movimento por tick (20 Hz), alcance, visão, tempo de recarga e corpo por tipo. O mesmo catálogo alimenta o início da partida, unidades treinadas, combate, visão e validação de ataques. Barcos de pesca e comércio são civis e não atacam.

O valor efetivo segue `max(0, (base + soma dos bônus planos) × (1 + soma dos bônus percentuais))`. Tecnologias concluídas entram uma vez na soma percentual. Valores não finitos são recusados.

O contrato JSON `version: 1` permite ajustes explícitos por unidade para `maxHealth` (1–10000 HP), `attackDamage` (0–1000 HP por golpe), `movePerTick` (0,01–2 células por passo) e `visionRadius` (1–60 células). `parseRuleSettings` é o parser comum para uma futura interface e para a entrada por código. Chaves desconhecidas, versões não suportadas e valores fora dos limites são recusados. Na ausência de override, o catálogo é usado. Regras validadas podem fazer parte do estado da sessão e são aplicadas pelo host; a sessão atual usa os defaults. A edição de regras em UI/JSON pertence ao card #88.

A coleta credita no máximo o restante do depósito por tick. A renovação de cardumes não credita recursos extras. Ordens de ataque de barcos civis são recusadas na rede e também neutralizadas pelo tick se um estado inválido chegar à simulação.

## Passo válido

Todo deslocamento da simulação (movimento, coleta, obra, reparo e perseguição de ataque) passa por
`stepToward` em `src/game/movement/step.ts`. A velocidade vem de `movePerTick` do catálogo, o passo
nunca ultrapassa o alvo e um passo para terreno proibido é recusado: terra transitável para unidades
terrestres, oceano para barcos. Quando o passo é recusado a unidade fica ociosa e perde a ordem.
Profundidade, declive e apoio ainda não são modelados; entram com a integração ao terreno real (#99, N02-02).

## Visão (#194)

Raios em células, usados pela névoa do jogador e pela autorização do host (alvo só se visível):

| Unidade ou edifício | Visão |
| --- | --- |
| Aldeão | 13 |
| Soldado | 16 |
| Cavalaria | 14 |
| Carroça de fundação | 16 |
| Barco de pesca, mercante, transporte colonial | 11 |
| Barco de guerra | 13 |
| Centro da Vila | 24 |
| Quartel | 18 |
| Demais edifícios | 14 (21 em cais e posto com o talento Farol) |

Os raios cresceram cerca de 60% no #194, depois que as ilhas ficaram 20× maiores (#161). Na tela, o que já foi
explorado fica bem mais claro que o nunca visto (brilho 170 de 255; o visível segue pleno).

