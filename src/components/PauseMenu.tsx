import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Check, Copy, Keyboard, LogOut, Play, Settings, Share2, Users } from 'lucide-react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { HelpContent } from './HelpContent';

export interface PauseMenuPlayer {
  slot: string;
  name: string;
  /** Cor da facção (classe Tailwind de fundo). */
  colorClass: string;
  you: boolean;
  /** 'humano' na LAN; 'IA' no treino solo. */
  kind: 'humano' | 'IA';
}

interface PauseMenuProps {
  /** Partida em rede: mostra Convidar. */
  multiplayer: boolean;
  /** Link de convite que abre direto na sala (`?sala=`), ou `null` quando não há endereço alcançável. */
  inviteUrl: string | null;
  roomId: string;
  players: PauseMenuPlayer[];
  onResume(): void;
  onOpenControls(): void;
  onOpenSettings?(): void;
  onExit(): void;
}

type View = 'menu' | 'ajuda';

/**
 * Menu do jogo (#200): abre por Esc (sem nada a cancelar) ou pelo botão Menu do HUD. A partida continua rodando por
 * trás (no multiplayer o mundo é de todos); sair pede confirmação.
 */
export function PauseMenu({ multiplayer, inviteUrl, roomId, players, onResume, onOpenControls, onOpenSettings, onExit }: PauseMenuProps) {
  const ref = useDialogFocus<HTMLDivElement>();
  const [view, setView] = useState<View>('menu');
  // Trocar de tela desmonta o botão focado: o foco volta ao diálogo para Esc e Tab seguirem dentro dele.
  useEffect(() => { ref.current?.focus(); }, [view, ref]);
  const [copied, setCopied] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const button = 'flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors';

  const copy = async () => {
    if (!inviteUrl) return;
    try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* sem permissão: o link segue visível */ }
  };
  const share = async () => {
    if (!inviteUrl || !canShare) return;
    try { await navigator.share({ title: 'Crônicas da Vila', text: `Entre na sala ${roomId}`, url: inviteUrl }); } catch { /* cancelado */ }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) onResume(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Menu do jogo"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          if (view === 'ajuda') setView('menu'); else onResume();
        }}
        className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/95 text-slate-200 shadow-2xl outline-none">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-base font-bold text-amber-300">{view === 'ajuda' ? 'Ajuda' : 'Menu do jogo'}</h2>
          <span className="text-[11px] text-slate-400">a partida continua · Esc volta</span>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {view === 'ajuda' ? (
            <>
              <button type="button" onClick={() => setView('menu')} className={`${button} bg-slate-800 hover:bg-slate-700`}><ArrowLeft className="h-4 w-4" /> Voltar ao menu</button>
              <HelpContent />
            </>
          ) : (
            <>
              <button type="button" onClick={onResume} className={`${button} bg-amber-500 text-slate-950 hover:bg-amber-400`}><Play className="h-4 w-4 fill-current" /> Voltar ao jogo</button>

              {multiplayer && (
                <section aria-labelledby="invite-title" className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                  <h3 id="invite-title" className="text-sm font-bold text-slate-100">Convidar para a sala <span className="font-mono text-amber-300">{roomId}</span></h3>
                  {inviteUrl ? (
                    <>
                      <p className="break-all rounded-lg bg-slate-900 px-2 py-1.5 font-mono text-xs text-amber-200" data-testid="invite-url">{inviteUrl}</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={copy} className={`${button} bg-slate-800 hover:bg-slate-700`}>{copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}{copied ? 'Copiado!' : 'Copiar link'}</button>
                        {canShare && <button type="button" onClick={share} className={`${button} bg-slate-800 hover:bg-slate-700`}><Share2 className="h-4 w-4" /> Compartilhar</button>}
                      </div>
                      <p className="text-[11px] text-slate-400">Quem abrir o link na mesma Wi-Fi cai direto nesta sala.</p>
                    </>
                  ) : (
                    <p className="text-xs text-amber-200/90">IP desta máquina não detectado: no outro aparelho, abra http://IP-desta-máquina:3000 e entre na sala {roomId}.</p>
                  )}
                </section>
              )}

              <section aria-labelledby="players-title" className="space-y-1.5 rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                <h3 id="players-title" className="flex items-center gap-1.5 text-sm font-bold text-slate-100"><Users className="h-4 w-4" /> Jogadores ({players.length})</h3>
                <ul className="space-y-1" data-testid="pause-players">
                  {players.map((player) => (
                    <li key={player.slot} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${player.colorClass}`} aria-hidden="true" />{player.name}{player.you ? ' (você)' : ''}</span>
                      <span className="text-slate-400">{player.kind}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {onOpenSettings && <button type="button" onClick={onOpenSettings} className={`${button} bg-slate-800 hover:bg-slate-700`}><Settings className="h-4 w-4" /> Configurações</button>}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setView('ajuda')} className={`${button} bg-slate-800 hover:bg-slate-700`}><BookOpen className="h-4 w-4" /> Ajuda</button>
                <button type="button" onClick={onOpenControls} className={`${button} bg-slate-800 hover:bg-slate-700`}><Keyboard className="h-4 w-4" /> Controles</button>
              </div>

              {confirmExit ? (
                <div role="alert" className="space-y-2 rounded-2xl border border-red-500/40 bg-red-950/40 p-3 text-xs">
                  <p>{multiplayer ? 'Sair desconecta você da sala.' : 'Sair encerra esta partida de treino.'} Continuar?</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={onExit} className={`${button} bg-red-700 text-white hover:bg-red-600`}><LogOut className="h-4 w-4" /> Sair</button>
                    <button type="button" onClick={() => setConfirmExit(false)} className={`${button} bg-slate-800 hover:bg-slate-700`}>Ficar</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmExit(true)} className={`${button} border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800`}><LogOut className="h-4 w-4" /> Sair para o menu principal</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
