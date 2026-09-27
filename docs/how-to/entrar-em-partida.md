# How-to: entrar em uma partida

> Quadrante **How-to**.

1. Peça o **IP do host** e o **ID da sala**.
2. Abra `http://<ip-do-host>:3000` no navegador.
3. Digite seu nome, o ID da sala e clique em **Entrar**.
4. Aguarde o host iniciar — o estado do jogo chega sincronizado.

O cliente não roda simulação: ele renderiza o estado autoritativo do host e
envia comandos (mover, coletar, construir, treinar) de volta via Socket.io.

> Limitação atual: se o host desconectar, a partida termina. Ver
> [arquitetura-geral](../explanation/arquitetura-geral.md).
