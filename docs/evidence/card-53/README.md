# Card #53 — ganho da compressão e latência em quatro jogadores

Teste: `tests/perf/netCompression.test.ts` (relay Socket.IO real em loopback, 4 conexões: 1 host + 3 convidados, snapshot por convidado a 20 Hz por 80 ticks,
300 unidades + 200 recursos, 5% das unidades se movendo). Relatório bruto: `compressao.json`. Mesmo cenário com compressão (permessage-deflate, limiar 1024 B) desligada e ligada,
para quadro completo e para delta sequenciado (#76).

| Modo | Compressão | Bytes/pacote | Bytes totais aos convidados | CPU do processo (ms) | Latência p50 / p95 (ms) |
| --- | --- | --- | --- | --- | --- |
| Quadro completo | desligada | 73 768 | 17,7 MB | 557 | 5,2 / 9,3 |
| Quadro completo | ligada | 5 987 | 1,44 MB | 984 | 6,2 / 11,0 |
| Delta | desligada | 4 373 | 1,05 MB | 239 | 1,3 / 3,4 |
| Delta | ligada | 185 | 44 KB | 314 | 1,8 / 3,0 |

- Economia de bytes com compressão: **91,9%** (completo) e **95,8%** (delta). Delta sozinho já reduz 94% contra o quadro completo sem compressão.
- Custo: a compressão aumenta a CPU do processo (~1,8× no completo, ~1,3× no delta) e soma ~1 ms de latência; nada perto do orçamento.
- **Limiar de aceite definido:** manter a compressão se economizar ≥ 25% dos bytes com p95 abaixo de 400 ms. Resultado: aceita em ambos os modos.
- Integridade e ordem: o teste exige que todos os 240 pacotes cheguem e sejam aplicados (o receptor de delta recusa buracos e duplicados).

## Limitações explícitas

- Tudo em **loopback na mesma máquina**: não houve quatro dispositivos distintos nem LAN/Wi-Fi real. Isso NÃO prova usabilidade percebida; a medição em LAN fica para o gate do #89.
- `bytesWritten` do soquete inclui o handshake; a proporção entre configurações vale, o valor absoluto tem pequena margem.
- A CPU é do processo de teste inteiro (servidor e clientes), não só do host.

## Complemento

Links Wi-Fi simulados (banda limitada e atraso), onde a compressão também reduz a latência: [wifi-simulado.md](wifi-simulado.md).
