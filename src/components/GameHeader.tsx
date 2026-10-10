import type { Dispatch, SetStateAction } from 'react';
import {
  Eye, EyeOff, Info, Layers, Lock, Maximize2, MessageSquare, Sparkles, Sprout, Target, Unlock, Volume2, VolumeX,
} from 'lucide-react';
import type { BuildingType } from '../game/buildingDefs';
import { BUILDING_CATALOG } from '../game/buildingDefs';
import { soundManager } from '../game/audio';
import type { PlayerResources } from '../game/engine';
import type { ChatMessage } from '../game/multiplayer';
import type { Era } from '../game/tech';
import { ResourceNavMenu } from './ResourceNavMenu';

type HudMode = 'full' | 'compact' | 'hidden';

interface WorkZoneSummary {
  id: string;
}

interface GameHeaderProps {
  hudMode: HudMode;
  setHudMode: Dispatch<SetStateAction<HudMode>>;
  isHoverPeeking: boolean;
  setIsHoverPeeking(value: boolean): void;
  isCameraAutoMoveLocked: boolean;
  toggleCameraLock(): void;
  toggleHudMode(): void;
  myResources: PlayerResources;
  activeGatherers: { wood: number; food: number; gold: number; fish: number; stone: number };
  idleFriendlyVillagersCount: number;
  handleSelectIdleVillager(): void;
  setIsEmpireCatalogOpen(value: boolean): void;
  handleJumpToResource(type: 'tree' | 'gold_mine' | 'food_bush' | 'fish_school' | 'stone'): void;
  setBuildMode(type: BuildingType): void;
  triggerNotification(message: string, type?: 'info' | 'success' | 'warning'): void;
  role: 'host' | 'client' | 'single';
  handleRegenerateProceduralMap(): void;
  isColonySustainableForestry: boolean;
  handleToggleColonySustainableForestry(): void;
  activeWorkZones: WorkZoneSummary[];
  isWorkZoneModalOpen: boolean;
  setIsWorkZoneModalOpen: Dispatch<SetStateAction<boolean>>;
  gatherRadiusLimit: number;
  setShowControlsModal(value: boolean): void;
  isAudioMuted: boolean;
  setIsAudioMuted(value: boolean): void;
  isChatOpen: boolean;
  setIsChatOpen(value: boolean): void;
  chatMessages: ChatMessage[];
  isHudPreviewMode: boolean;
  isTechPanelOpen: boolean;
  setIsTechPanelOpen: Dispatch<SetStateAction<boolean>>;
  currentEra?: Era;
  onPointerEnterUI(): void;
  onPointerLeaveUI(): void;
}

