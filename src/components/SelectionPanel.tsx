import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  Anchor, Apple, AlignJustify, Castle, Check, ChevronDown, ChevronUp, Coins, Compass, Home, Hammer, LayoutGrid,
  Maximize2, PawPrint, Pickaxe, Plus, Shield, Sparkles, Sprout, Sword, Target, TreePine, Trash2,
  Users, Wrench, X,
} from 'lucide-react';
import { isBoatUnit, type Building, type GameState, type PlayerResources, type ResourceNode, type Unit, type UnitType } from '../game/engine';
import type { BuildingType } from '../game/buildingDefs';
import { BUILDING_CATALOG } from '../game/buildingDefs';
import type { PlayerSlot } from '../game/networkCommands';
import type { MultiplayerManager } from '../game/multiplayer';
import { soundManager } from '../game/audio';
import { canAfford, describeCost, UNIT_COSTS } from '../game/economy';
import { REPAIR_HP_PER_TICK, REPAIR_WOOD_PER_HP } from '../game/simulation';
import { boatCapacity } from '../game/navalTransport';

interface ActiveWorkZone {
  id: string; x: number; z: number; radius: number; unitIds: string[];
  resourceType?: ResourceNode['type']; clusterName?: string;
  unitCount: number; treesRemaining: number; regrowingCount: number; isHighlighted: boolean;
}
interface PreviewZone {
  x: number; z: number; radius: number; resourceType: ResourceNode['type']; treesCovered: number;
}
type Selection = { id: string; kind: 'unit' | 'building' | 'resource' } | null;
type SquadFormation = 'box' | 'line' | 'spread';

interface SelectionPanelProps {
  gameState: GameState;
  playerSlot: PlayerSlot;
  role: 'host' | 'client' | 'single';
  selectedEntity: Selection;
  selectedUnitsList: Unit[];
  selectedUnitIds: string[];
  selectedUnit: Unit | null | undefined;
  selectedBuilding: Building | null | undefined;
  selectedResource: ResourceNode | null | undefined;
  soldierCount: number;
  villagerCount: number;
  totalSquadHealth: number;
  totalSquadMaxHealth: number;
  activeBuildersOnSelectedBuilding: number;
  activeGatherersOnSelectedResource: number;
  idleFriendlyVillagersCount: number;
  totalQueuedForPlayer: number;
  myResources: PlayerResources;
  groveTrees: ResourceNode[];
  matureGroveCount: number;
  regrowingGroveCount: number;
  isGroveAllSustainable: boolean;
  activeWorkZones: ActiveWorkZone[];
  previewZone: PreviewZone | null;
  isBottomCardCollapsed: boolean;
  setIsBottomCardCollapsed: Dispatch<SetStateAction<boolean>>;
  setSelectedEntity: Dispatch<SetStateAction<Selection>>;
  setSelectedUnitIds: Dispatch<SetStateAction<string[]>>;
  squadFormation: SquadFormation;
  setSquadFormation: Dispatch<SetStateAction<SquadFormation>>;
  gatherRadiusLimit: number;
  setGatherRadiusLimit: Dispatch<SetStateAction<number>>;
  gatherShiftDuration: number;
  setGatherShiftDuration: Dispatch<SetStateAction<number>>;
  isSettingZoneCenter: boolean;
  setIsSettingZoneCenter: Dispatch<SetStateAction<boolean>>;
  setIsEmpireCatalogOpen: Dispatch<SetStateAction<boolean>>;
  setIsPointerOverUI(value: boolean): void;
  handleIncomingCommand(command: unknown): void;
  handleSetUnitWorkZoneRadius(unitIds: string[], radius: number): void;
  handleSendAllIdleVillagersToBuild(buildingId: string): void;
  handleTrainUnit(unitType: UnitType, count?: number): void;
  handleCancelTrain(buildingId: string, queueIndex: number): void;
  handleTradeResource(type: 'wood' | 'food' | 'stone', action: 'buy' | 'sell', amount: number): void;
  handleSetGroveHarvestMode(targetId: string, mode: 'sustainable' | 'clear_cut'): void;
  handleToggleResourceHarvestMode(resourceId: string, mode: 'clear_cut' | 'sustainable'): void;
  handleClearForestCluster(treeId: string): void;
  handleAssignVillagersToResource(resourceId: string, count: number): void;
  handleAssignSelectedSquadToResource(resourceId: string): void;
  handleRemoveResourceImmediately(resourceId: string): void;
  renderVillagerBuildCatalog(): ReactNode;
  nearestVillagerToSelectedBuilding: Unit | null;
  handleRepairBuilding(unitId: string, buildingId: string): void;
  handleDemolishBuilding(buildingId: string): void;
  handleDisembark(boatId: string): void;
  triggerNotification(message: string, type?: 'info' | 'success' | 'warning'): void;
  multiRef: { current: MultiplayerManager | null };
  onPointerEnterUI(): void;
  onPointerLeaveUI(): void;
}

