# How-to: hospedar uma partida na Wi-Fi

> Quadrante **How-to** — resolva um problema: "meus amigos querem jogar aqui em casa".

## 1. Suba o servidor

```bash
npm run dev
```

## 2. Descubra o IP da máquina host

O jogo mostra o IP automaticamente no lobby, ou consulte:

```bash
curl http://localhost:3000/api/lan-info
# {"port":3000,"localIps":["192.168.1.50"]}
```

## 3. Compartilhe

- **Mesma rede:** seus amigos abrem `http://<ip-do-host>:3000` no navegador.
- Host clica em **Criar Partida**; os demais digitam o mesmo **ID da sala**
  e clicam em **Entrar**.

## 4. Firewall

Se ninguém conectar, libere a porta 3000 TCP no firewall da máquina host.

## Solução de problemas

| Sintoma | Causa provável |
| --- | --- |
| Página não abre | porta 3000 bloqueada ou IP errado |
| Entram mas não sincroniza | host fechou o navegador (o host é autoritativo) |
| Jogador sem resposta | recarregue a página; ele reentra na sala |
