# Explicação: contrato da alpha v0.8.0-alpha.1

> Quadrante **Explicação** — o que a entrega pública promete, o que ela corta e
> como algo só é considerado aceite.
>
> Fonte normativa: **definição oficial de produto 1.1.0 (2026-10-05)**, ADRs
> vigentes deste repositório e os cards do quadro de atividades. Em conflito,
> a definição 1.1.0 prevalece sobre textos antigos deste repositório, inclusive
> [especificacao-v2.html](especificacao-v2.html).
>
> **Este documento não declara gameplay entregue.** Ele separa compromisso de
> produto de estado atual do código. Onde algo ainda é previsto, está dito
> como previsto; a demonstração e o aceite acontecem por critério, com prova,
> no SHA final da release.

## 1. O que a alpha promete

### 1.1 Mundo: seis ilhas amplas

O mapa é um arquipélago de **seis ilhas**: quatro nascedouros amplos (um por
império) e **duas ilhas neutras colonizáveis**, com especialização vantajosa —
não exclusividade de insumo básico. Cada ilha natal comporta uma capital
imperial e regiões suficientes para que a própria ilha seja motivo de
exploração: espaço de capital, zonas de produção, florestas, pedreiras/jazidas,
planícies agrícolas, costa/portos, relevos e passagens.

O default de escala para o primeiro experimento é **mundo 768×768**, com ilhas
de aproximadamente **160–220 células de extensão**. É parâmetro inicial, não
dimensão já implementada nem benchmark aprovado. A escala final precisa
satisfazer as áreas mínimas abaixo e o orçamento medido; trocar o número sem
enriquecer terreno/conteúdo não atende ao requisito.

