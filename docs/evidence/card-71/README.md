# Card #71 — carregar e descarregar porão naval

Código: `holdOf`, `previewLoad`, `previewKit`, `previewDisembark` em `src/game/colonialTransport.ts`; comandos `load_cargo` e `load_kit`
(validação, autorização e aplicação no host em `networkCommands.ts` e `App.tsx`); painel do barco em `SelectionPanel.tsx`.
Testes: `tests/unit/colonialTransport.test.ts` (494 no total, lint e build ok).

| Critério | Prova |
| --- | --- |
| UI com passageiros/porão/capacidade/origem/destino reais; transporte 200 versus mercante 100/125 | O painel lê `holdOf` (ocupação real, kit a bordo, capacidade) e mostra origem (`Metrópole`/`Colônia (ilha N)`) e destino da prévia; teste de `holdOf` cobre 200, 100 e 125 |
| Prévia e cancelar não mutam; o host revalida posse, estoque e apoio | A prévia devolve motivos sem alterar o estado (comparação do estado serializado); a autorização refaz a prévia no host; estoque gasto depois da prévia recusa a confirmação |
| Explica praia bloqueada, falta de recurso e espaço; preserva a carga | Motivos: porão cheio, "Falta N de madeira no estoque de ...", longe do apoio, só o colonial leva kit, "Praia bloqueada" com passageiros e carga mantidos |
| Dois donos e conservação | Duas docas, dois donos: total de madeira 420 antes e depois; o saldo de um não paga o porão do outro |

Controle negativo: sem a checagem de saldo na prévia, o teste de revalidação do host falha.

## Limites

- Os botões carregam em passos de 50 por recurso e o kit inteiro; não há campo de quantidade livre.
- Verificação visual do painel no navegador não foi feita nesta sessão (a prova é por teste de domínio e tipos).
- O talento de 125 depende do #82; o painel usa a capacidade base.
- A origem do carregamento é a localidade do ponto do barco; o destino mostrado no desembarque é a localidade onde o barco está.
