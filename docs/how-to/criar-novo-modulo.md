# How-to: criar um novo módulo (plugin) do jogo

> Quadrante **How-to** — "quero adicionar um sistema novo ao Terrinha".

O código está em transição para a arquitetura modular da
[especificação](../explanation/especificacao-v2.html) (Plugin Host + Event Bus).
Enquanto isso, novos sistemas seguem o padrão:

## 1. Escolha o escopo

- **Lógica de simulação** → `src/game/<modulo>.ts` (puro, sem Three.js/DOM,
  testável com Vitest).
- **Renderização 3D** → `src/game/` com geometria procedimental (padrão do repo).
- **UI** → `src/components/<Modulo>.tsx` (React + Tailwind).

## 2. Contrato do módulo

Todo módulo de simulação declara:

```ts
// entrada: estado imutável + inputs
// saída: mutações localizadas no GameState (ou novo estado)
export function tick(state: GameState, dt: number): void {}
```

- **Não** importe React nem Three.js em módulos de simulação.
- **Não** acesse Socket.io dentro do módulo — comandos entram pelo host.

## 3. Conecte ao loop

1. Registre o tick no `useEffect` de simulação de `App.tsx` (20 Hz, host/single).
2. Exponha comandos novos em `handleIncomingCommand` para clientes remotos.

## 4. Documente

- Referência em `docs/reference/<modulo>.md` (dados exatos).
- Explicação do porquê em `docs/explanation/` se for decisão arquitetural → ADR.
- Card no quadro com critério de aceite testável.

## 5. Teste

```bash
npm run lint   # typecheck
npm test       # suíte Vitest em tests/unit/
```

Todo módulo de simulação novo entra com pelo menos um teste em
`tests/unit/<modulo>.test.ts` — a suíte já cobre economia, vitória, movimento,
névoa, tecnologias e validação de comandos.
