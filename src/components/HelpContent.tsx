/**
 * Ajuda do jogo (#200): o mesmo conteúdo no menu principal e no menu de pausa. Só descreve o que o jogo faz hoje.
 */

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-1.5 rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
    <h3 className="text-sm font-bold text-amber-300">{title}</h3>
    <ul className="space-y-1 text-xs leading-relaxed text-slate-300">{children}</ul>
  </section>
);

const Key = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-100">{children}</kbd>
);

export function HelpContent() {
  return (
    <div className="space-y-3">
      <Section title="Primeiros passos">
        <li>1. <strong>Funde a capital:</strong> leve a carroça aonde quiser e funde o Centro da Vila no painel da carroça. Sem carroça e sem capital você é eliminado.</li>
        <li>2. <strong>Economia:</strong> treine aldeões no Centro e mande-os coletar madeira, comida, ouro e pedra; construa casas para ter mais população.</li>
        <li>3. <strong>Progresso:</strong> ofícios sobem trabalhando ou estudando (<Key>Alt</Key>+<Key>T</Key>); eras e tecnologias ficam no botão Tecnologias.</li>
        <li>4. <strong>Vitória:</strong> o último império com capital (ou carroça) de pé vence.</li>
      </Section>

      <Section title="Mouse e teclado">
        <li><strong>Clique</strong> seleciona; <strong>arrastar</strong> seleciona em grupo; <strong>clique direito</strong> dá a ordem (andar, coletar, atacar, construir).</li>
        <li><Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key> ou setas movem a câmera; <Key>Espaço</Key> centraliza na base; <Key>L</Key> trava a rolagem pelas bordas.</li>
        <li><Key>Esc</Key> cancela a seleção ou a construção; sem nada para cancelar, abre o <strong>menu</strong>.</li>
        <li><Key>H</Key> esconde o HUD, <Key>C</Key> deixa compacto, <Key>J</Key> abre o painel, <Key>M</Key> o minimapa.</li>
        <li><Key>Ctrl</Key>/<Key>⌘</Key>+<Key>K</Key> busca ações; <Key>Alt</Key>+<Key>T</Key> talentos e ofícios; <Key>Alt</Key>+<Key>R</Key> regras da sessão.</li>
        <li>Com um aldeão selecionado, as letras do menu de construção (Q, W, E…) escolhem o edifício.</li>
      </Section>

      <Section title="Toque (celular e tablet)">
        <li><strong>Tocar</strong> seleciona unidades, edifícios e recursos e aperta os botões.</li>
        <li><strong>Arrastar com um dedo</strong> move a câmera; <strong>pinçar com dois dedos</strong> aproxima ou afasta.</li>
        <li>Construir, fundar a capital e decorar usam a prévia: toque no chão e confirme no painel.</li>
        <li>Ordens por toque (andar e atacar) ainda dependem do toque longo do navegador; controles por toque completos estão a caminho.</li>
      </Section>

      <Section title="Jogar com amigos na mesma rede">
        <li>Quem cria a partida abre <strong>Multiplayer › Criar partida</strong> e envia o <strong>link de convite</strong> (no menu do jogo: Convidar).</li>
        <li>Quem recebe abre o link no navegador, na mesma Wi-Fi, e entra direto na sala.</li>
        <li>Hoje a partida vive no navegador de quem criou: se essa pessoa sair ou fechar a aba, a partida acaba para todos.</li>
      </Section>
    </div>
  );
}
