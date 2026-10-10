# Tutorial: sua primeira partida em 5 minutos

> Quadrante **Tutorial** — aprenda fazendo. Se já sabe jogar, vá para
> [How-to](../how-to/hospedar-partida-wifi.md).

> A partida começa **sem Centro da Vila**: você chega com uma carroça de
> fundação, 2 aldeões e 1 soldado, e escolhe onde fundar a capital
> ([contrato da alpha](../explanation/contrato-alpha.md), card
> [#98](https://github.com/martinsmiguel/terrinha/issues/98)).

## 1. Suba o jogo

```bash
npm install
npm run dev
```

Abra <http://localhost:3000>.

> **Dica:** na primeira partida o jogo abre um tutorial de 2 minutos
> (seleção, movimento, coleta, construção e combate). Ele pode ser pulado e
> revisto depois pelo botão **Controles** → **Abrir Tutorial**.

## 2. Escolha o modo

- **Treino Solo** — partida contra a IA, direto no ar.
- **Criar Partida** — você vira host na rede local.
- **Entrar via Código** — entra na partida de alguém na mesma rede.

## 3. Fundamentos (sobreviver os primeiros 2 minutos)

1. **Funde a capital:** clique na carroça, escolha um dos sítios do painel
   (ele mostra espaço, terreno, acesso e kit) e confirme em **Fundar aqui**.
   A fundação leva 20 s e usa o kit reservado de 400 madeira e 200 pedra;
   cancelar não gasta nada. Sem a carroça e sem a capital você é eliminado.
   Depois, selecione unidades clicando nelas (ou arraste um retângulo para
   seleção múltipla).
2. **Ordene aldeões** com botão direito em árvores, arbustos ou jazidas de
   ouro — eles coletam sozinhos dentro do raio da zona de trabalho.
3. **Construa uma Casa** (com aldeão selecionado, tecla `Q`) para aumentar o
   limite populacional (+5).
4. **Treine aldeões** no Centro da Vila (tecla `V`) — mais mão de obra, mais
   recursos.
5. **Construa um Quartel** (tecla `W`) e **treine soldados** nele (tecla `S`);
   cavalaria sai com a tecla `G`.
6. **Ataque** selecionando soldados e clicando com o botão direito em
   inimigos — elimine a capital inimiga (ou a carroça, antes de fundar) para vencer.

## 4. Navegue

- **WASD / setas / borda da tela** — mover a câmera
- **Scroll do mouse** — zoom
- **Minimapa** (canto inferior esquerdo) — clique para saltar a câmera;
  arraste para pan; ele mostra névoa de guerra e a visão das suas unidades
- **Espaço** — centralizar na base (capital ou, antes de fundar, a carroça)

## 5. Progressão (depois dos primeiros minutos)

1. Abra o painel **Tecnologias** (botão na barra do HUD) para pesquisar
   melhorias de coleta e de dano — a fila guarda até 3 itens.
2. Selecione um edifício danificado e use os botões **Reparar** e **Demolir**
   (demolição devolve 50% do custo; a TC não pode ser demolida).
3. Avance de era quando puder pagar: a Era do Comércio abre novas
   tecnologias.

## Próximos passos

- [Como hospedar uma partida na Wi-Fi](../how-to/hospedar-partida-wifi.md)
- [Referência de comandos de teclado](../reference/comandos-teclado.md)
- [Referência de eras e tecnologias](../reference/tecnologias-eras.md)
