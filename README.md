# Terrinha

RTS de navegador **100% open source** para jogar com os seus amigos na sua
rede local — inspirado em *Age of Empires*. Sem internet, sem downloads: seu
navegador é o jogo.

- **Multiplayer LAN** — um hospeda, os outros entram pelo IP da máquina
- **Mapa procedural** — ilha, rio, praias e recursos gerados por seed
- **Economia + construção + combate** — aldeões, recursos, 8 edifícios, filas
  de treino, torres autônomas, névoa de guerra no minimapa
- **100% procedural** — sem assets externos: modelos em geometria Three.js e
  áudio sintetizado via WebAudio
- **Licença MIT**

## Rodando

```bash
npm install
npm run dev        # http://localhost:3000
```

Multiplayer: seus amigos abrem `http://<seu-ip>:3000` — use o botão
**Criar Partida** / **Entrar via Código**. Detalhes em
[docs/how-to/hospedar-partida-wifi.md](docs/how-to/hospedar-partida-wifi.md).

## Documentação

Documentada com [Diátaxis](https://diataxis.fr/) — veja
[docs/README.md](docs/README.md):

| | |
| --- | --- |
| Aprender | [docs/tutorials/](docs/tutorials/) |
| Resolver | [docs/how-to/](docs/how-to/) |
| Dados técnicos | [docs/reference/](docs/reference/) |
| Entender | [docs/explanation/](docs/explanation/) |

## Processo

- **Quadro de atividades:** https://github.com/users/martinsmiguel/projects/1
  — cada card é uma issue; cada commit é uma parte descritível de um card.
- **Versionamento:** [SemVer 2.0.0](https://semver.org/) — veja [CHANGELOG.md](CHANGELOG.md)
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/pt-br/)
- **Contribuindo:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **Especificação do produto:** [docs/explanation/especificacao-v2.html](docs/explanation/especificacao-v2.html)

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento (porta 3000) |
| `npm run lint` | typecheck (`tsc --noEmit`) |
| `npm run build` | build de produção em `dist/` |
| `npm start` | roda o build de produção |
