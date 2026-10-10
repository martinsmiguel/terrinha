import { BOT_PROFILE_LABEL, DEFAULT_BOT_PROFILE, type BotProfile } from '../game/bots';
import { WORLD_SIZE_OPTIONS } from '../game/worldConfig';
import type { Dispatch, SetStateAction } from 'react';
import { Check, Copy, Play, Shield, Sparkles, Users, Wifi } from 'lucide-react';
import { FACTION_COLORS } from '../game/factions';
import { soundManager } from '../game/audio';
import type { PlayerSlot } from '../game/networkCommands';

type GameRole = 'host' | 'client' | 'single';

interface LobbyScreenProps {
  lanIps: string[];
  copiedIp: boolean;
  copyLanUrl(): void;
  playerName: string;
  setPlayerName: Dispatch<SetStateAction<string>>;
  roomId: string;
  setRoomId: Dispatch<SetStateAction<string>>;
  playerSlot: PlayerSlot;
  setPlayerSlot: Dispatch<SetStateAction<PlayerSlot>>;
  lobbyError: string | null;
  matchSize: 2 | 3 | 4;
  setMatchSize: Dispatch<SetStateAction<2 | 3 | 4>>;
  botProfile: BotProfile;
  setBotProfile: Dispatch<SetStateAction<BotProfile>>;
  /** Dimensão do mundo escolhida pelo host (ou no treino solo). */
  worldSize: number;
  setWorldSize: Dispatch<SetStateAction<number>>;
  onStartGame(role: GameRole): void;
}

export function LobbyScreen({
  lanIps, copiedIp, copyLanUrl, playerName, setPlayerName, roomId, setRoomId,
  playerSlot, setPlayerSlot, lobbyError, matchSize, setMatchSize, botProfile, setBotProfile, worldSize, setWorldSize, onStartGame,
}: LobbyScreenProps) {
  return (

      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/40 flex items-center justify-center p-4 text-slate-100 selection:bg-amber-500 selection:text-slate-950">
        <div className="max-w-xl w-full bg-slate-900/90 backdrop-blur-xl border border-amber-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          {/* Brand Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-1 shadow-inner">
              <Shield className="w-9 h-9" />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white flex items-center justify-center gap-2">
              Crônicas da Vila <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">AoE3 Web</span>
            </h1>
            <p className="text-sm text-slate-400">
              Jogo de Estratégia em Tempo Real com Construção de Bases e Multiplayer 100% Offline via Wi-Fi/LAN
            </p>
          </div>

          {/* LAN Connection Banner */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Wifi className="w-4 h-4" /> Servidor Local (Docker / Localhost)
              </span>
              <span className="text-slate-400 font-mono">Porta: 3000</span>
            </div>

            <div className="flex items-center gap-2 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 text-xs font-mono">
              <span className="text-slate-400">IP na Rede Local:</span>
              <span className="text-amber-300 font-bold flex-1 truncate">
                http://{lanIps[0] || 'localhost'}:3000
              </span>
              <button
                type="button"
                onClick={copyLanUrl}
                className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg flex items-center gap-1 transition-colors text-[11px] font-sans font-medium"
              >
                {copiedIp ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedIp ? 'Copiado!' : 'Copiar Link'}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              <strong>Dica Multiplayer:</strong> Qualquer pessoa conectada no mesmo Wi-Fi pode abrir este link no navegador do celular ou PC para entrar na sua partida sem precisar de internet!
            </p>
          </div>

          {/* Player Configurations */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Seu Nome / Título</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Código da Sala (LAN)</label>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Escolha sua Civilização & Cor</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(FACTION_COLORS) as [string, typeof FACTION_COLORS['player1']][]).map(([slot, info]) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setPlayerSlot(slot as PlayerSlot)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all text-left ${
                      playerSlot === slot
                        ? `${info.border} bg-slate-800 ring-2 ring-amber-500/40 text-white`
                        : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full ${info.colorClass}`} />
                    <span className="truncate">{info.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {lobbyError && (
            <p role="alert" className="rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {lobbyError}
            </p>
          )}

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onStartGame('host')}
                className="py-3.5 px-4 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98]"
              >
                <Play className="w-4 h-4 fill-current" /> Criar Partida (Host LAN)
              </button>

              <button
                type="button"
                onClick={() => onStartGame('client')}
                className="py-3.5 px-4 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <Users className="w-4 h-4" /> Entrar via Código
              </button>
            </div>

            <div className="pt-1">
              <span className="block text-xs font-medium text-slate-400 mb-1.5">
                Treino Solo: jogadores na partida (você + IA)
              </span>
              <div className="grid grid-cols-3 gap-2">
                {([2, 3, 4] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      setMatchSize(size);
                      soundManager.playClickSound();
                    }}
                    className={`py-2 rounded-xl border text-xs font-semibold transition-all ${
                      matchSize === size
                        ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 ring-1 ring-amber-500/30'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {size} jogadores
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {matchSize === 2
                  ? 'Você contra uma colônia rival.'
                  : `${matchSize - 1} colônias rivais controladas pela IA.`}
              </p>
            </div>

            <div className="pt-1">
              <span id="bot-profile-label" className="block text-xs font-medium text-slate-400 mb-1.5">Comportamento da IA (treino solo)</span>
              <div role="group" aria-labelledby="bot-profile-label" className="grid grid-cols-3 gap-2">
                {(['peaceful', 'defensive', 'raids'] as const).map((profile) => (
                  <button
                    key={profile}
                    type="button"
                    aria-pressed={botProfile === profile}
                    onClick={() => { setBotProfile(profile); soundManager.playClickSound(); }}
                    className={`py-2 rounded-xl border text-xs font-semibold transition-all ${
                      botProfile === profile
                        ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 ring-1 ring-amber-500/30'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {BOT_PROFILE_LABEL[profile]}{profile === DEFAULT_BOT_PROFILE ? ' (padrão)' : ''}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {botProfile === 'peaceful' ? 'A IA nunca inicia agressão.' : botProfile === 'defensive' ? 'A IA reage a quem chega perto e solta a perseguição.' : 'A IA tenta incursões depois de 300 s, só contra alvos já descobertos.'}
              </p>
            </div>

            <div className="pt-1">
              <span id="world-size-label" className="block text-xs font-medium text-slate-400 mb-1.5">
                Tamanho do mundo (vale para você como host ou no treino solo)
              </span>
              <div role="group" aria-labelledby="world-size-label" className="grid grid-cols-3 gap-2">
                {WORLD_SIZE_OPTIONS.map((option) => (
                  <button
                    key={option.size}
                    type="button"
                    aria-pressed={worldSize === option.size}
                    onClick={() => {
                      setWorldSize(option.size);
                      soundManager.playClickSound();
                    }}
                    className={`py-2 rounded-xl border text-xs font-semibold transition-all ${
                      worldSize === option.size
                        ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 ring-1 ring-amber-500/30'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {WORLD_SIZE_OPTIONS.find((option) => option.size === worldSize)?.note}
                {WORLD_SIZE_OPTIONS.find((option) => option.size === worldSize)?.status === 'experimental' ? ' Tamanho experimental: o desempenho não é garantido.' : ''}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onStartGame('single')}
              className="w-full py-2.5 px-4 rounded-xl font-medium bg-slate-900/60 hover:bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-800/80 flex items-center justify-center gap-2 text-xs transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Jogar Treino Solo Offline (Contra IA)
            </button>
          </div>
        </div>
      </div>

  );
}
