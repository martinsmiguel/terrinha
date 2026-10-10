# Card #70 — transporte de seis tropas e carga de colonização

Código: `src/game/colonialTransport.ts` (domínio puro, nas fronteiras), unidade `colonial_transport` (modelo, atributos, custo, corpo de barco,
atalho `X` no cais), desembarque gradual no tick de `simulation.ts` e comando `disembark` no `App.tsx`.
Testes: `tests/unit/colonialTransport.test.ts` (489 no total, lint e build ok).

| Critério | Prova |
| --- | --- |
| Transporte distinto: 6 tropas, 200 de carga ou kit 150 madeira/50 pedra; mercante 100/125 com talento, sem renda/ataque no colonial | Catálogo, `cargoCapacity`, atributos (ataque 0), porão e kit ocupam os 200 |
| Embarque valida vida/posse/distância/capacidade/IDs únicos; passageiro sai do mundo ativo, mantém pop, sem ordem terrestre | `applyEmbarkOrder` com vivos, aliados, longe, duplicados; autorização recusa mover passageiro; pop 10 antes e depois |
| Desembarque 0,5 s (0,25 s com talento) só em apoio válido; bloqueio mantém restantes e carga; kit transferido e posto debitado uma vez | `disembarkStep`; mar aberto bloqueia; `loadKit`/`deliverCargo` idempotentes; sem posto a carga fica a bordo |
| Afundamento perde casco/carga/passagens/pop uma vez, inclusive com repetição | `sinkTransport` e tick com casco a 0 baixam a pop 3 uma vez; segundo tick e segunda chamada não repetem |

Controle negativo: sem limpar carga e kit na entrega, o teste de entrega única falha.

## Limites

- Custo 180 madeira/40 ouro/50 tábuas, 360 HP e velocidade 0,14 são o catálogo revisado proposto, sem avaliação de jogo.
- Carregar o porão e o kit é função de domínio testada; os comandos de rede e a interface do porão são do #71.
- "Apoio válido" para pouso é terreno de pouso livre; entregar carga e kit exige posto próprio vivo ao alcance (8), em obras vale como depósito provisório.
- O talento de desembarque é parâmetro (`talent`): o sistema de talentos é do #82.
- O mercante continua com a renda de 0,15 de ouro por barco existente; o transporte colonial não rende.
