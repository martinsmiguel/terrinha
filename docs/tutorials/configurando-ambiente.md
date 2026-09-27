# Tutorial: configurando o ambiente de desenvolvimento

> Quadrante **Tutorial** — do zero ao primeiro commit.

## Pré-requisitos

- Node.js 20+ (`node -v`)
- Git
- (Opcional) CLI do GitHub `gh` para trabalhar com o quadro de atividades

## 1. Instale e rode

```bash
npm install
npm run dev
```

Servidor sobe em <http://localhost:3000> (Express + Vite em modo middleware).

## 2. Comandos úteis

| Comando | O que faz |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento |
| `npm run lint` | typecheck (`tsc --noEmit`) |
| `npm run build` | build de produção em `dist/` |
| `npm start` | roda o build de produção |

## 3. Primeiro card

1. Abra o [quadro de atividades](https://github.com/users/miguelrjmartins9/projects/1)
   e escolha um card em Ready.
2. Crie um branch: `git checkout -b feat/<escopo>-<issue>`.
3. Trabalhe, commite com Conventional Commits citando `#<issue>`.
4. Abra o PR — a CI roda `npm run lint`.

Detalhes do fluxo: [Como seguir o fluxo de desenvolvimento](../how-to/fluxo-de-desenvolvimento.md).
