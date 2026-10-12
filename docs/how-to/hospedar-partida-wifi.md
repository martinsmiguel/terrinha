# How-to: hospedar uma partida na Wi-Fi

> Quadrante **How-to** — resolva um problema: "meus amigos querem jogar aqui em casa".

## 1. Suba o servidor

Direto na máquina:

```bash
npm run dev
```

Ou no Docker, informando o IP desta máquina na rede (o container só enxerga o próprio IP interno, como `172.17.0.2`, que não existe na sua rede):

```bash
LAN_HOST=$(scripts/lan-ip.sh) docker compose up -d --build
```


## 2. Descubra o endereço

O lobby mostra o **Link na Rede Local** quando sabe o IP: com o servidor fora do Docker, com `LAN_HOST` ou quando a página foi aberta pelo IP da rede. Sem isso, ele avisa "IP desta máquina não detectado" e explica onde achar o IP (Ajustes do Sistema › Wi-Fi › Detalhes); nunca mostra um link que só funciona no próprio aparelho (`127.0.0.1`, `localhost`) ou dentro do Docker.

```bash
curl http://localhost:3000/api/lan-info
# {"port":3000,"localIps":["192.168.1.50"]}   (no Docker sem LAN_HOST: [])
```

## 3. Compartilhe

- **Mesma rede:** seus amigos abrem `http://<ip-do-host>:3000` no navegador.
- Host clica em **Criar Partida**; os demais digitam o mesmo **ID da sala**
  e clicam em **Entrar**.
- Antes de iniciar, o host escolhe quantos jogadores entram na partida
  (**Treino Solo: jogadores na partida** ou o seletor do lobby): 2, 3 ou 4
  slots — cada um nasce com a própria base.

## 4. Firewall

Se ninguém conectar, libere a porta 3000 TCP no firewall da máquina host.

## Solução de problemas

| Sintoma | Causa provável |
| --- | --- |
| Página não abre | porta 3000 bloqueada, IP errado (`127.0.0.1` e `172.17.x` não servem para outro aparelho) ou aparelhos em redes diferentes (rede de convidados isola os aparelhos) |
| Entram mas não sincroniza | host fechou o navegador (o host é autoritativo) |
| Jogador sem resposta | recarregue a página; ele reentra na sala |
