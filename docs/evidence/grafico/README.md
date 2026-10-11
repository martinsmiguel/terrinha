# Camadas gráficas: custo medido sobre o terreno do jogo

Protótipo de medição em [`poc-grafico.html`](../../../poc-grafico.html) (somente desenvolvimento: não entra no build de produção). Instancia o `GameEngine` real com o terreno do mundo 280 (semente 4242), 730 malhas de objetos (a contagem de recursos reais mais 25 edifícios e 120 unidades, por primitivas) e liga cada camada para medir o tempo de quadro. Dados brutos em [`medicao.json`](medicao.json).

## Ambiente e método

- GPU **Apple M1** (WebGL 2 via Metal), Chromium 152 no painel do app, canvas 1920×1080, `pixelRatio` 1. **Uma máquina só.**
- Quadro = render + `readPixels` de 1 pixel (força a GPU a terminar), sem teto de vsync; 12 quadros de aquecimento, 3 rodadas de 60 quadros, mediana das medianas.
- Duas vistas: **perto** (câmera de jogo na capital) e **longe** (zoom 120, mapa inteiro). Os números abaixo são da vista perto; a vista longe tem o mesmo padrão, com +2 a +3 ms na base.
- Reproduzir: `npx vite --port 5173`, abrir `/poc-grafico.html`, "Medir tudo" (~3 min). `window.__runExtra()` roda o orçamento recomendado.

## Custo por camada (1080p, vista perto)

Referência: **o jogo hoje = 4,8 ms (208 q/s), 690 chamadas de desenho.**

| Camada | Tempo | Custo adicional |
| --- | --- | --- |
| Sombra do sol (já existe) | | 1,7 ms |
| Objetos como o jogo faz (um `Mesh` por parte) | | 1,5 ms (690 chamadas) |
| **Luz e cor** (tone mapping, céu, luz quente, névoa, sombra 2048) | 5,3 ms | **+0,5 ms** |
| Objetos **instanciados** (mesmos objetos) | 4,1 ms | **−0,7 ms** (690 → 31 chamadas) |
| Composer vazio (alvo HDR + MSAA 4x + saída) | 9,6 ms | **+4,8 ms** só por existir |
| SMAA no lugar do MSAA | 8,4 ms | +3,6 ms |
| + Bloom | 15,9 ms | +6,3 ms sobre o composer vazio |
| + Oclusão ambiente (GTAO) | 29,1 ms | **+19,5 ms** |
| + Cor graduada e vinheta | 13,1 ms | +3,5 ms |
| + Tilt-shift (2 passes) | 17,2 ms | +7,6 ms |
| **Tudo junto** (luz e cor + bloom + GTAO + cor + tilt-shift) | **44,5 ms (22 q/s)** | |
| Grama instanciada com vento, 20k / 100k / 400k lâminas | 6,4 / 8,3 / 12,9 ms | +1,6 / +3,5 / +8,1 ms |

**Leitura:** luz e cor e instanciar são quase de graça. **O pós-processamento é o que custa**, e o GTAO sozinho custa mais do que todo o resto somado. Existir um composer já custa 4,8 ms.

## Terreno em blocos (estilo voxel)

Geração a partir do mapa de alturas atual (alturas em passos de 0,5, faces de topo e laterais, 35×35 células por bloco de malha). A simulação não muda (já é em grade).

| | Tempo | |
| --- | --- | --- |
| Malha atual (referência) | 4,8 ms | |
| Blocos, cor por vértice | 5,2 ms | +0,4 ms; 175 mil triângulos; construção única de 113–155 ms |
| Blocos com **textura gerada por código** (canvas de 4 tiles de 16 px, `NearestFilter`) | 5,1 ms | custo extra zero em relação à cor por vértice |
| Blocos com textura + luz e cor | 5,3 ms | |

**Textura gerada** é um canvas desenhado por código (ruído de "pixel art"), sem arquivo de imagem. Uma imagem gerada por IA ou desenhada à mão entra pelo mesmo caminho (carregar o PNG e montar o atlas) e custa o mesmo na GPU; o que muda é licença, consistência de estilo e peso do download.

**Limites do visual:** a ilha natal é **plana por projeto** (espaço para construir), então os blocos leem como um tapete verde com costa em degraus, não como Minecraft. O estilo exigiria relevo no gerador de terreno. E o material de blocos **não tem a névoa de guerra** do terreno atual (shader customizado em `applyFogToTerrain`), que precisaria ser portado.

## Orçamento recomendado (sem GTAO e sem MSAA)

Luz e cor + objetos instanciados + 100 mil lâminas de grama + SMAA + cor graduada.

| Config (1080p, vista perto) | Tempo | q/s |
| --- | --- | --- |
| Jogo hoje | 5,4 ms | 185 |
| Luz e cor + instanciado + 100k grama, sem pós | 6,0 ms | 167 |
| **Recomendado** (+ SMAA + cor) | **9,3 ms** | **108** |
| Recomendado + bloom | 12,0 ms | 83 |
| Recomendado com terreno em blocos texturizado | 9,9 ms | 101 |
| Recomendado **+ GTAO** | 22,1 ms | 45 |

## Escala por resolução (vista perto)

| Resolução | Jogo hoje | Recomendado | Alvo completo (GTAO + bloom + tilt-shift) |
| --- | --- | --- | --- |
| 1280×720 | 3,5 ms | 6,1 ms | 24,6 ms |
| 1920×1080 | 5,3 ms | 10,2 ms | 47,3 ms |
| 2560×1440 | 7,5 ms | 15,5 ms | 77,4 ms |

## Conclusões

1. O visual estilizado das referências cabe no orçamento **se** o pós-processamento for enxuto: o pacote recomendado fica em ~10 ms nesta máquina (60 q/s = 16,7 ms por quadro). O pacote completo, com GTAO, não cabe em 60 q/s nem a 720p.
2. O ganho mais barato é luz e cor (+0,5 ms) e instanciar objetos (−0,7 ms e 22× menos chamadas de desenho). Isso vale fazer primeiro.
3. Terreno em blocos é viável em custo de GPU, mas não muda sozinho a cara do jogo (ilha plana) e exige portar a névoa de guerra.

## Limites

- **Uma GPU (M1, integrada de classe alta).** Máquinas mais fracas dos amigos na LAN **não foram medidas**; o tempo de pós-processamento cresce com os pixels, então elas exigiriam preset de qualidade e escala de resolução. Qualquer fator de lentidão aqui seria hipótese.
- Objetos por primitivas, sem modelos reais, sem animação de esqueleto e sem as partículas do jogo.
- Sem unidades em movimento, sem a interface (HUD) sobre o canvas e sem a simulação rodando no mesmo quadro.
- O contador de chamadas das configs com pós-processamento na bateria principal está vazio (o Three zerava a cada passe); a bateria de orçamento usa a contagem corrigida.
