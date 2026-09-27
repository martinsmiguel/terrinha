import type { Dispatch, FormEvent, SetStateAction } from 'react';
import {
  AlertCircle, Check, Compass, Eye, Hammer, Info, Layers, Lock, MessageSquare, Send, Shield, Target, TreePine,
} from 'lucide-react';
import type { ChatMessage } from '../game/multiplayer';
import { soundManager } from '../game/audio';

interface ActiveWorkZone {
  id: string;
  x: number;
  z: number;
  radius: number;
  unitIds: string[];
  resourceType?: 'tree' | 'gold_mine' | 'food_bush' | 'fish_school';
  clusterName?: string;
  unitCount: number;
  treesRemaining: number;
  regrowingCount: number;
  isHighlighted: boolean;
}

interface TacticalNotification {
  message: string;
  type: 'info' | 'success' | 'warning';
  id: number;
}

interface GameDialogsProps {
  isHudVisible: boolean;
  isChatOpen: boolean;
  setIsChatOpen: Dispatch<SetStateAction<boolean>>;
  chatMessages: ChatMessage[];
  currentChatInput: string;
  setCurrentChatInput: Dispatch<SetStateAction<string>>;
  onSendChat(event: FormEvent): void;
  showControlsModal: boolean;
  setShowControlsModal: Dispatch<SetStateAction<boolean>>;
  isWorkZoneModalOpen: boolean;
  setIsWorkZoneModalOpen: Dispatch<SetStateAction<boolean>>;
  gatherRadiusLimit: number;
  setGatherRadiusLimit: Dispatch<SetStateAction<number>>;
  showWorkZones3D: boolean;
  setShowWorkZones3D: Dispatch<SetStateAction<boolean>>;
  isStrictZoneLeash: boolean;
  setIsStrictZoneLeash: Dispatch<SetStateAction<boolean>>;
  onApplyRadiusToAllWorkingVillagers(radius: number): void;
  activeWorkZones: ActiveWorkZone[];
  onFocusZone(x: number, z: number): void;
  onPointerEnterUI(): void;
  onPointerLeaveUI(): void;
  notification: TacticalNotification | null;
}