export function SelectionPanel(props: SelectionPanelProps) {
  const {
    playerSlot, role, selectedEntity, selectedUnitsList, selectedUnit,
    selectedBuilding, selectedResource, soldierCount, villagerCount, totalSquadHealth, totalSquadMaxHealth,
    activeBuildersOnSelectedBuilding, activeGatherersOnSelectedResource,
    totalQueuedForPlayer, myResources, groveTrees, matureGroveCount, regrowingGroveCount,
    isGroveAllSustainable, previewZone, isBottomCardCollapsed, setIsBottomCardCollapsed,
    setSelectedEntity, setSelectedUnitIds, squadFormation, setSquadFormation, gatherRadiusLimit,
    setGatherRadiusLimit, gatherShiftDuration, setGatherShiftDuration, isSettingZoneCenter,
    setIsSettingZoneCenter, setIsEmpireCatalogOpen, handleIncomingCommand,
    handleSetUnitWorkZoneRadius, handleSendAllIdleVillagersToBuild, handleTrainUnit, handleCancelTrain,
    handleSetGroveHarvestMode, handleToggleResourceHarvestMode, handleClearForestCluster,
    handleAssignVillagersToResource, handleAssignSelectedSquadToResource, handleRemoveResourceImmediately,
    renderVillagerBuildCatalog, nearestVillagerToSelectedBuilding, handleRepairBuilding,
    handleDemolishBuilding, handleDisembark, triggerNotification, multiRef, onPointerEnterUI, onPointerLeaveUI,
  } = props;
  return (
    <>
        {/* Selected Entity Command Card */}
        {(selectedUnitsList.length > 0 || selectedEntity) && (
          isBottomCardCollapsed ? (
            /* COLLAPSED COMPACT CARD BADGE */
            <div
              onMouseEnter={() => onPointerEnterUI()}
              onMouseLeave={() => onPointerLeaveUI()}
              className="bg-slate-950/90 backdrop-blur-xl border border-slate-800 hover:border-slate-700 rounded-2xl p-2.5 px-4 shadow-2xl pointer-events-auto flex items-center justify-between gap-3 text-xs w-full max-w-sm transition-all"
            >
              <div className="flex items-center gap-2 truncate">
                {selectedUnitsList.length > 1 ? (
                  <>
                    <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="font-bold text-white truncate">Pelotão ({selectedUnitsList.length} Unidades)</span>
                  </>
                ) : selectedUnitsList.length === 1 ? (
                  <>
                    {selectedUnitsList[0].type === 'villager' ? <Users className="w-4 h-4 text-amber-400 shrink-0" /> : <Sword className="w-4 h-4 text-blue-400 shrink-0" />}
                    <span className="font-bold text-white truncate">
                      {selectedUnitsList[0].type === 'villager' ? 'Aldeão' : selectedUnitsList[0].type === 'cavalry' ? 'Cavalaria' : 'Mosqueteiro'} ({Math.round(selectedUnitsList[0].health)}/{selectedUnitsList[0].maxHealth} HP)
                    </span>
                  </>
                ) : selectedBuilding ? (
                  <>
                    <Castle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="font-bold text-white truncate">
                      {selectedBuilding.type === 'town_center' ? 'Centro da Vila' : BUILDING_CATALOG[selectedBuilding.type as 'house' | 'barracks' | 'tower']?.name || 'Edifício'}
                      {selectedBuilding.trainingQueue.length > 0 && ` (${selectedBuilding.trainingQueue.length} na fila)`}
                    </span>
                  </>
                ) : selectedResource ? (
                  <>
                    {selectedResource.type === 'tree' ? (
                      <TreePine className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : selectedResource.type === 'gold_mine' ? (
                      <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                    ) : selectedResource.type === 'stone' ? (
                      <Pickaxe className="w-4 h-4 text-slate-300 shrink-0" />
                    ) : (
                      <Apple className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span className="font-bold text-white truncate">
                      {selectedResource.type === 'tree'
                        ? 'Madeira'
                        : selectedResource.type === 'gold_mine'
                        ? 'Ouro'
                        : selectedResource.type === 'stone'
                        ? 'Pedra'
                        : 'Frutas'}{' '}
                      ({Math.round(selectedResource.remaining)})
                    </span>
                  </>
                ) : null}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsBottomCardCollapsed(false)}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 flex items-center gap-1 text-[11px] font-semibold px-2 transition-colors"
                  title="Expandir Painel de Comandos"
                >
                  <span>Expandir</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUnitIds([]);
                    setSelectedEntity(null);
                  }}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                  title="Desmarcar Seleção (ESC)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            /* EXPANDED FULL COMMAND CARD */
            <div
              onMouseEnter={() => onPointerEnterUI()}
              onMouseLeave={() => onPointerLeaveUI()}
              className="bg-slate-950/95 backdrop-blur-xl border border-slate-800 rounded-3xl p-4 sm:p-5 w-full max-w-lg shadow-2xl pointer-events-auto space-y-4 max-h-[60vh] sm:max-h-[65vh] overflow-y-auto"
            >
              {/* Header minimize bar of the card */}
              <div className="flex items-center justify-between -mt-1 -mr-1 pb-1 border-b border-slate-800/60">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  {selectedUnitsList.length > 1 ? 'Comando de Pelotão' : selectedUnitsList.length === 1 ? 'Unidade Selecionada' : selectedBuilding ? 'Painel de Estrutura' : 'Recurso Natural'}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsBottomCardCollapsed(true)}
                    className="p-1 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-300 text-[11px] flex items-center gap-1 transition-colors"
                    title="Recolher painel para liberar a visão"
                  >
                    <span>Recolher</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUnitIds([]);
                      setSelectedEntity(null);
                    }}
                    className="p-1 rounded-lg bg-slate-900 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                    title="Desmarcar Seleção (ESC)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            {/* Multi-Unit Squad Selected */}
            {selectedUnitsList.length > 1 && (
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <Shield className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-white">
                        Pelotão Militar ({selectedUnitsList.length} Unidades)
                      </h3>
                      <div className="text-xs text-slate-400 flex items-center gap-2">
                        {soldierCount > 0 && (
                          <span className="text-blue-400 font-medium">{soldierCount}x Mosqueteiros</span>
                        )}
                        {soldierCount > 0 && villagerCount > 0 && <span>•</span>}
                        {villagerCount > 0 && (
                          <span className="text-amber-400 font-medium">{villagerCount}x Aldeões</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 font-mono text-slate-300">
                    {Math.round(totalSquadHealth)}/{totalSquadMaxHealth} HP
                  </span>
                </div>

                {/* Squad Health Bar */}
                <div className="w-full h-2 bg-slate-800 rounded-full mt-3 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${(totalSquadHealth / Math.max(1, totalSquadMaxHealth)) * 100}%` }}
                  />
                </div>

                {/* Quick Squad Filter Sub-selections */}
                {soldierCount > 0 && villagerCount > 0 && (
                  <div className="flex gap-2 mt-3 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        const sIds = selectedUnitsList.filter((u) => u.type === 'soldier').map((u) => u.id);
                        setSelectedUnitIds(sIds);
                        setSelectedEntity(sIds.length > 0 ? { id: sIds[0], kind: 'unit' } : null);
                        soundManager.playUnitResponseSound('soldier', sIds.length);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
                    >
                      <Sword className="w-3.5 h-3.5 text-blue-400" /> Apenas Soldados ({soldierCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const vIds = selectedUnitsList.filter((u) => u.type === 'villager').map((u) => u.id);
                        setSelectedUnitIds(vIds);
                        setSelectedEntity(vIds.length > 0 ? { id: vIds[0], kind: 'unit' } : null);
                        soundManager.playUnitResponseSound('villager', vIds.length);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
                    >
                      <Users className="w-3.5 h-3.5 text-amber-400" /> Apenas Aldeões ({villagerCount})
                    </button>
                  </div>
                )}

                {/* Squad Formation Toggles ('Box', 'Line', 'Spread') */}
                <div className="mt-3 pt-2.5 border-t border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <span>Formação de Movimento:</span>
                    <span className="text-amber-400 font-bold text-xs">
                      {squadFormation === 'box' ? 'Caixa (Padrão)' : squadFormation === 'line' ? 'Linha (Frontal)' : 'Dispersa (Anti-Área)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSquadFormation('box');
                        soundManager.playClickSound();
                      }}
                      className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        squadFormation === 'box'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm shadow-amber-500/20'
                          : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 border-slate-800'
                      }`}
                      title="Formação em Caixa: pelotão compacto em bloco, ótimo para marchas rápidas e manobras"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Caixa</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSquadFormation('line');
                        soundManager.playClickSound();
                      }}
                      className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        squadFormation === 'line'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm shadow-amber-500/20'
                          : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 border-slate-800'
                      }`}
                      title="Formação em Linha: fileira frontal horizontal, maximiza linha de tiro dos mosqueteiros"
                    >
                      <AlignJustify className="w-3.5 h-3.5" />
                      <span>Linha</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSquadFormation('spread');
                        soundManager.playClickSound();
                      }}
                      className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        squadFormation === 'spread'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm shadow-amber-500/20'
                          : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 border-slate-800'
                      }`}
                      title="Formação Dispersa: espaçamento aberto e solto, evita aglomeração e reduz dano em área"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Dispersa</span>
                    </button>
                  </div>
                </div>

                {/* Squad-Level Work Zone Controls */}
                {villagerCount > 0 && (
                  <div className="mt-3 p-3 rounded-2xl bg-slate-900/90 border border-emerald-500/30 space-y-2 text-xs shadow-inner">
                    <div className="flex items-center justify-between font-semibold text-slate-200">
                      <span className="flex items-center gap-1.5 text-emerald-400">
                        <Target className="w-4 h-4" />
                        <span>Zona de Trabalho do Pelotão ({villagerCount} Aldeões)</span>
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Raio: {gatherRadiusLimit >= 999 ? 'Livre' : `${gatherRadiusLimit}m`}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { r: 8, label: '8m Estrito' },
                        { r: 14, label: '14m Médio' },
                        { r: 22, label: '22m Amplo' },
                        { r: 999, label: 'Livre' },
                      ].map((preset) => {
                        const villagerIds = selectedUnitsList.filter((u) => u.type === 'villager').map((u) => u.id);
                        const isPresetActive = gatherRadiusLimit === preset.r;
                        return (
                          <button
                            key={preset.r}
                            type="button"
                            onClick={() => handleSetUnitWorkZoneRadius(villagerIds, preset.r)}
                            className={`py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                              isPresetActive
                                ? 'bg-emerald-500 text-slate-950 font-bold'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Villager Construction Menu if villagers are in squad */}
                {villagerCount > 0 && selectedUnitsList.some((u) => u.owner === playerSlot) && (
                  renderVillagerBuildCatalog()
                )}
              </div>
            )}

            {/* Single Unit Selected */}
            {selectedUnitsList.length <= 1 && selectedUnit && (
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400">
                      {selectedUnit.type === 'soldier' ? (
                        <Sword className="w-6 h-6" />
                      ) : isBoatUnit(selectedUnit.type) ? (
                        <Anchor className="w-6 h-6" />
                      ) : (
                        <Users className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-white capitalize">
                        {selectedUnit.type === 'soldier'
                          ? 'Soldado Mosqueteiro'
                          : selectedUnit.type === 'cavalry'
                          ? 'Cavalaria Montada'
                          : selectedUnit.type === 'fishing_boat'
                          ? 'Barco de Pesca'
                          : selectedUnit.type === 'trade_boat'
                          ? 'Barco Mercante'
                          : selectedUnit.type === 'warship'
                          ? 'Barco de Guerra'
                          : 'Aldeão Construtor'}
                      </h3>
                      <div className="text-xs text-slate-400 flex items-center gap-2">
                        <span>Status: <span className="text-amber-400 font-medium capitalize">{selectedUnit.state}</span></span>
                        <span>•</span>
                        <span>Dano: {selectedUnit.attackDamage}</span>
                      </div>
                    </div>
                  </div>

                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 font-mono text-slate-300">
                    {Math.round(selectedUnit.health)}/{selectedUnit.maxHealth} HP
                  </span>
                </div>

                {/* Health Bar */}
                <div className="w-full h-2 bg-slate-800 rounded-full mt-3 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${(selectedUnit.health / selectedUnit.maxHealth) * 100}%` }}
                  />
                </div>

                {isBoatUnit(selectedUnit.type) && (
                  <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-400">
                      Passageiros:{' '}
                      <span className="text-amber-300 font-bold">
                        {selectedUnit.passengers?.length ?? 0}/{boatCapacity(selectedUnit.type)}
                      </span>
                    </span>
                    {(selectedUnit.passengers?.length ?? 0) > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          handleDisembark(selectedUnit.id);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                        title="Colocar os passageiros em terra firme proxima"
                      >
                        <Anchor className="w-3.5 h-3.5" /> Desembarcar
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400">
                        {boatCapacity(selectedUnit.type) === 0 ? 'Não transporta' : 'Selecione unidades e clique com o botão direito no barco'}
                      </span>
                    )}
                  </div>
                )}

                {/* Tactical Formation Selector */}
                <div className="mt-3 pt-2.5 border-t border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <span>Formação do Pelotão:</span>
                    <span className="text-amber-400 font-bold text-xs">
                      {squadFormation === 'box' ? 'Caixa [1]' : squadFormation === 'line' ? 'Linha [2]' : 'Dispersa [3]'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSquadFormation('box');
                        soundManager.playClickSound();
                        triggerNotification('Formação em Caixa ativada', 'info');
                      }}
                      className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        squadFormation === 'box'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm'
                          : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 border-slate-800'
                      }`}
                      title="Formação em Caixa: bloco compacto para marcha regular"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Caixa [1]</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSquadFormation('line');
                        soundManager.playClickSound();
                        triggerNotification('Formação em Linha de Batalha ativada', 'info');
                      }}
                      className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        squadFormation === 'line'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm'
                          : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 border-slate-800'
                      }`}
                      title="Formação em Linha: fileira perpendicular, ideal para mosqueteiros dispararem em salva"
                    >
                      <AlignJustify className="w-3.5 h-3.5" />
                      <span>Linha [2]</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSquadFormation('spread');
                        soundManager.playClickSound();
                        triggerNotification('Formação Dispersa ativada', 'info');
                      }}
                      className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        squadFormation === 'spread'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm'
                          : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 border-slate-800'
                      }`}
                      title="Formação Dispersa: espaçamento aberto, reduz dano em área"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Dispersa [3]</span>
                    </button>
                  </div>
                </div>

                {/* Work Zone & Gathering Controls for Villager */}
                {selectedUnit.type === 'villager' && (
                  <div className="mt-3 p-3 rounded-2xl bg-slate-900/90 border border-emerald-500/30 space-y-2.5 text-xs shadow-inner">
                    <div className="flex items-center justify-between font-semibold text-slate-200">
                      <span className="flex items-center gap-1.5 text-emerald-400">
                        <Target className="w-4 h-4" />
                        <span>Zona de Trabalho do Aldeão</span>
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {(selectedUnit.gatherRadiusLimit || gatherRadiusLimit) >= 999
                          ? 'Livre'
                          : `${selectedUnit.gatherRadiusLimit || gatherRadiusLimit}m`}
                      </span>
                    </div>

                    {selectedUnit.state === 'gathering' && selectedUnit.gatherOrigin ? (
                      <div className="text-[11px] text-slate-400 space-y-1 bg-slate-950/70 p-2 rounded-xl border border-slate-800">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-300 font-medium flex items-center gap-1">
                            <Pickaxe className="w-3.5 h-3.5 text-amber-400 animate-bounce" /> Coletando na Zona
                          </span>
                          <span className="font-mono text-emerald-400">
                            {selectedUnit.gatherShiftSecondsRemaining !== undefined
                              ? `${Math.round(selectedUnit.gatherShiftSecondsRemaining)}s turno`
                              : 'Contínuo'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-800/80">
                          <span>Centro da Zona:</span>
                          <span className="font-mono text-slate-300">
                            X: {Math.round(selectedUnit.gatherOrigin.x)}, Z: {Math.round(selectedUnit.gatherOrigin.z)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 leading-tight">
                        Ao enviar para um recurso, o local se tornará o centro da zona e este aldeão não sairá do raio limite.
                      </p>
                    )}

                    {/* Visual Radius Slider for this Unit */}
                    <div className="space-y-1.5 pt-1 border-t border-slate-800">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Ajustar Raio Limite:</span>
                        <span className="font-mono text-amber-300 font-bold">
                          {(selectedUnit.gatherRadiusLimit || gatherRadiusLimit) >= 999
                            ? 'Sem Limite (Livre)'
                            : `${selectedUnit.gatherRadiusLimit || gatherRadiusLimit}m`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="4"
                        max="40"
                        step="2"
                        value={Math.min(40, selectedUnit.gatherRadiusLimit || gatherRadiusLimit)}
                        onChange={(e) => handleSetUnitWorkZoneRadius([selectedUnit.id], Number(e.target.value))}
                        className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                      <div className="grid grid-cols-4 gap-1 pt-0.5">
                        {[
                          { r: 8, label: '8m Estrito' },
                          { r: 14, label: '14m Médio' },
                          { r: 22, label: '22m Amplo' },
                          { r: 999, label: 'Livre' },
                        ].map((preset) => {
                          const currentR = selectedUnit.gatherRadiusLimit || gatherRadiusLimit;
                          const isActive = currentR === preset.r || (preset.r === 999 && currentR >= 999);
                          return (
                            <button
                              key={preset.r}
                              type="button"
                              onClick={() => handleSetUnitWorkZoneRadius([selectedUnit.id], preset.r)}
                              className={`py-1 rounded-lg text-[10px] font-semibold transition-all ${
                                isActive
                                  ? 'bg-emerald-500 text-slate-950 font-bold'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                              }`}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Center Re-anchor & Pause Buttons */}
                    <div className="flex gap-2 pt-1 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setIsSettingZoneCenter(true);
                          soundManager.playClickSound();
                          triggerNotification(
                            'Clique em qualquer árvore ou terreno para definir o novo centro da Zona de Trabalho.',
                            'info'
                          );
                        }}
                        className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
                          isSettingZoneCenter
                            ? 'bg-amber-500 text-slate-950 font-bold animate-pulse'
                            : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700'
                        }`}
                      >
                        <Target className="w-3.5 h-3.5" />
                        <span>{isSettingZoneCenter ? 'Clique no Mapa...' : 'Mudar Centro'}</span>
                      </button>

                      {selectedUnit.state === 'gathering' && (
                        <button
                          type="button"
                          onClick={() => {
                            const cmd = { type: 'move', unitId: selectedUnit.id, target: selectedUnit.position };
                            if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
                            else multiRef.current?.sendToHost(cmd);
                            triggerNotification('Aldeão interrompeu a coleta e está livre.', 'info');
                          }}
                          className="py-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-300 border border-slate-700 text-[11px] font-semibold transition-colors"
                        >
                          Pausar
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Villager Construction Menu */}
                {selectedUnit.type === 'villager' && selectedUnit.owner === playerSlot && (
                  renderVillagerBuildCatalog()
                )}
              </div>
            )}

            {/* Incomplete Building Under Construction */}
            {selectedBuilding && !selectedBuilding.isComplete && (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                      <Hammer className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-white">
                          Canteiro: {selectedBuilding.type === 'house' ? 'Casa Colonial' : selectedBuilding.type === 'barracks' ? 'Quartel Militar' : 'Torre de Vigia'}
                        </h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 animate-pulse">
                          Em Obras
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {selectedBuilding.type === 'house'
                          ? 'Estrutura habitacional (+5 População quando pronta)'
                          : selectedBuilding.type === 'barracks'
                          ? 'Guarnição militar para infantaria e mosqueteiros'
                          : 'Fortificação defensiva com artilharia de guarda'}
                      </div>
                    </div>
                  </div>

                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 font-mono text-slate-300">
                    {Math.round(selectedBuilding.health)}/{selectedBuilding.maxHealth} HP
                  </span>
                </div>

                {/* Real-time Construction Progress Bar */}
                <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 space-y-3 shadow-inner">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <Hammer className="w-4 h-4 text-amber-400" /> Progresso da Construção:
                    </span>
                    <span className="text-amber-400 font-mono font-bold text-sm bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/30">
                      {Math.round(selectedBuilding.buildProgress || 0)}%
                    </span>
                  </div>

                  <div className="w-full h-3 bg-slate-950 rounded-full p-0.5 border border-slate-800 overflow-hidden relative shadow-inner">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 rounded-full transition-all duration-150 ease-out shadow-[0_0_10px_rgba(245,158,11,0.5)] relative overflow-hidden"
                      style={{ width: `${Math.min(100, Math.max(0, selectedBuilding.buildProgress || 0))}%` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
                    </div>
                  </div>

                  {/* Active builder count & estimated time */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                    <span>
                      Aldeões construindo: <strong className="text-white font-mono">{activeBuildersOnSelectedBuilding}</strong>
                    </span>
                    <span>
                      {selectedBuilding.buildProgress && selectedBuilding.buildProgress > 0
                        ? `~${Math.max(1, Math.ceil((100 - (selectedBuilding.buildProgress || 0)) / (Math.max(1, activeBuildersOnSelectedBuilding) * 5)))}s restantes`
                        : 'Aguardando construtores...'}
                    </span>
                  </div>
                </div>

                {/* Quick button to dispatch all available idle friendly villagers */}
                {selectedBuilding.owner === playerSlot && (
                  <button
                    type="button"
                    onClick={() => handleSendAllIdleVillagersToBuild(selectedBuilding.id)}
                    className="w-full p-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 transition-all hover:scale-[1.01]"
                  >
                    <Users className="w-4 h-4" />
                    <span>Designar Aldeões Disponíveis para Ajudar na Obra</span>
                  </button>
                )}
              </div>
            )}

            {/* Completed Building Selected */}
            {selectedBuilding && selectedBuilding.isComplete && (
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400">
                      {selectedBuilding.type === 'town_center' ? (
                        <Shield className="w-6 h-6 text-amber-400" />
                      ) : selectedBuilding.type === 'barracks' ? (
                        <Sword className="w-6 h-6 text-red-400" />
                      ) : selectedBuilding.type === 'tower' ? (
                        <Castle className="w-6 h-6 text-cyan-400" />
                      ) : selectedBuilding.type === 'sawmill' ? (
                        <TreePine className="w-6 h-6 text-emerald-400" />
                      ) : selectedBuilding.type === 'mine' ? (
                        <Coins className="w-6 h-6 text-yellow-400" />
                      ) : selectedBuilding.type === 'market' ? (
                        <Sparkles className="w-6 h-6 text-amber-300" />
                      ) : selectedBuilding.type === 'farm' ? (
                        <Sprout className="w-6 h-6 text-lime-400" />
                      ) : selectedBuilding.type === 'dock' ? (
                        <Compass className="w-6 h-6 text-blue-400" />
                      ) : (
                        <Home className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-white capitalize">
                        {BUILDING_CATALOG[selectedBuilding.type as BuildingType]?.name ||
                          (selectedBuilding.type === 'town_center' ? 'Centro da Vila' : selectedBuilding.type)}
                      </h3>
                      <div className="text-xs text-slate-400">
                        {selectedBuilding.type === 'town_center'
                          ? 'Edifício Principal de Treino e Gestão Colonial'
                          : selectedBuilding.type === 'barracks'
                          ? 'Recrutamento de Infantaria Militar e Mosqueteiros'
                          : selectedBuilding.type === 'tower'
                          ? 'Posto defensivo armado com tiros automáticos (Alcance: 12)'
                          : selectedBuilding.type === 'dock'
                          ? 'Cais e Estaleiro Naval (Construção de Barcos de Pesca e Comércio)'
                          : selectedBuilding.type === 'market'
                          ? 'Mercadão Central da Cidade (Câmbio e Venda de Mercadorias)'
                          : selectedBuilding.type === 'sawmill'
                          ? 'Serralheria & Madeireira (+35% rendimento de corte de madeira)'
                          : selectedBuilding.type === 'mine'
                          ? 'Mineradora & Pedreira (+40% rendimento de extração de ouro)'
                          : selectedBuilding.type === 'farm'
                          ? 'Fazenda Agrícola (Produção contínua e sustentável de alimento)'
                          : 'Habitação colonial (+5 limite de população)'}
                      </div>
                    </div>
                  </div>

                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 font-mono text-slate-300">
                    {Math.round(selectedBuilding.health)}/{selectedBuilding.maxHealth} HP
                  </span>
                </div>

                {/* Building Specific Actions & Training Queues */}
                {selectedBuilding.owner === playerSlot && (
                  <div className="mt-4 pt-3 border-t border-slate-800 space-y-3">
                    {/* Training Queue & Progress (for Town Center, Barracks, Dock) */}
                    {(selectedBuilding.type === 'town_center' ||
                      selectedBuilding.type === 'barracks' ||
                      selectedBuilding.type === 'dock') && (
                      <>
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          <span>Fila de Construção / Treino:</span>
                          {selectedBuilding.trainingQueue.length > 0 ? (
                            <span className="text-amber-400 font-mono font-bold flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                              {selectedBuilding.trainingQueue.length}/5 na fila
                            </span>
                          ) : (
                            <span className="text-slate-400 font-medium normal-case">0/5 vagas ocupadas</span>
                          )}
                        </div>

                        {selectedBuilding.trainingQueue.length > 0 && (
                          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-3 space-y-2.5 shadow-inner">
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2.5">
                                {selectedBuilding.trainingQueue[0].unitType === 'soldier' ? (
                                  <div className="p-1.5 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30">
                                    <Sword className="w-4 h-4" />
                                  </div>
                                ) : selectedBuilding.trainingQueue[0].unitType === 'cavalry' ? (
                                  <div className="p-1.5 rounded-xl bg-amber-600/20 text-amber-400 border border-amber-500/30">
                                    <PawPrint className="w-4 h-4" />
                                  </div>
                                ) : selectedBuilding.trainingQueue[0].unitType === 'warship' ? (
                                  <div className="p-1.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                    <Anchor className="w-4 h-4" />
                                  </div>
                                ) : selectedBuilding.trainingQueue[0].unitType === 'fishing_boat' ||
                                  selectedBuilding.trainingQueue[0].unitType === 'trade_boat' ? (
                                  <div className="p-1.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                    <Compass className="w-4 h-4" />
                                  </div>
                                ) : (
                                  <div className="p-1.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                    <Users className="w-4 h-4" />
                                  </div>
                                )}
                                <div>
                                  <div className="font-bold text-white text-xs">
                                    {selectedBuilding.trainingQueue[0].unitType === 'soldier'
                                      ? 'Soldado Mosqueteiro'
                                      : selectedBuilding.trainingQueue[0].unitType === 'cavalry'
                                      ? 'Cavalaria Montada'
                                      : selectedBuilding.trainingQueue[0].unitType === 'fishing_boat'
                                      ? 'Barco de Pesca Fluvial'
                                      : selectedBuilding.trainingQueue[0].unitType === 'trade_boat'
                                      ? 'Barco Mercante de Rio'
                                      : selectedBuilding.trainingQueue[0].unitType === 'warship'
                                      ? 'Barco de Guerra'
                                      : 'Aldeão Construtor'}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    ~{Math.max(1, Math.ceil((100 - selectedBuilding.trainingQueue[0].progress) / (2 * 20)))}s restantes
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-xs text-amber-400 font-mono font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                                  {Math.round(selectedBuilding.trainingQueue[0].progress)}%
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCancelTrain(selectedBuilding.id, 0)}
                                  className="p-1 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-300 border border-slate-700 hover:border-red-500/40 transition-colors text-[11px]"
                                  title="Cancelar e reembolsar recursos"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="w-full h-2.5 bg-slate-950 rounded-full p-0.5 border border-slate-800 overflow-hidden relative shadow-inner">
                              <div
                                className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 rounded-full transition-all duration-100 ease-out shadow-[0_0_8px_rgba(245,158,11,0.5)] relative overflow-hidden"
                                style={{ width: `${Math.min(100, Math.max(0, selectedBuilding.trainingQueue[0].progress))}%` }}
                              >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
                              </div>
                            </div>

                            <div className="pt-1 border-t border-slate-800/80">
                              <div className="text-[10px] text-slate-400 mb-1.5 font-medium flex items-center justify-between">
                                <span>Próximos na Fila (Clique no X para cancelar):</span>
                                <span>{selectedBuilding.trainingQueue.length}/5 slots</span>
                              </div>
                              <div className="grid grid-cols-5 gap-1.5">
                                {[0, 1, 2, 3, 4].map((slotIdx) => {
                                  const item = selectedBuilding.trainingQueue[slotIdx];
                                  if (!item) {
                                    return (
                                      <div
                                        key={slotIdx}
                                        className="h-10 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 flex items-center justify-center text-[10px] text-slate-600 font-mono"
                                      >
                                        #{slotIdx + 1}
                                      </div>
                                    );
                                  }

                                  const isFirst = slotIdx === 0;
                                  return (
                                    <div
                                      key={slotIdx}
                                      className={`h-10 rounded-xl border p-1 relative flex items-center justify-between transition-all ${
                                        isFirst
                                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-sm'
                                          : 'bg-slate-800/80 border-slate-700/80 text-slate-200'
                                      }`}
                                    >
                                      <div className="flex items-center gap-1 pl-0.5">
                                        <span className="text-[10px] font-bold font-mono">#{slotIdx + 1}</span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleCancelTrain(selectedBuilding.id, slotIdx)}
                                        className="p-1 rounded-md bg-slate-900/80 hover:bg-red-500 text-slate-400 hover:text-white transition-colors"
                                        title="Cancelar treino"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Recruitment Action Buttons by Building Type */}
                    <div className="space-y-2">
                      {/* Town Center Recruitment */}
                      {selectedBuilding.type === 'town_center' && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={
                              myResources.food < 50 ||
                              selectedBuilding.trainingQueue.length >= 5 ||
                              myResources.pop + totalQueuedForPlayer >= myResources.maxPop
                            }
                            onClick={() => handleTrainUnit('villager', 1)}
                            className={`flex-1 p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                              myResources.food >= 50 &&
                              selectedBuilding.trainingQueue.length < 5 &&
                              myResources.pop + totalQueuedForPlayer < myResources.maxPop
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold border-amber-400 shadow-md shadow-amber-500/10 hover:scale-[1.01]'
                                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                          >
                            <Users className="w-4 h-4" />
                            <span>Treinar Aldeão (50 Comida) [V]</span>
                          </button>

                          <button
                            type="button"
                            disabled={
                              myResources.food < 50 ||
                              selectedBuilding.trainingQueue.length >= 5 ||
                              myResources.pop + totalQueuedForPlayer >= myResources.maxPop
                            }
                            onClick={() => handleTrainUnit('villager', 5)}
                            className={`px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                              myResources.food >= 50 &&
                              selectedBuilding.trainingQueue.length < 5 &&
                              myResources.pop + totalQueuedForPlayer < myResources.maxPop
                                ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700'
                                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                            title="Enfileirar múltiplos aldeões até lotar a fila"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+5</span>
                          </button>
                        </div>
                      )}

                      {/* Barracks Recruitment */}
                      {selectedBuilding.type === 'barracks' && (
                        <>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={
                              myResources.food < 80 ||
                              (myResources.gold || 0) < 40 ||
                              selectedBuilding.trainingQueue.length >= 5 ||
                              myResources.pop + totalQueuedForPlayer >= myResources.maxPop
                            }
                            onClick={() => handleTrainUnit('soldier', 1)}
                            className={`flex-1 p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                              myResources.food >= 80 &&
                              (myResources.gold || 0) >= 40 &&
                              selectedBuilding.trainingQueue.length < 5 &&
                              myResources.pop + totalQueuedForPlayer < myResources.maxPop
                                ? 'bg-red-600 hover:bg-red-500 text-white font-bold border-red-500 shadow-md shadow-red-600/10 hover:scale-[1.01]'
                                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                          >
                            <Sword className="w-4 h-4" />
                            <span>Treinar Mosqueteiro (80 Alim + 40 Ouro) [S]</span>
                          </button>

                          <button
                            type="button"
                            disabled={
                              myResources.food < 80 ||
                              (myResources.gold || 0) < 40 ||
                              selectedBuilding.trainingQueue.length >= 5 ||
                              myResources.pop + totalQueuedForPlayer >= myResources.maxPop
                            }
                            onClick={() => handleTrainUnit('soldier', 5)}
                            className={`px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                              myResources.food >= 80 &&
                              (myResources.gold || 0) >= 40 &&
                              selectedBuilding.trainingQueue.length < 5 &&
                              myResources.pop + totalQueuedForPlayer < myResources.maxPop
                                ? 'bg-slate-800 hover:bg-slate-700 text-red-300 border-slate-700'
                                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                            title="Enfileirar múltiplos mosqueteiros"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+5</span>
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={
                              !canAfford(myResources, UNIT_COSTS.cavalry) ||
                              selectedBuilding.trainingQueue.length >= 5 ||
                              myResources.pop + totalQueuedForPlayer >= myResources.maxPop
                            }
                            onClick={() => handleTrainUnit('cavalry', 1)}
                            className={`flex-1 p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                              canAfford(myResources, UNIT_COSTS.cavalry) &&
                              selectedBuilding.trainingQueue.length < 5 &&
                              myResources.pop + totalQueuedForPlayer < myResources.maxPop
                                ? 'bg-amber-700 hover:bg-amber-800 text-white font-bold border-amber-500 shadow-md shadow-amber-700/10 hover:scale-[1.01]'
                                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                          >
                            <PawPrint className="w-4 h-4" />
                            <span>Treinar Cavalaria (60 Alim + 80 Ouro) [G]</span>
                          </button>

                          <button
                            type="button"
                            disabled={
                              !canAfford(myResources, UNIT_COSTS.cavalry) ||
                              selectedBuilding.trainingQueue.length >= 5 ||
                              myResources.pop + totalQueuedForPlayer >= myResources.maxPop
                            }
                            onClick={() => handleTrainUnit('cavalry', 5)}
                            className={`px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                              canAfford(myResources, UNIT_COSTS.cavalry) &&
                              selectedBuilding.trainingQueue.length < 5 &&
                              myResources.pop + totalQueuedForPlayer < myResources.maxPop
                                ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700'
                                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                            title="Enfileirar múltiplas unidades de cavalaria"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+5</span>
                          </button>
                        </div>
                        </>
                      )}

                      {/* Dock Naval Shipyard Construction */}
                      {selectedBuilding.type === 'dock' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={
                              !canAfford(myResources, UNIT_COSTS.fishing_boat) ||
                              selectedBuilding.trainingQueue.length >= 5 ||
                              myResources.pop + totalQueuedForPlayer >= myResources.maxPop
                            }
                            onClick={() => handleTrainUnit('fishing_boat', 1)}
                            className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${
                              canAfford(myResources, UNIT_COSTS.fishing_boat) &&
                              selectedBuilding.trainingQueue.length < 5 &&
                              myResources.pop + totalQueuedForPlayer < myResources.maxPop
                                ? 'bg-blue-600 hover:bg-blue-500 text-white font-bold border-blue-400 shadow-md shadow-blue-500/10 hover:scale-[1.01]'
                                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Compass className="w-4 h-4 text-cyan-300" />
                              <span>Barco de Pesca [P]</span>
                            </div>
                            <span className="font-mono text-[11px] text-cyan-200">{describeCost(UNIT_COSTS.fishing_boat)}</span>
                          </button>

                          <button
                            type="button"
                            disabled={
                              !canAfford(myResources, UNIT_COSTS.trade_boat) ||
                              selectedBuilding.trainingQueue.length >= 5 ||
                              myResources.pop + totalQueuedForPlayer >= myResources.maxPop
                            }
                            onClick={() => handleTrainUnit('trade_boat', 1)}
                            className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${
                              canAfford(myResources, UNIT_COSTS.trade_boat) &&
                              selectedBuilding.trainingQueue.length < 5 &&
                              myResources.pop + totalQueuedForPlayer < myResources.maxPop
                                ? 'bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-md shadow-amber-500/10 hover:scale-[1.01]'
                                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-yellow-200" />
                              <span>Barco Mercante [M]</span>
                            </div>
                            <span className="font-mono text-[11px] text-yellow-200">{describeCost(UNIT_COSTS.trade_boat)}</span>
                          </button>

                          <button
                            type="button"
                            disabled={
                              !canAfford(myResources, UNIT_COSTS.warship) ||
                              selectedBuilding.trainingQueue.length >= 5 ||
                              myResources.pop + totalQueuedForPlayer >= myResources.maxPop
                            }
                            onClick={() => handleTrainUnit('warship', 1)}
                            className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${
                              canAfford(myResources, UNIT_COSTS.warship) &&
                              selectedBuilding.trainingQueue.length < 5 &&
                              myResources.pop + totalQueuedForPlayer < myResources.maxPop
                                ? 'bg-rose-700 hover:bg-rose-600 text-white font-bold border-rose-400 shadow-md shadow-rose-500/10 hover:scale-[1.01]'
                                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Anchor className="w-4 h-4 text-rose-200" />
                              <span>Barco de Guerra [G]</span>
                            </div>
                            <span className="font-mono text-[11px] text-rose-200">{describeCost(UNIT_COSTS.warship)}</span>
                          </button>
                        </div>
                      )}

                      {/* Building Maintenance: reparo e demolicao */}
                      <div className="space-y-2">
                        {selectedBuilding.health < selectedBuilding.maxHealth && (
                          <button
                            type="button"
                            disabled={!nearestVillagerToSelectedBuilding}
                            onClick={() => {
                              if (nearestVillagerToSelectedBuilding) {
                                handleRepairBuilding(nearestVillagerToSelectedBuilding.id, selectedBuilding.id);
                              }
                            }}
                            className="w-full p-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-900 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-2 transition-all"
                          >
                            <Wrench className="w-4 h-4" />
                            <span>
                              Reparar ({REPAIR_HP_PER_TICK * 20} HP/s · {REPAIR_WOOD_PER_HP * 100} M por 100 HP)
                            </span>
                          </button>
                        )}
                        {selectedBuilding.type !== 'town_center' && (
                          <button
                            type="button"
                            onClick={() => handleDemolishBuilding(selectedBuilding.id)}
                            className="w-full p-2.5 rounded-xl bg-slate-800 hover:bg-red-900/70 border border-slate-700 hover:border-red-500/60 text-slate-300 hover:text-red-200 font-semibold text-xs flex items-center justify-center gap-2 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Demolir (devolve 50%)</span>
                          </button>
                        )}
                      </div>

                      {/* Grand Market Hub Actions */}
                      {selectedBuilding.type === 'market' && (
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => setIsEmpireCatalogOpen(true)}
                            className="w-full p-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.01]"
                          >
                            <Sparkles className="w-4 h-4" />
                            <span>Abrir Mercadão de Câmbio de Recursos & Catálogo [M]</span>
                          </button>
                          <p className="text-[11px] text-slate-400 text-center">
                            Gera renda passiva municipal (+1 ouro/segundo) e permite comprar/vender recursos excedentes.
                          </p>
                        </div>
                      )}

                      {/* Farm Information Status */}
                      {selectedBuilding.type === 'farm' && (
                        <div className="p-3 rounded-xl bg-lime-950/40 border border-lime-800/60 text-lime-300 text-xs flex items-center gap-2.5">
                          <Sprout className="w-5 h-5 text-lime-400 shrink-0" />
                          <div>
                            <div className="font-bold">Colheita Agrícola Sustentável em Operação</div>
                            <div className="text-[10px] text-lime-400/80">
                              Gera automaticamente +2 alimento/segundo de forma perene sem esgotar o talhão.
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Sawmill Information Status */}
                      {selectedBuilding.type === 'sawmill' && (
                        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2.5">
                          <TreePine className="w-5 h-5 text-emerald-400 shrink-0" />
                          <div>
                            <div className="font-bold">Oficina de Corte Ativa (+35% Coleta de Madeira)</div>
                            <div className="text-[10px] text-emerald-400/80">
                              Todos os lenhadores da colônia colhem madeira com velocidade amplificada.
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Mine Information Status */}
                      {selectedBuilding.type === 'mine' && (
                        <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs flex items-center gap-2.5">
                          <Coins className="w-5 h-5 text-amber-400 shrink-0" />
                          <div>
                            <div className="font-bold">Pedreira & Forja Operacional (+40% Extração)</div>
                            <div className="text-[10px] text-amber-400/80">
                              Aumenta em 40% a taxa de rendimento de extração de jazidas de minério de ouro.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Resource Node Selected */}
            {selectedResource && (
              <div className="space-y-4">
                {/* Header Information */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-inner ${
                        selectedResource.type === 'tree'
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : selectedResource.type === 'gold_mine'
                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                          : selectedResource.type === 'stone'
                          ? 'bg-slate-500/15 border-slate-400/30 text-slate-300'
                          : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                      }`}
                    >
                      {selectedResource.type === 'tree' ? (
                        selectedResource.isRegrowing ? (
                          <Sprout className="w-6 h-6 animate-pulse" />
                        ) : (
                          <TreePine className="w-6 h-6" />
                        )
                      ) : selectedResource.type === 'gold_mine' ? (
                        <Coins className="w-6 h-6" />
                      ) : selectedResource.type === 'stone' ? (
                        <Pickaxe className="w-6 h-6" />
                      ) : (
                        <Apple className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-white">
                          {selectedResource.type === 'tree'
                            ? selectedResource.harvestMode === 'sustainable'
                              ? 'Bosque Sustentável (Reflorestamento)'
                              : 'Floresta de Madeira (Desmatamento)'
                            : selectedResource.type === 'gold_mine'
                            ? 'Jazida de Minério de Ouro'
                            : selectedResource.type === 'stone'
                            ? 'Pedreira de Pedra Bruta'
                            : 'Arbusto de Frutas Silvestres'}
                        </h3>
                        {selectedResource.isRegrowing && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 animate-pulse">
                            Em Crescimento
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>
                          {selectedResource.isRegrowing
                            ? `Muda em desenvolvimento (${Math.round(selectedResource.regrowthProgress || 0)}% completo)`
                            : selectedResource.type === 'tree'
                            ? 'Madeira para habitações, quartéis e torres'
                            : selectedResource.type === 'gold_mine'
                            ? 'Ouro nobre para infantaria e fortificações'
                            : selectedResource.type === 'stone'
                            ? 'Pedra bruta para pedreiras, torres e muralhas'
                            : 'Alimento rápido para recrutar novos colonos'}
                        </span>
                        <span>•</span>
                        <span className="text-amber-400 font-medium font-mono">
                          {activeGatherersOnSelectedResource} Aldeão(ões) colhendo
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 uppercase font-medium">Reserva</div>
                    <div
                      className={`text-lg font-mono font-bold ${
                        selectedResource.type === 'tree'
                          ? 'text-emerald-400'
                          : selectedResource.type === 'gold_mine'
                          ? 'text-amber-400'
                          : selectedResource.type === 'stone'
                          ? 'text-slate-300'
                          : 'text-rose-400'
                      }`}
                    >
                      {selectedResource.isRegrowing
                        ? `${Math.round(selectedResource.regrowthProgress || 0)}%`
                        : `${Math.round(selectedResource.remaining)}/${selectedResource.maxCapacity || (selectedResource.type === 'tree' ? 150 : selectedResource.type === 'gold_mine' ? 600 : selectedResource.type === 'stone' ? 700 : 350)}`}
                    </div>
                  </div>
                </div>

                {/* Specific Forestry Controls for Trees */}
                {selectedResource.type === 'tree' && (
                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    {/* Grove Cluster Overview & Status */}
                    <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-white">
                          <TreePine className="w-4 h-4 text-emerald-400" />
                          <span>{selectedResource.clusterName || 'Bosque Nativo'}</span>
                        </div>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                          {groveTrees.length} árvores no bosque
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="p-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
                          <div className="text-[10px] text-slate-400">Maduras</div>
                          <div className="font-mono font-bold text-emerald-400">{matureGroveCount}</div>
                        </div>
                        <div className="p-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
                          <div className="text-[10px] text-slate-400">Em Mudas</div>
                          <div className="font-mono font-bold text-green-300">{regrowingGroveCount}</div>
                        </div>
                        <div className="p-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
                          <div className="text-[10px] text-slate-400">Modo Bosque</div>
                          <div className={`font-mono font-bold ${isGroveAllSustainable ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {isGroveAllSustainable ? 'Sustentável' : 'Misto / Corte'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Grove-Wide Reforestation vs Clear-Cut Controls */}
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                        <span>Configuração de Reflorestamento:</span>
                        <span className="text-[10px] text-emerald-400 font-normal">Aplica a todas as {groveTrees.length} árvores</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleSetGroveHarvestMode(selectedResource.clusterId || selectedResource.id, 'sustainable')}
                          className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                            isGroveAllSustainable
                              ? 'bg-emerald-500/25 border-emerald-500 text-white shadow-md shadow-emerald-500/20 ring-1 ring-emerald-400'
                              : 'bg-emerald-950/40 hover:bg-emerald-900/40 border-emerald-600/40 text-emerald-200'
                          }`}
                          title="Garante que TODAS as árvores deste bosque renasçam como mudas após o corte"
                        >
                          <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-300">
                            <Sprout className="w-4 h-4 text-emerald-400" />
                            <span>Reflorestar Todo o Bosque</span>
                          </div>
                          <span className="text-[10px] text-emerald-300/80 leading-tight">
                            Todas as {groveTrees.length} árvores brotam mudas e regeneram continuamente madeira!
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSetGroveHarvestMode(selectedResource.clusterId || selectedResource.id, 'clear_cut')}
                          className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                            !isGroveAllSustainable
                              ? 'bg-amber-500/20 border-amber-500 text-white shadow-sm'
                              : 'bg-slate-900/80 hover:bg-slate-800 border-slate-800 text-slate-400'
                          }`}
                          title="Remove permanentemente as árvores deste bosque para liberar terreno"
                        >
                          <div className="flex items-center gap-1.5 font-bold text-xs text-amber-300">
                            <Trash2 className="w-4 h-4 text-amber-400" />
                            <span>Desmatar Todo o Bosque</span>
                          </div>
                          <span className="text-[10px] text-slate-400 leading-tight">
                            Corte definitivo sem replantio para liberar o chão da colônia.
                          </span>
                        </button>
                      </div>

                      {/* Single tree toggle */}
                      <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800">
                        <span className="text-slate-400 text-[11px]">Esta árvore selecionada:</span>
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleResourceHarvestMode(
                              selectedResource.id,
                              selectedResource.harvestMode === 'sustainable' ? 'clear_cut' : 'sustainable'
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                            selectedResource.harvestMode === 'sustainable'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {selectedResource.harvestMode === 'sustainable' ? (
                            <>
                              <Sprout className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Reflorestar (Muda Ativa)</span>
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-3.5 h-3.5 text-amber-400" />
                              <span>Desmatar (Sem Muda)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Visual Work Zone Radius & Shift Selector */}
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <Target className="w-4 h-4" />
                          <span>Seletor de Zona de Trabalho (Raio Limite):</span>
                        </span>
                        <span className="text-[10px] text-emerald-300 font-mono font-bold">
                          {gatherRadiusLimit >= 999 ? 'Busca Livre' : `Raio: ${gatherRadiusLimit} metros`}
                        </span>
                      </div>

                      <div className="p-3 rounded-2xl bg-slate-950/80 border border-emerald-500/30 space-y-2.5 text-xs shadow-inner">
                        {/* Interactive Range Slider */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span>Ajustar Raio da Zona:</span>
                            <span className="font-mono text-emerald-400 font-bold">
                              {gatherRadiusLimit >= 999 ? 'Infinito (Sem Limite)' : `${gatherRadiusLimit}m`}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="4"
                            max="40"
                            step="2"
                            value={Math.min(40, gatherRadiusLimit)}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setGatherRadiusLimit(val);
                            }}
                            className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Presets */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1">
                          {[
                            { r: 8, label: '8m', title: 'Bosque Estrito' },
                            { r: 14, label: '14m', title: 'Bosque Médio' },
                            { r: 22, label: '22m', title: 'Área Local' },
                            { r: 35, label: '35m', title: 'Setor Amplo' },
                            { r: 999, label: 'Livre', title: 'Todo Mapa' },
                          ].map((preset) => (
                            <button
                              key={preset.r}
                              type="button"
                              onClick={() => {
                                setGatherRadiusLimit(preset.r);
                                soundManager.playClickSound();
                                triggerNotification(
                                  `Raio da Zona de Trabalho definido para ${preset.r >= 999 ? 'Sem Limite' : `${preset.r}m`} (${preset.title}).`,
                                  'info'
                                );
                              }}
                              className={`py-1 px-1 rounded-xl text-center transition-all ${
                                gatherRadiusLimit === preset.r
                                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                              }`}
                              title={preset.title}
                            >
                              <div className="font-bold text-[10px]">{preset.label}</div>
                              <div className="text-[9px] opacity-75">{preset.title}</div>
                            </button>
                          ))}
                        </div>

                        {/* Live Coverage & Strict Leash Feedback */}
                        <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                          <span className="flex items-center gap-1 text-emerald-300">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>
                              {previewZone
                                ? `${previewZone.treesCovered} árvore(s) cobertas nesta zona`
                                : `${groveTrees.length} árvores no bosque`}
                            </span>
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 font-mono">
                            Trava Estrita no Raio
                          </span>
                        </div>
                      </div>

                      {/* Work Shift Duration (Optional Timer) */}
                      <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
                        <span className="text-[11px] text-slate-400">Turno de Coleta:</span>
                        <div className="flex gap-1">
                          {[
                            { s: 0, label: 'Contínuo' },
                            { s: 60, label: '1 min' },
                            { s: 120, label: '2 min' },
                            { s: 180, label: '3 min' },
                          ].map((t) => (
                            <button
                              key={t.s}
                              type="button"
                              onClick={() => {
                                setGatherShiftDuration(t.s);
                                soundManager.playClickSound();
                              }}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all ${
                                gatherShiftDuration === t.s
                                  ? 'bg-amber-500 text-slate-950 font-bold'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* If currently in regrowth */}
                    {selectedResource.isRegrowing ? (
                      <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between text-xs text-emerald-300">
                          <span className="flex items-center gap-1.5 font-bold">
                            <Sprout className="w-4 h-4 animate-bounce" /> Tempo de Crescimento da Muda:
                          </span>
                          <span className="font-mono font-bold">
                            {Math.round(selectedResource.regrowthProgress || 0)}%
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-950 rounded-full p-0.5 border border-slate-800 overflow-hidden relative">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full transition-all duration-100"
                            style={{ width: `${Math.min(100, Math.max(0, selectedResource.regrowthProgress || 0))}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-slate-400">
                          A muda está se desenvolvendo. Em poucos segundos a árvore estará adulta para nova extração!
                        </div>
                      </div>
                    ) : (
                      /* Dispatch Villagers Action Buttons */
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <button
                            type="button"
                            onClick={() => handleAssignVillagersToResource(selectedResource.id, 1)}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                            title="Enviar 1 aldeão livre para colher"
                          >
                            <Users className="w-3.5 h-3.5 text-amber-400" />
                            <span>+1 Aldeão</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleAssignVillagersToResource(selectedResource.id, 3)}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                            title="Enviar até 3 aldeões livres para colher"
                          >
                            <Users className="w-3.5 h-3.5 text-amber-400" />
                            <span>+3 Aldeões</span>
                          </button>

                          {selectedUnitsList.length > 0 && villagerCount > 0 && (
                            <button
                              type="button"
                              onClick={() => handleAssignSelectedSquadToResource(selectedResource.id)}
                              className="p-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                              title="Enviar aldeões atualmente selecionados no pelotão"
                            >
                              <Users className="w-3.5 h-3.5" />
                              <span>Pelotão ({villagerCount})</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleClearForestCluster(selectedResource.id)}
                            className="p-2 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-xs font-semibold text-emerald-200 flex items-center justify-center gap-1.5 transition-colors"
                            title="Marcar todas as árvores vizinhas para desmatamento e colheita em cadeia"
                          >
                            <TreePine className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Limpar Bosque</span>
                          </button>
                        </div>

                        {/* Immediate Clear Option */}
                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                          <span className="text-[11px] text-slate-400">Precisa desobstruir o chão agora?</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveResourceImmediately(selectedResource.id)}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-300 border border-slate-700 hover:border-red-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors"
                            title="Remover árvore imediatamente do mapa para posicionar construções"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            <span>Remover Árvore Agora</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Specific Gold Mine Controls */}
                {selectedResource.type === 'gold_mine' && (
                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleAssignVillagersToResource(selectedResource.id, 1)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Users className="w-3.5 h-3.5 text-amber-400" />
                        <span>+1 Minerador</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAssignVillagersToResource(selectedResource.id, 3)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Users className="w-3.5 h-3.5 text-amber-400" />
                        <span>+3 Mineradores</span>
                      </button>

                      {selectedUnitsList.length > 0 && villagerCount > 0 && (
                        <button
                          type="button"
                          onClick={() => handleAssignSelectedSquadToResource(selectedResource.id)}
                          className="p-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Pelotão ({villagerCount})</span>
                        </button>
                      )}
                    </div>

                    <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 flex items-start gap-2">
                      <Coins className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-amber-300 font-semibold block">Exploração Mineral Contínua:</strong>
                        <span>
                          Ao esgotar esta jazida de ouro, os aldeões automaticamente procuram e migram para o próximo filão mineral mais próximo.
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Specific Stone Quarry Controls */}
                {selectedResource.type === 'stone' && (
                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleAssignVillagersToResource(selectedResource.id, 1)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Users className="w-3.5 h-3.5 text-slate-300" />
                        <span>+1 Pedreiro</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAssignVillagersToResource(selectedResource.id, 3)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Users className="w-3.5 h-3.5 text-slate-300" />
                        <span>+3 Pedreiros</span>
                      </button>

                      {selectedUnitsList.length > 0 && villagerCount > 0 && (
                        <button
                          type="button"
                          onClick={() => handleAssignSelectedSquadToResource(selectedResource.id)}
                          className="p-2 rounded-xl bg-slate-400 hover:bg-slate-300 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Pelotão ({villagerCount})</span>
                        </button>
                      )}
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-700/20 border border-slate-600/40 text-xs text-slate-300/90 flex items-start gap-2">
                      <Pickaxe className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-200 font-semibold block">Extração Contínua de Pedra:</strong>
                        <span>
                          A Mineradora &amp; Pedreira dá +40% de rendimento. Ao esgotar esta pedreira, os aldeões migram para a próxima automaticamente.
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Specific Food Bush Controls */}
                {selectedResource.type === 'food_bush' && (
                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleAssignVillagersToResource(selectedResource.id, 1)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Users className="w-3.5 h-3.5 text-rose-400" />
                        <span>+1 Coletor</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAssignVillagersToResource(selectedResource.id, 3)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Users className="w-3.5 h-3.5 text-rose-400" />
                        <span>+3 Coletores</span>
                      </button>

                      {selectedUnitsList.length > 0 && villagerCount > 0 && (
                        <button
                          type="button"
                          onClick={() => handleAssignSelectedSquadToResource(selectedResource.id)}
                          className="p-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Pelotão ({villagerCount})</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          )
        )}
    </>
  );
}
