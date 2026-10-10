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