export function GameDialogs({
  isHudVisible, isChatOpen, setIsChatOpen, chatMessages, currentChatInput, setCurrentChatInput, onSendChat,
  showControlsModal, setShowControlsModal, isWorkZoneModalOpen, setIsWorkZoneModalOpen,
  gatherRadiusLimit, setGatherRadiusLimit, showWorkZones3D, setShowWorkZones3D,
  isStrictZoneLeash, setIsStrictZoneLeash, onApplyRadiusToAllWorkingVillagers, activeWorkZones,
  onFocusZone, onPointerEnterUI, onPointerLeaveUI, notification,
}: GameDialogsProps) {
  return (
    <>
      {/* LAN CHAT MODAL / DRAWER */}
      {isHudVisible && isChatOpen && (
        <div className="absolute top-16 right-4 w-80 bg-slate-950/95 backdrop-blur-xl border border-slate-800 rounded-3xl p-4 shadow-2xl z-50 flex flex-col h-96">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs font-bold text-slate-300">
            <span className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-amber-400" /> Chat da Partida (LAN)
            </span>
            <button
              type="button"
              onClick={() => setIsChatOpen(false)}
              className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded-lg bg-slate-900"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-3 space-y-2 text-xs">
            {chatMessages.length === 0 ? (
              <div className="text-center text-slate-500 py-10">Nenhuma mensagem ainda.</div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div key={idx} className="bg-slate-900/80 p-2 rounded-xl border border-slate-800/80">
                  <span className="font-bold text-amber-400">{msg.sender}: </span>
                  <span className="text-slate-200">{msg.message}</span>
                </div>
              ))
            )}
          </div>

          <form onSubmit={onSendChat} className="flex gap-2 pt-2 border-t border-slate-800">
            <input
              type="text"
              placeholder="Digite sua mensagem..."
              value={currentChatInput}
              onChange={(e) => setCurrentChatInput(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              className="p-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition-colors font-bold"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* TACTICAL CONTROLS & SHORTCUTS GUIDE MODAL */}
      {showControlsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto">
          <div className="bg-slate-900/95 border border-slate-700/80 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-base">
                <Info className="w-5 h-5 text-cyan-400" />
                <span>Guia de Navegação e Controles RTS</span>
              </div>
              <button
                type="button"
                onClick={() => setShowControlsModal(false)}
                className="p-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs px-2.5 py-1 transition-colors"
              >
                ✕ Fechar
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-amber-400" /> Câmera e Exploração do Mapa
                </div>
                <ul className="space-y-1 text-slate-400">
                  <li>• <kbd className="font-mono text-slate-200">L</kbd>: <strong className="text-amber-300">Travar Movimento Automático</strong> (Fixa a câmera para explorar sem rolagem acidental)</li>
                  <li>• <kbd className="font-mono text-slate-200">WASD</kbd> ou <kbd className="font-mono text-slate-200">Setas</kbd>: Mover visão livremente</li>
                  <li>• <strong className="text-slate-200">Bordas da Tela (Edge Scroll)</strong>: Rolagem suave automática ao aproximar o mouse (desativa ao passar sobre botões)</li>
                  <li>• <strong className="text-slate-200">Botão do Meio do Mouse ou Toque (Mobile)</strong>: Arraste para Pan rápido no mapa</li>
                  <li>• <strong className="text-slate-200">Minimapa</strong>: Clique para teleportar a visão (botão no topo para recolher/expandir ou tecla <kbd className="font-mono text-slate-200">M</kbd>)</li>
                  <li>• <kbd className="font-mono text-slate-200">Espaço</kbd>: Centralizar no Centro da Vila ou Pelotão selecionado</li>
                </ul>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-cyan-400" /> Modos de HUD e Responsividade
                </div>
                <ul className="space-y-1 text-slate-400">
                  <li>• <kbd className="font-mono text-slate-200">H</kbd>: <strong className="text-white">Ocultar / Mostrar HUD</strong> (Modo Cinemático com 100% de visão limpa)</li>
                  <li>• <kbd className="font-mono text-slate-200">C</kbd>: <strong className="text-white">Modo Tático Compacto</strong> (Barra ultra-fina para telas menores e máxima área útil)</li>
                  <li>• <strong className="text-slate-200">Modo Espiar (Hover Peek)</strong>: Com o HUD oculto, aproxime o mouse do topo para revelar os recursos temporariamente!</li>
                  <li>• <strong className="text-slate-200">Painel de Seleção Recolhível</strong>: Clique em "Recolher" no card inferior para minimizar a barra de unidades.</li>
                </ul>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-blue-400" /> Formações e Ordens Táticas
                </div>
                <ul className="space-y-1 text-slate-400">
                  <li>• <kbd className="font-mono text-slate-200">1</kbd>: Formação em Caixa (Marcha em bloco compacto)</li>
                  <li>• <kbd className="font-mono text-slate-200">2</kbd>: Formação em Linha (Fileira frontal de batalha, tiro amplo)</li>
                  <li>• <kbd className="font-mono text-slate-200">3</kbd>: Formação Dispersa (Espaçamento aberto evasivo)</li>
                  <li>• <strong className="text-slate-200">Botão Direito</strong>: Ordem de marcha, ataque, coleta ou reparo</li>
                </ul>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <TreePine className="w-4 h-4 text-emerald-400" /> Produção e Manejo de Recursos
                </div>
                <ul className="space-y-1 text-slate-400">
                  <li>• <kbd className="font-mono text-slate-200">Z</kbd>: <strong className="text-emerald-300">Zonas de Trabalho Delimitadas</strong>: Configura o raio limite de extração (8m, 14m, 22m, etc.). Ao enviar aldeões para um recurso, eles fixam o local como centro e nunca saem desmatando o mapa inteiro descontroladamente!</li>
                  <li>• <kbd className="font-mono text-slate-200">V</kbd>: Recrutar Aldeão (Com Centro da Vila selecionado)</li>
                  <li>• <kbd className="font-mono text-slate-200">S</kbd>: Recrutar Mosqueteiro (Com Quartel selecionado)</li>
                  <li>• <strong className="text-slate-200">Fila de Produção de 5 Slots</strong>: Enfileire até 5 unidades; clique no ✕ de qualquer slot para cancelar e reembolsar 100% dos recursos!</li>
                  <li>• <strong className="text-slate-200">Manejo Sustentável vs Desmatamento</strong>: Selecione árvores para escolher entre remoção definitiva ou plantio automático de mudas com renovação contínua.</li>
                  <li>• <strong className="text-slate-200">Encadeamento Contínuo</strong>: Aldeões e mineradores buscam a próxima árvore ou mina próxima dentro da zona ao esgotar o alvo!</li>
                </ul>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Hammer className="w-4 h-4 text-amber-400" /> Construção Dinâmica com Aldeões
                </div>
                <ul className="space-y-1 text-slate-400">
                  <li>• <kbd className="font-mono text-slate-200">Q</kbd>: Casa Colonial (+5 Limite de População)</li>
                  <li>• <kbd className="font-mono text-slate-200">W</kbd>: Quartel Militar (Treinamento de Mosqueteiros)</li>
                  <li>• <kbd className="font-mono text-slate-200">E</kbd>: Torre de Vigia (Guarda defensiva armada)</li>
                  <li>• <strong className="text-slate-200">Canteiro de Obras</strong>: Edifícios começam com andaimes e crescem conforme os aldeões martelam!</li>
                  <li>• <strong className="text-slate-200">Trabalho em Equipe</strong>: Múltiplos aldeões na mesma obra aceleram o tempo!</li>
                </ul>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowControlsModal(false)}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors shadow-lg shadow-amber-500/10"
            >
              Entendido, Continuar Batalha
            </button>
          </div>
        </div>
      )}

      {/* WORK ZONE CONFIGURATOR MODAL */}
      {isWorkZoneModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto">
          <div
            onMouseEnter={() => onPointerEnterUI()}
            onMouseLeave={() => onPointerLeaveUI()}
            className="bg-slate-900/95 border border-emerald-500/40 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 text-slate-200"
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Target className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    Configurador de Zonas de Trabalho
                  </h2>
                  <p className="text-xs text-slate-400">
                    Defina o raio de ação para que os aldeões não saiam desmatando o mapa inteiro.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWorkZoneModalOpen(false)}
                className="p-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs px-2.5 py-1 transition-colors"
              >
                ✕ Fechar
              </button>
            </div>

            {/* Radius Slider & Presets */}
            <div className="space-y-3 bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">Raio Limite da Zona:</span>
                <span className="text-sm font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-lg border border-emerald-500/20">
                  {gatherRadiusLimit >= 999 ? 'Sem Limite (Livre)' : `${gatherRadiusLimit} metros`}
                </span>
              </div>

              <input
                type="range"
                min="4"
                max="40"
                step="2"
                value={Math.min(40, gatherRadiusLimit)}
                onChange={(e) => setGatherRadiusLimit(Number(e.target.value))}
                className="w-full accent-emerald-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
              />

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {[
                  { r: 8, label: '8m', title: 'Bosque Estrito', desc: 'Apenas árvores imediatas' },
                  { r: 14, label: '14m', title: 'Padrão', desc: 'Bosque completo' },
                  { r: 22, label: '22m', title: 'Área Local', desc: 'Bosque e margens' },
                  { r: 35, label: '35m', title: 'Amplo', desc: 'Setor expandido' },
                  { r: 999, label: 'Livre', title: 'Sem Limite', desc: 'Todo o mapa' },
                ].map((preset) => (
                  <button
                    key={preset.r}
                    type="button"
                    onClick={() => {
                      setGatherRadiusLimit(preset.r);
                      soundManager.playClickSound();
                    }}
                    className={`p-2 rounded-xl text-center border transition-all ${
                      gatherRadiusLimit === preset.r
                        ? 'bg-emerald-500/25 border-emerald-500 text-emerald-300 font-bold shadow-md shadow-emerald-500/10 ring-1 ring-emerald-400'
                        : 'bg-slate-900/90 hover:bg-slate-800 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="font-bold text-xs">{preset.label}</div>
                    <div className="text-[10px] text-slate-400">{preset.title}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div
                onClick={() => setShowWorkZones3D((prev) => !prev)}
                className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-colors ${
                  showWorkZones3D ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-slate-800/60 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-emerald-400" />
                  <span>Círculos 3D no Mapa</span>
                </div>
                <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-slate-900">
                  {showWorkZones3D ? 'LIGADO' : 'DESL'}
                </span>
              </div>

              <div
                onClick={() => setIsStrictZoneLeash((prev) => !prev)}
                className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-colors ${
                  isStrictZoneLeash ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-slate-800/60 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>Trava Estrita na Zona</span>
                </div>
                <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-slate-900">
                  {isStrictZoneLeash ? 'LIGADO' : 'DESL'}
                </span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <button
                type="button"
                onClick={() => onApplyRadiusToAllWorkingVillagers(gatherRadiusLimit)}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.99]"
              >
                <Target className="w-4 h-4" />
                <span>Aplicar Raio ({gatherRadiusLimit >= 999 ? 'Livre' : `${gatherRadiusLimit}m`}) a Todos os Aldeões em Coleta</span>
              </button>
            </div>

            {/* Active Zones List */}
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                <span>Zonas Ativas na Colônia:</span>
                <span className="text-emerald-400 font-mono font-bold">{activeWorkZones.length} zona(s)</span>
              </div>

              {activeWorkZones.length === 0 ? (
                <p className="text-xs text-slate-500 italic p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-center">
                  Nenhuma zona de trabalho ativa no momento. Envie aldeões para colher um recurso para criar uma zona automaticamente!
                </p>
              ) : (
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {activeWorkZones.map((z) => (
                    <div
                      key={z.id}
                      className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        <div>
                          <div className="font-bold text-white">
                            {z.clusterName || `Zona em X:${Math.round(z.x)} Z:${Math.round(z.z)}`}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {z.unitCount} aldeão(ões) • Raio: {z.radius >= 999 ? 'Livre' : `${z.radius}m`} • {z.treesRemaining} árvores disponíveis
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onFocusZone(z.x, z.z);
                          setIsWorkZoneModalOpen(false);
                          soundManager.playClickSound();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-semibold transition-colors shrink-0"
                      >
                        Focar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TACTICAL TOAST NOTIFICATIONS */}
      {notification && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300 animate-in fade-in slide-in-from-top-3">
          <div
            className={`px-4 py-2.5 rounded-2xl backdrop-blur-xl border shadow-2xl flex items-center gap-2.5 text-xs font-semibold ${
              notification.type === 'success'
                ? 'bg-emerald-950/95 text-emerald-300 border-emerald-500/50 shadow-emerald-500/20'
                : notification.type === 'warning'
                ? 'bg-amber-950/95 text-amber-300 border-amber-500/50 shadow-amber-500/20'
                : 'bg-slate-950/95 text-slate-200 border-slate-700/90 shadow-black/60'
            }`}
          >
            {notification.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : notification.type === 'warning' ? (
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
        </div>
      )}

    </>
  );
}