export function GameHeader({
  hudMode, setHudMode, isHoverPeeking, setIsHoverPeeking, isCameraAutoMoveLocked, toggleCameraLock,
  toggleHudMode, myResources, activeGatherers, idleFriendlyVillagersCount, handleSelectIdleVillager,
  setIsEmpireCatalogOpen, handleJumpToResource, setBuildMode, triggerNotification, role,
  handleRegenerateProceduralMap, isColonySustainableForestry, handleToggleColonySustainableForestry,
  activeWorkZones, isWorkZoneModalOpen, setIsWorkZoneModalOpen, gatherRadiusLimit,
  setShowControlsModal, isAudioMuted, setIsAudioMuted, isChatOpen, setIsChatOpen, chatMessages,
  isHudPreviewMode, isTechPanelOpen, setIsTechPanelOpen, currentEra,
  onPointerEnterUI, onPointerLeaveUI,
}: GameHeaderProps) {
  return (
    <>
      {/* MINIMAL RESTORE DOCK WHEN HUD IS HIDDEN (Cinematic Exploration Mode) */}
      {hudMode === 'hidden' && !isHoverPeeking && !isHudPreviewMode && (
        <div
          onMouseEnter={() => {
            setIsHoverPeeking(true);
            onPointerEnterUI();
          }}
          onMouseLeave={() => {
            setIsHoverPeeking(false);
            onPointerLeaveUI();
          }}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex items-center gap-2 bg-slate-950/90 hover:bg-slate-950 border border-amber-500/40 hover:border-amber-400 px-3.5 py-1.5 rounded-full shadow-2xl backdrop-blur-md text-xs font-semibold transition-all group"
        >
          <button
            type="button"
            onClick={() => {
              setHudMode('full');
              soundManager.playClickSound();
              triggerNotification('Interface HUD restaurada.', 'info');
            }}
            className="flex items-center gap-1.5 text-amber-300 hover:text-amber-200 transition-colors"
          >
            <Eye className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
            <span>Exibir Interface</span>
            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-[10px] text-white">H</kbd>
          </button>

          <span className="text-slate-600">·</span>

          {/* Camera Lock toggle button in Hidden mode */}
          <button
            type="button"
            onClick={toggleCameraLock}
            aria-pressed={isCameraAutoMoveLocked}
            className={`flex items-center gap-1 text-[11px] transition-colors ${
              isCameraAutoMoveLocked ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Travar / Destravar Rolagem Automática de Câmera (Tecla L)"
          >
            {isCameraAutoMoveLocked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
            <span>{isCameraAutoMoveLocked ? 'Câmera Fixa' : 'Câmera Livre'}</span>
          </button>

          <span className="text-slate-600 hidden sm:inline">·</span>
          <span className="text-[10px] text-slate-400 hidden sm:inline">Modo Exploração Livre</span>
        </div>
      )}

      {/* TOP RESOURCE & STATUS HUD (FULL / COMPACT / HOVER PEEK) */}
      {(hudMode !== 'hidden' || (isHoverPeeking && !isHudPreviewMode)) && (
        <header
          onMouseEnter={() => {
            setIsHoverPeeking(true);
            onPointerEnterUI();
          }}
          onMouseLeave={() => {
            setIsHoverPeeking(false);
            onPointerLeaveUI();
          }}
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
          className={`absolute top-2 sm:top-4 left-2 sm:left-4 right-2 sm:right-4 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 pointer-events-none transition-all duration-300 z-30 ${
            hudMode === 'hidden' && isHoverPeeking ? 'opacity-100 translate-y-0' : ''
          }`}
        >
          {hudMode === 'compact' && !isHoverPeeking ? (
            /* COMPACT TACTICAL HUD STRIP */
            <div className="flex items-center justify-between w-full pointer-events-auto bg-slate-950/90 backdrop-blur-md px-3 sm:px-4 py-1.5 rounded-2xl border border-slate-800 shadow-2xl">
              {/* Compact Resource Ticker */}
              <div className="flex items-center gap-2 sm:gap-4 text-xs font-mono">
                <span className="flex items-center gap-1 text-amber-300 font-bold" title="Madeira">
                  M {Math.floor(myResources.wood)}
                </span>
                <span className="flex items-center gap-1 text-red-300 font-bold" title="Alimento">
                  C {Math.floor(myResources.food)}
                </span>
                <span className="flex items-center gap-1 text-yellow-300 font-bold" title="Ouro">
                  O {Math.floor(myResources.gold)}
                </span>
                <span
                  className="flex items-center gap-1 text-slate-300 font-bold"
                  title="Pedra"
                >
                  P {Math.floor(myResources.stone)}
                </span>
                <span className="flex items-center gap-1 text-orange-200 font-bold" title="Tábuas">
                  T {Math.floor(myResources.planks || 0)}
                </span>
                <span className="flex items-center gap-1 text-blue-300 font-bold" title="População">
                  Pop {myResources.pop}/{myResources.maxPop}
                </span>
              </div>

              {/* Compact Controls */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={toggleCameraLock}
            aria-pressed={isCameraAutoMoveLocked}
                  className={`px-2 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors ${
                    isCameraAutoMoveLocked
                      ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                  title="Travar / Destravar Rolagem Automática (Tecla L)"
                >
                  {isCameraAutoMoveLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  <span className="hidden md:inline">{isCameraAutoMoveLocked ? 'Câmera Fixa' : 'Câmera Livre'}</span>
                  <kbd className="hidden lg:inline text-[9px] px-1 py-0.5 bg-slate-900/80 rounded font-mono text-slate-400">L</kbd>
                </button>

                <button
                  type="button"
                  onClick={() => setHudMode('full')}
                  className="px-2 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                  title="Expandir para Modo HUD Completo (Tecla C)"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden sm:inline">Completo</span>
                  <kbd className="hidden lg:inline text-[9px] px-1 py-0.5 bg-slate-900/80 rounded font-mono text-slate-400">C</kbd>
                </button>

                <button
                  type="button"
                  onClick={() => setHudMode('hidden')}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-300 transition-colors"
                  title="Ocultar HUD completamente (Tecla H)"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            /* FULL DETAILED HUD BAR */
            <>
              {/* SVG-Art & Interactive Navigation Resource Bar (Ikariam / SkyCity / AoE style) */}
              <ResourceNavMenu
                resources={myResources}
                activeGatherers={activeGatherers}
                idleVillagersCount={idleFriendlyVillagersCount}
                onSelectIdleVillager={handleSelectIdleVillager}
                onOpenCatalog={() => setIsEmpireCatalogOpen(true)}
                onOpenMarket={() => setIsEmpireCatalogOpen(true)}
                onJumpToResource={handleJumpToResource}
                onQuickBuild={(type) => {
                  setBuildMode(type);
                  soundManager.playClickSound();
                  triggerNotification(`Modo de Construção: ${BUILDING_CATALOG[type]?.name || type}. Clique no terreno para erguer a obra.`, 'info');
                }}
                onRegenerateProceduralMap={role === 'single' ? handleRegenerateProceduralMap : undefined}
                isSustainableForestry={isColonySustainableForestry}
                onToggleSustainableForestry={handleToggleColonySustainableForestry}
              />

              {/* Room & Actions Bar */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 max-w-full bg-slate-950/90 backdrop-blur-md px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-2xl border border-slate-800 shadow-2xl pointer-events-auto">
                {/* Camera Auto-Movement Lock Toggle Button */}
                <button
                  type="button"
                  onClick={toggleCameraLock}
            aria-pressed={isCameraAutoMoveLocked}
                  className={`p-1.5 px-2.5 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-semibold ${
                    isCameraAutoMoveLocked
                      ? 'bg-amber-500/25 border-amber-500/50 text-amber-300 shadow-sm shadow-amber-500/20 ring-1 ring-amber-500/30'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                  title={
                    isCameraAutoMoveLocked
                      ? 'Câmera Fixa: rolagem automática pelas bordas travada (Tecla L). Clique para destravar.'
                      : 'Câmera Livre: rolagem automática pelas bordas ativa (Tecla L). Clique para travar.'
                  }
                >
                  {isCameraAutoMoveLocked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5 text-slate-400" />}
                  <span className="hidden sm:inline font-bold">
                    {isCameraAutoMoveLocked ? 'Câmera Fixa' : 'Câmera Livre'}
                  </span>
                  <kbd className="hidden md:inline px-1 py-0.5 bg-slate-900 rounded font-mono text-[9px] text-slate-400">L</kbd>
                </button>

                {/* HUD Mode Switcher Segmented Control */}
                <div className="hidden sm:flex items-center p-0.5 bg-slate-900 border border-slate-800 rounded-xl text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setHudMode('full')}
                    aria-pressed={hudMode === 'full'}
                    className={`px-2 py-1 rounded-lg transition-colors ${
                      hudMode === 'full' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Modo Completo"
                  >
                    Cheio
                  </button>
                  <button
                    type="button"
                    onClick={() => setHudMode('compact')}
                    aria-pressed={hudMode === 'compact'}
                    className={`px-2 py-1 rounded-lg transition-colors ${
                      hudMode === 'compact' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Modo Tático Compacto (Tecla C)"
                  >
                    Compacto
                  </button>
                  <button
                    type="button"
                    onClick={() => setHudMode('hidden')}
                    className="px-2 py-1 rounded-lg text-slate-400 hover:text-amber-300 transition-colors"
                    title="Modo Cinemático Oculto (Tecla H)"
                  >
                    <EyeOff className="w-3 h-3 inline mr-1" />
                    Ocultar
                  </button>
                </div>

                {/* Mobile Single-Button HUD Toggle */}
                <button
                  type="button"
                  onClick={toggleHudMode}
                  className="sm:hidden p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Alternar Modo do HUD (Tecla H / C)"
                >
                  <Layers className="w-4 h-4 text-amber-400" />
                </button>

                {/* Sustainable Colony Forestry Policy Button */}
                <button
                  type="button"
                  onClick={handleToggleColonySustainableForestry}
                  className={`p-1.5 px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    isColonySustainableForestry
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                  title="Política Colonial de Reflorestamento: quando ativo, todas as árvores colhidas no mapa renascem automaticamente com mudas!"
                >
                  <Sprout className={`w-3.5 h-3.5 ${isColonySustainableForestry ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
                  <span className="hidden md:inline">Reflorestamento</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${isColonySustainableForestry ? 'bg-emerald-500/30 text-emerald-200 font-bold' : 'bg-slate-900 text-slate-400'}`}>
                    {isColonySustainableForestry ? 'ATIVO' : 'DESL'}
                  </span>
                </button>

                {/* Work Zones Selector Button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsWorkZoneModalOpen((prev) => !prev);
                    soundManager.playClickSound();
                  }}
                  className={`p-1.5 px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    activeWorkZones.length > 0 || isWorkZoneModalOpen
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/20'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                  title="Zonas de Trabalho: configure o raio limite e evite que os aldeões desmatem o mapa inteiro! (Tecla Z)"
                >
                  <Target className={`w-3.5 h-3.5 ${activeWorkZones.length > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`} />
                  <span className="hidden md:inline">Zonas</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${activeWorkZones.length > 0 ? 'bg-amber-500/30 text-amber-200' : 'bg-slate-900 text-slate-400'}`}>
                    {gatherRadiusLimit >= 999 ? 'Livre' : `${gatherRadiusLimit}m`}
                  </span>
                  <kbd className="hidden lg:inline px-1 py-0.5 bg-slate-900 rounded font-mono text-[9px] text-slate-400">Z</kbd>
                </button>

                {/* Research & Eras Panel Button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsTechPanelOpen((prev) => !prev);
                    soundManager.playClickSound();
                  }}
                  className={`p-1.5 px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    isTechPanelOpen
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/20 ring-1 ring-amber-500/30'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                  title="Tecnologias e Eras: pesquique melhorias de economia e militar"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden md:inline">Tecnologias</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-slate-900 text-amber-200">
                    {currentEra === 'commercial'
                      ? 'E2'
                      : currentEra === 'industrial'
                      ? 'E3'
                      : 'E1'}
                  </span>
                </button>

                {/* Controls Guide Modal Button */}
                <button
                  type="button"
                  onClick={() => {
                    setShowControlsModal(true);
                    soundManager.playClickSound();
                  }}
                  className="p-1.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1 text-xs font-semibold"
                  title="Ver Guia de Controles e Atalhos"
                >
                  <Info className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden lg:inline">Controles</span>
                </button>

                {/* Audio Mute/Unmute Toggle Button */}
                <button
                  type="button"
                  onClick={() => {
                    const muted = soundManager.toggleMute();
                    setIsAudioMuted(muted);
                    if (!muted) soundManager.playClickSound();
                  }}
                  className={`p-1.5 rounded-xl transition-colors ${
                    isAudioMuted
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-slate-800 hover:bg-slate-700 text-amber-400'
                  }`}
                  title={isAudioMuted ? 'Ativar Efeitos Sonoros' : 'Silenciar Efeitos Sonoros'}
                >
                  {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                {/* Chat Toggle Button */}
                <button
                  type="button"
                  onClick={() => setIsChatOpen(!isChatOpen)}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors relative"
                  title="Chat da Partida"
                >
                  <MessageSquare className="w-4 h-4" />
                  {chatMessages.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full" />
                  )}
                </button>
              </div>
            </>
          )}
        </header>
      )}

    </>
  );
}
