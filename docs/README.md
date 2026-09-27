# Documentação do Terrinha

Documentação organizada pelo framework [Diátaxis](https://diataxis.fr/), em quatro
quadrantes. Escolha pelo que você quer fazer:

| Quadrante | Necessidade | Onde |
| --- | --- | --- |
| **Tutorial** | "Quero aprender, passo a passo" | [`tutorials/`](tutorials/) |
| **How-to** | "Quero resolver um problema concreto" | [`how-to/`](how-to/) |
| **Referência** | "Preciso de dados técnicos exatos" | [`reference/`](reference/) |
| **Explicação** | "Quero entender o porquê e o como" | [`explanation/`](explanation/) |

Decisões arquiteturais são registradas como **ADRs** em
[`explanation/adr/`](explanation/adr/).

A especificação completa do produto está em
[`explanation/especificacao-v2.html`](explanation/especificacao-v2.html) (CC BY 4.0).

## Regras

- Um documento pertence a **um** quadrante — não misture tutorial com referência.
- Tudo que muda no jogo deve virar commit (Conventional Commits) ligado a um card.
- Decisão arquitetural nova = novo ADR numerado.
