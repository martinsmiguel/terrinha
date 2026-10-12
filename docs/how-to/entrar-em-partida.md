# How-to: entrar em uma partida

> Quadrante **How-to**.

1. Peça ao host o **link de convite** (no jogo dele: **Menu › Convidar**). Ele tem a forma
   `http://<ip-do-host>:3000/?sala=<código>`.
2. Abra o link no navegador, na mesma Wi-Fi: o menu já abre em **Multiplayer na rede** com a sala preenchida.
   Sem link, abra `http://<ip-do-host>:3000`, vá em **Multiplayer na rede** e digite o código da sala.
3. Escolha seu nome e uma civilização livre e clique em **Entrar na sala**.
4. Aguarde o host iniciar — o estado do jogo chega sincronizado.

O cliente não roda simulação: ele renderiza o estado autoritativo do host e
envia comandos (mover, coletar, construir, treinar) de volta via Socket.io.

> Limitação atual: se o host desconectar, a partida termina. Ver
> [arquitetura-geral](../explanation/arquitetura-geral.md).
