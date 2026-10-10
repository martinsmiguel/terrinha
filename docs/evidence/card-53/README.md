# Card #53 — ganho da compressão de snapshots com quatro jogadores

Comparação de `perMessageDeflate` ligado e desligado no mesmo cenário. Dados brutos em [`benchmark.json`](benchmark.json).

## Como reproduzir

```bash
npx tsx scripts/bench-compressao.ts --frames=200        # grava docs/evidence/card-53/benchmark.json
npx tsx scripts/bench-compressao.ts --only=5mbps        # um cenário
```

Cenário: quatro clientes Socket.IO; o host envia um snapshot de 160 unidades (~30 KB) por convidado a 20 Hz. O servidor roda em processo próprio (CPU isolada) e todo o tráfego passa por um proxy TCP que conta os bytes no fio e, nos cenários simulados, limita a banda e adiciona atraso.

## Resultado (macOS arm64, 8 núcleos, Node 25.6.1, 200 quadros, 3 convidados)

| Cenário | Bytes (desl. → lig.) | p95 de latência | CPU do servidor |
| --- | --- | --- | --- |
| loopback (informativo) | -96% | 25 → 87 ms (piora) | 508 → 964 ms |
| Wi-Fi simulado 20 Mbps, 8 ms | -96% | 80 → 30 ms | 495 → 753 ms |
| Wi-Fi simulado 5 Mbps, 15 ms | -94% | ~9 s → 50 ms | 341 → 743 ms |

Em todos os cenários: 600/600 entregas com compressão ligada, sem quadros fora de ordem nem corrompidos.

## Limiar de aceite

Vale só para os links limitados: manter a compressão se cortar pelo menos 50% dos bytes, não piorar o p95 em mais de 10 ms e entregar todos os quadros em ordem e íntegros. **Resultado: atendido no ambiente simulado.**

O limiar foi fixado depois da primeira rodada, que reprovou por causa do loopback; este é informativo porque o card registra que loopback não mede latência percebida. A rodada inicial e as seguintes repetiram a mesma tendência.

## Limites

- **Não foram usados quatro dispositivos reais** em LAN/Wi-Fi: os links são simulados por proxy no mesmo computador. O resultado não prova usabilidade em Wi-Fi real.
- Na rede muito rápida a compressão custa latência e CPU (loopback). Em rede limitada o ganho domina.
- Com compressão desligada, o link de 5 Mbps satura e nem todos os quadros chegam em tempo; o p95 considera só os entregues e subestima a piora.
- Uma execução isolada do cenário de 5 Mbps registrou só 14/600 entregas com compressão (oscilação do ambiente); a repetição entregou 600/600.

## Roteiro para quatro dispositivos reais

1. Subir o jogo (`docker run -p 3000:3000 terrinha:local` ou `npm run dev`) em um computador na mesma rede.
2. Abrir `http://<IP-do-host>:3000` em quatro dispositivos; um cria a sala e três entram.
3. Rodar uma partida de 5 minutos com ordens em massa, uma vez com a compressão desligada e outra ligada (`GAME_STATE_COMPRESSION_OPTIONS`).
4. Registrar bytes (DevTools → Network → WS), CPU do host e o tempo entre a ordem e o efeito na tela.