Critérios espaciais iniciais por ilha natal (defaults de validação, revistos
por jogada e benchmark nos cards [#52](https://github.com/martinsmiguel/terrinha/issues/52)/
[#65](https://github.com/martinsmiguel/terrinha/issues/65)/
[#66](https://github.com/martinsmiguel/terrinha/issues/66)/
[#89](https://github.com/martinsmiguel/terrinha/issues/89)):

- pelo menos **12.000 células terrestres transitáveis**;
- área de capital contígua para um distrito de **64×64 células**;
- ao menos **quatro regiões terrestres distinguíveis** e duas faixas de costa úteis;
- ensaio com **50 edifícios usuais** e **100 unidades em movimento** na ilha,
  sem cheats para terreno viável.

Nenhum nascedouro pode faltar com comida, madeira, ouro, pedra ou acesso ao
refino de tábuas. A ilha natal sustenta a progressão nas três eras sem obrigar
o primeiro frete; escassez regional interna continua orientando deslocamento.

### 1.2 Fundação: carroça, kit e escolha da sede

A partida começa **sem Centro pré-colocado**. Cada império nasce com uma
**carroça de fundação**, kit/material inicial e unidades de apoio. O spawn da
carroça é ponto de chegada, não localização definitiva: o jogador reconhece a
região, abre a prévia de terreno/espaço/custo, **escolhe o sítio** e confirma a
construção do primeiro Centro da Cidade (nome técnico legado: Centro da Vila).
Cancelar a prévia mantém a carroça; a fundação confirmada converte a carroça
uma única vez e consome o kit.

O inventário distingue **kit reservado** (não é recurso livre de comércio) de
**suprimento inicial**. A escolha da sede é a primeira decisão de produto da
partida; não existe ordem automática que transforme o spawn num Centro.

Cards: [#98](https://github.com/martinsmiguel/terrinha/issues/98) (N01),
com apoio em [#63](https://github.com/martinsmiguel/terrinha/issues/63)/
[#64](https://github.com/martinsmiguel/terrinha/issues/64).

### 1.3 Vida por fase

O império tem fases explícitas: **chegada** (carroça viva), **fundando**
(fundação viva), **ativo** (Centro concluído) e **eliminado**.

- Estar sem Centro na fase de chegada/fundação **não é derrota**.
- Perder a carroça ou a fundação pode eliminar, conforme a fase.
- Depois da capital concluída, destruir o Centro elimina o império — mesmo com
  colônias, tropas ou uma carroça reapresentada indevidamente pelo cliente.
- Dois ou mais impérios vivos mantêm a partida; um vence; zero empata.
  Entrepostos não são vidas extras.
- Não há segunda carroça treinável, Centro extra, host migration nem
  recuperação automática de slot nesta alpha.

### 1.4 Corpo, profundidade, travessia e ponte

Água não é cor pintada: a diferença entre fundo e superfície determina
profundidade, travessia e lentidão. A mesma consulta de
superfície/profundidade/corpo vale para mouse/teclado, ordens em rede,
pathfinding, movimento por tick, spawn, perseguição, separação e IA.

- **Rio/lago raso:** unidade a pé atravessa se a profundidade for segura para
  seu corpo, com redução de velocidade proporcional à imersão.
- **Rio/lago fundo:** bloqueia marcha a pé; exige **ponte** ou outra solução
  suportada. Não há nado/submersão involuntária.
- **Praia/margem de mar:** entra só na faixa rasa conectada à terra. Mar
  profundo e travessia entre ilhas exigem barco.
- **Ponte terrestre (MVP):** infraestrutura curta na mesma ilha, com
  custo/tempo/HP, superfície acima da água e destruição real. Não é ponte
  oceânica.
- **Barcos:** exigem oceano navegável e calado mínimo. **Rios/lagos
  permanecem fechados a barcos nesta alpha.**

Cards: [#99](https://github.com/martinsmiguel/terrinha/issues/99) (N02),
[#100](https://github.com/martinsmiguel/terrinha/issues/100) (N03).

### 1.5 Bots e perfis

A IA ocupa slots configurados no lobby e usa os **mesmos comandos, custos,
visão e autorizações** do jogador. O perfil é escolhido no lobby:

| Perfil | Comportamento |
|---|---|
| Pacífico | Desenvolve a própria região; não inicia incursões |
| **Defensivo (padrão)** | Economia + guarda; reage a invasão conhecida |
| Incursões | Treina grupos e tenta ataques periódicos, com regra, custo e limite |

Um bot que atacar outra ilha precisa navegar e transportar tropas
legitimamente: sem barco/rota/estoque, adia com motivo. Cronômetro não gera
recursos grátis e nenhum perfil tem privilégio invisível de produção.

Card: [#101](https://github.com/martinsmiguel/terrinha/issues/101) (N04).

### 1.6 Regras da sessão: interface e JSON

Física e mecânicas são orientadas a variáveis, editáveis **pela interface e
pelo JSON**, sobre o **mesmo catálogo validado** — como Settings e
`settings.json` numa IDE. Hierarquia: `defaults versionados → override local
do anfitrião → configuração inicial da sessão → patches administrativos`.

- O anfitrião é o **mestre da sessão**: define regras iniciais e ajusta
  parâmetros permitidos, com revisão/impacto registrados e visíveis.
- Cada valor tem tipo, unidade, limite, default, origem e política
  (`restartRequired` ou ao vivo). Campo desconhecido/JSON inválido é recusado
  com caminho — nunca aplicado parcialmente e nunca executado como JS.
- Convidados consultam e exportam a config efetiva; preferências de HUD são
  outro escopo e não alteram regra de simulação.
- Integridade não é opção: posse, IDs únicos, conservação, autorização e
  proibição de marcha terrestre interinsular permanecem invariantes, com
  limites de segurança para corpo/água.

Cards: [#63](https://github.com/martinsmiguel/terrinha/issues/63)/
[#88](https://github.com/martinsmiguel/terrinha/issues/88) (P25).

## 2. Defaults, história e precedência

Defaults novos são **experimentais e revisáveis**: mudam por decisão registrada
no card, com changelog, antes de virar promessa. Não são “aprovados na PoC”. A adoção dos valores no catálogo depende da
decisão `DEC-DEFAULTS` (#63/#65/#88), ainda pendente; o texto abaixo registra
a proposta de ensaio, sem declarar aceite de equilíbrio ou desempenho.

| Item | Status | Observação |
|---|---|---|
| Mundo **768×768** | Proposta experimental de ensaio | Ponto de partida do primeiro experimento; não é garantia nem dimensão aprovada por benchmark |
| Ilhas de **160–220 células** | Proposta experimental de ensaio | Sujeito às áreas mínimas e ao orçamento medido |
| Áreas de capital/regiões (12.000 células, 64×64, 4 regiões) | Propostas de validação | Revistos por jogada/benchmark em #52/#65/#66/#89 |
| Orçamento de **50 ms por tick** (p95 < orçamento) | Contrato técnico aceito | Velocidades 0,18/0,20/0,26 são distância **por tick**, não por segundo |
| Mundo **340×340** | **Histórico superado** | Teto fechado anterior; substituído pela diretriz de ilhas amplas de 2026-10-05. Preservado apenas como procedência |
| **Centro fixo** no spawn | **Histórico superado** | Substituído por carroça + kit + escolha da sede (§1.2) |
| Escassez obrigatória que obriga frete | **Histórico superado** | A ilha natal sustenta as três eras |
| Vadeamento **raso a pé** | **Decisão nova (2026-10-05)** | Rio/lago raso é travessia lenta para unidade a pé, com limites de corpo |
| **Rios/lagos fechados a barcos** | **Corte mantido** | Vadeamento a pé não revoga o corte naval; permitir barco em rio exige decisão específica |
| “Navegação” como tecnologia nova | **Corte mantido** | Cais e barcos não ganham barreira de era; Cartografia continua tecnologia existente |

O texto anterior (mundo 340×340, Centro fixo, escassez obrigatória) permanece
recolhido nos corpos das issues e no histórico da documentação **como
procedência**, não como critério concorrente.

## 3. Inclusões, cortes e jornada

### 3.1 Entra na alpha

- Seis ilhas (quatro natais + duas neutras), fundação por carroça com escolha
  da sede e vida por fase.
- Cinco recursos (madeira, comida, ouro, pedra, tábuas), cinco recursos de
  estoque por `(dono, ilha)`, entreposto com território/cura, transporte
  colonial distinto do mercante, rota mercante entre dois portos próprios.
- Combate terrestre/naval com o elenco atual (aldeão, soldado/mosqueteiro,
  cavalaria, pesqueiro, mercante, navio de guerra) + carroça de fundação +
  transporte colonial; sem herói, artilharia de cerco ou inventário RPG.
- **Três eras (Colonial, Comércio, Industrial) e sete tecnologias** com seus
  pré-requisitos, preservados.
- **Cinco maestrias** (Náutica, Metalurgia/Mineração, Engenharia/Pioneirismo,
  Misticismo/Alquimia, Balística/Arte Militar) e os seis talentos descritos no
  planejamento de produto: **complementam** eras/pesquisas, não as substituem.
  XP vem de efeitos reais validados pelo host.
- Plantas raras e monumentos nas ilhas natais e neutras, com coleta/restauração,
  bênção/farol e estações com efeitos limitados e estado real da sessão
  (P18, [#84](https://github.com/martinsmiguel/terrinha/issues/84)).
- Ondas Gerstner com parâmetros/tempo compartilhados entre CPU e shader,
  tempestades sinalizadas e perdas navais contabilizadas uma vez (P19,
  [#79](https://github.com/martinsmiguel/terrinha/issues/79)/
  [#80](https://github.com/martinsmiguel/terrinha/issues/80)/
  [#86](https://github.com/martinsmiguel/terrinha/issues/86)).
- Física de corpo/profundidade, ponte interna MVP e perfis de bots.
- Regras configuráveis por interface e JSON (§1.6), HUD com dados reais,
  rede com visão auditada no host.

### 3.2 Cortes explícitos (fora da alpha)

| Tema | Corte |
|---|---|
| Persistência | Conta, cloud, progresso offline, salvamento, host migration, reconexão com slot |
| Rede pública | Matchmaking, ranked, anti-cheat contra host, WebRTC/lockstep, backend global |
| Política/social | Diplomacia, alianças, chat social, troca entre impérios |
| Modos | Campanha narrativa, espectador, replay completo, jogo mobile/touch completo |
| Conteúdo | Cinco eras, heróis, inventário/equipamentos, cerco, árvore ilimitada |
| HUD | SDK/mods, layouts livres por conta, radial/lote/editor livre (candidatos #60/#61/#97, dependem da avaliação #56) |
| Náutica | Navegar rios/lagos, bombardear construções em terra, pontes oceânicas, nado |
| Reversão | Desfazer guerra, ressurreição, restituição de frete perdido |

Reabrir qualquer corte exige mudança explícita na definição de produto, com
impacto em marcos, card e critério de aceite. Ter sido escrito num estudo ou
aparecer numa imagem não concede autorização.

### 3.3 Jornada da alpha

Os seis marcos (M1 base confiável, M2 escala alvo, M3 colonização/logística,
M4 HUD integrado, M5 progressão por uso, M6 náutica/calibração) são **aceites
de produto**, não issues fechadas. A publicação segue a cadeia
`ALPHA-VERSAO → (ALPHA-LAN + ALPHA-HUMANO) → ALPHA-ACEITE → ALPHA-PUBLICAR`.
LAN e teste humano final podem ocorrer em paralelo, ambos no mesmo SHA
preparado por ALPHA-VERSAO. ALPHA-ACEITE exige os dois: a avaliação inicial
da PoC (#56) não substitui o teste humano do build final escolhido. A
publicação preserva esse SHA, depois de:

- lint/test/build no SHA final e revisão independente;
- jornada jogável em **quatro dispositivos** reais;
- avaliação humana de HUD (#56) separada da verificação técnica;
- medições declaradas (cenário, seed, hardware, população) e evidência por
  requisito.

Não há data comprometida de release nem promessa de duração de partida.
PR aberto, merge, teste verde e tag são fatos diferentes; **nenhum deles é,
sozinho, aceite**.

### 3.4 O que não é publicado aqui

Estudos privados, apostilas e relatórios internos permanecem em documentação
local, sem remoto. Este repositório recebe apenas a **síntese funcional**
necessária para jogar, revisar e contribuir. Não copiar estudos privados para
issues, PRs ou `docs/` automaticamente.

## 4. Estado atual x contrato

A tabela abaixo evita que documentação descreva como entregue o que ainda é
compromisso. “Código atual” é o comportamento do build existente; “Contrato” é
o que a alpha precisa demonstrar.

| Domínio | Código atual (baseline) | Contrato da alpha | Cards |
|---|---|---|---|
| Início | Centro completo criado no spawn | Carroça + kit + escolha da sede | #98, #63/#64 |
| Vitória | Derrota depende só de Centro vivo | Vida por fase; empate/desconexão explícitos | #98, #74, #89 |
| Mundo | 4 ilhas, `MAP_SIZE` reduzido | 6 ilhas amplas, default experimental 768×768 | #52/#65/#66 |
| Física | Sem corpo/profundidade compartilhados | Raso lento, fundo bloqueado, ponte MVP, calado | #99/#100 |
| Mercante | Renda passiva por barco vivo | Sem ouro passivo; frete real entre portos | #72/#73/#86 |
| Elenco | Sem carroça/transporte colonial | Carroça de fundação + transporte colonial (6 tropas/200) | #98, #70/#71 |
| Bots | IA rudimentar sem perfil | Pacífico/Defensivo/Incursões nos mesmos comandos | #101 |
| Regras | Constantes em código, prefs de HUD | Settings UI/JSON no mesmo esquema, mestre do host | #63/#88 |
| Progressão | Três eras e sete tecnologias | Mantidas; maestrias/talentos complementam | #81/#82/#83 |

Enquanto uma linha não tiver prova no SHA final, ela continua **prevista**.
Documentação não substitui implementação e não deve ser usada para aparentar
um marco pronto.

## 5. Como algo vira aceite

1. **Critério por critério.** Cada critério do card é demonstrado com uma
   prova própria: teste, relatório, execução manual com passos, entrada e
   saída reais. Print isolado não substitui prova funcional.
2. **Prova no SHA final.** O registro identifica atividade, SHA completo,
   cenário, ambiente, seed (quando houver), limites do que foi verificado e
   o revisor. Resultado **inconclusivo não é aceite**.
3. **Revisão independente.** Quem implementou não revisa a própria mudança;
   o review confere SHA, checks e provas antes do merge.
4. **Checks pertinentes.** `npm run lint`, `npm test` e `npm run build` no
   SHA final, além das verificações de rede/regras aplicáveis à fatia.
5. **Aceite humano onde ele é humano.** Aceite visual, balanceamento,
   desempenho e usabilidade não se resolvem com teste verde.

Merge e release continuam etapas distintas de aceite; mudanças posteriores que
afetem prova aceita reabrem o card correspondente.

## 6. Referências

- [Especificação do produto (v2)](especificacao-v2.html) — texto histórico;
  em conflito com este contrato, prevalece este.
- [Arquitetura geral](arquitetura-geral.md) ·
  [ADRs](adr/) ·
  [Eras e tecnologias](../reference/tecnologias-eras.md) ·
  [Unidades e edifícios](../reference/unidades-edificios.md)
- [Quadro de atividades](https://github.com/users/martinsmiguel/projects/3) —
  cards, dependências e estado de cada fatia.
- Definição oficial de produto 1.1.0 e o plano de execução são documentação
  interna de produto; este contrato é a síntese pública correspondente.
