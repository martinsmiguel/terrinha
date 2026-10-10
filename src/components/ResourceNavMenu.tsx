/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Package,
  Hammer,
  Store,
  ChevronDown,
  Navigation,
  Sprout,
  Users,
  Castle,
  RefreshCw,
} from 'lucide-react';
import { PlayerResources } from '../game/engine';

interface ResourceNavMenuProps {
  resources: PlayerResources;
  activeGatherers: { wood: number; food: number; gold: number; fish: number; stone: number };
  idleVillagersCount: number;
  onSelectIdleVillager: () => void;
  onOpenCatalog: () => void;
  onOpenMarket: () => void;
  onJumpToResource: (type: 'tree' | 'gold_mine' | 'food_bush' | 'fish_school' | 'stone') => void;
  onQuickBuild: (type: 'house' | 'sawmill' | 'mine' | 'farm' | 'dock' | 'market') => void;
  onRegenerateProceduralMap?: () => void;
  isSustainableForestry: boolean;
  onToggleSustainableForestry: () => void;
}

export const ResourceNavMenu: React.FC<ResourceNavMenuProps> = ({
  resources,
  activeGatherers,
  idleVillagersCount,
  onSelectIdleVillager,
  onOpenCatalog,
  onOpenMarket,
  onJumpToResource,
  onQuickBuild,
  onRegenerateProceduralMap,
  isSustainableForestry,
  onToggleSustainableForestry,
}) => {
  const [activeFlyout, setActiveFlyout] = useState<'wood' | 'food' | 'gold' | 'fish' | 'pop' | null>(null);

  const toggleFlyout = (key: 'wood' | 'food' | 'gold' | 'fish' | 'pop') => {
    setActiveFlyout((curr) => (curr === key ? null : key));
  };

  return (
    <div className="relative pointer-events-auto flex flex-wrap max-w-full items-center gap-1.5 sm:gap-2.5">
      {/* 1. WOOD NAV CARD */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleFlyout('wood')}
          aria-expanded={activeFlyout === 'wood'}
          aria-label="Madeira"
          className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-2xl border transition-all ${
            activeFlyout === 'wood'
              ? 'bg-amber-950/90 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)] text-amber-200'
              : 'bg-slate-950/90 hover:bg-slate-900 border-slate-800 hover:border-amber-500/50 text-slate-200'
          }`}
        >
          {/* Wood Log SVG Icon */}
          <div className="w-5 h-5 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Package className="w-3.5 h-3.5" />
          </div>
          <div className="text-left">
            <div className="text-[9px] text-amber-400/80 font-semibold uppercase tracking-wider flex items-center gap-1">
              <span>Madeira</span>
              <span className="hidden sm:inline text-[8px] font-mono text-slate-400">({activeGatherers.wood} coletando)</span>
            </div>
            <div className="text-xs sm:text-sm font-mono font-bold text-amber-300">
              {Math.floor(resources.wood)}
            </div>
          </div>
          <ChevronDown className="hidden sm:block w-3 h-3 text-slate-400 ml-0.5" />
        </button>

        {/* Wood Flyout Drawer */}
        {activeFlyout === 'wood' && (
          <div className="max-sm:fixed max-sm:inset-x-2 max-sm:top-28 max-sm:w-auto absolute top-full left-0 mt-2 w-56 p-3 rounded-2xl bg-slate-950/95 border border-amber-500/60 shadow-2xl backdrop-blur-xl z-50 text-xs space-y-2 animate-fade-in">
            <div className="font-bold text-amber-300 flex items-center justify-between pb-1 border-b border-slate-800">
              <span>Gestão de Madeira</span>
              <span className="text-[10px] text-slate-400">{activeGatherers.wood} lenhadores</span>
            </div>
            <div className="text-[11px] text-slate-300 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Refino na Serralheria:</span>
                <span className="text-amber-400 font-bold">+35% Coleta</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Silvicultura Sustentável:</span>
                <span className={isSustainableForestry ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                  {isSustainableForestry ? 'Ativa' : 'Desligada'}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 grid grid-cols-1 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onJumpToResource('tree');
                  setActiveFlyout(null);
                }}
                className="w-full py-1.5 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-amber-400 text-amber-200 flex items-center justify-between transition-colors"
              >
                <span>Focar Bosque Mais Próximo</span>
                <Navigation className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onQuickBuild('sawmill');
                  setActiveFlyout(null);
                }}
                className="w-full py-1.5 px-2.5 rounded-xl bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/50 text-amber-200 flex items-center justify-between transition-colors font-semibold"
              >
                <span>Construir Serralheria [R]</span>
                <Hammer className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={onToggleSustainableForestry}
                className="w-full py-1 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-[10px] text-slate-400 hover:text-emerald-300 flex items-center justify-between transition-colors"
              >
                <span>Alternar Replanto de Mudas</span>
                <Sprout className="w-3 h-3 text-emerald-400" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. FOOD / AGRICULTURE NAV CARD */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleFlyout('food')}
          aria-expanded={activeFlyout === 'food'}
          aria-label="Alimento"
          className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-2xl border transition-all ${
            activeFlyout === 'food'
              ? 'bg-red-950/90 border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.25)] text-red-200'
              : 'bg-slate-950/90 hover:bg-slate-900 border-slate-800 hover:border-red-500/50 text-slate-200'
          }`}
        >
          {/* Wheat SVG */}
          <div className="w-5 h-5 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 20h10M12 20V10M12 10a5 5 0 0 1 5-5M12 10a5 5 0 0 0-5-5" />
            </svg>
          </div>
          <div className="text-left">
            <div className="text-[9px] text-red-400/80 font-semibold uppercase tracking-wider flex items-center gap-1">
              <span>Alimento</span>
              <span className="hidden sm:inline text-[8px] font-mono text-slate-400">({activeGatherers.food} coletando)</span>
            </div>
            <div className="text-xs sm:text-sm font-mono font-bold text-red-300">
              {Math.floor(resources.food)}
            </div>
          </div>
          <ChevronDown className="hidden sm:block w-3 h-3 text-slate-400 ml-0.5" />
        </button>

        {/* Food Flyout */}
        {activeFlyout === 'food' && (
          <div className="max-sm:fixed max-sm:inset-x-2 max-sm:top-28 max-sm:w-auto absolute top-full left-0 mt-2 w-60 p-3 rounded-2xl bg-slate-950/95 border border-red-500/60 shadow-2xl backdrop-blur-xl z-50 text-xs space-y-2 animate-fade-in">
            <div className="font-bold text-red-300 flex items-center justify-between pb-1 border-b border-slate-800">
              <span>Suprimento de Alimentos</span>
              <span className="text-[10px] text-slate-400">{activeGatherers.food} colonos</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Alimente colonos com pomares, fazendas de cereais cultivadas e pesca fluvial.
            </p>

            <div className="pt-2 border-t border-slate-800 grid grid-cols-1 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onJumpToResource('food_bush');
                  setActiveFlyout(null);
                }}
                className="w-full py-1.5 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-red-400 text-red-200 flex items-center justify-between transition-colors"
              >
                <span>Focar Pomar de Bagas</span>
                <Navigation className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onQuickBuild('farm');
                  setActiveFlyout(null);
                }}
                className="w-full py-1.5 px-2.5 rounded-xl bg-red-600/30 hover:bg-red-600/50 border border-red-500/50 text-red-200 flex items-center justify-between transition-colors font-semibold"
              >
                <span>Construir Fazenda [F]</span>
                <Hammer className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. FISHING & RIVER NAV CARD */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleFlyout('fish')}
          aria-expanded={activeFlyout === 'fish'}
          aria-label="Rio e pesca"
          className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-2xl border transition-all ${
            activeFlyout === 'fish'
              ? 'bg-blue-950/90 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.25)] text-blue-200'
              : 'bg-slate-950/90 hover:bg-slate-900 border-slate-800 hover:border-blue-500/50 text-slate-200'
          }`}
        >
          {/* Fish SVG */}
          <div className="w-5 h-5 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 12c3-4 8-4 11 0-3 4-8 4-11 0zM13 12c3-3 7-2 9 0-2 2-6 3-9 0zM12 9a3 3 0 0 1 3 3" />
            </svg>
          </div>
          <div className="text-left">
            <div className="text-[9px] text-blue-400/80 font-semibold uppercase tracking-wider flex items-center gap-1">
              <span>Rio & Pesca</span>
              <span className="hidden sm:inline text-[8px] font-mono text-slate-400">({activeGatherers.fish} coletando)</span>
            </div>
            <div className="text-xs sm:text-sm font-mono font-bold text-blue-300">
              Cardumes
            </div>
          </div>
          <ChevronDown className="hidden sm:block w-3 h-3 text-slate-400 ml-0.5" />
        </button>

        {/* Fish Flyout */}
        {activeFlyout === 'fish' && (
          <div className="max-sm:fixed max-sm:inset-x-2 max-sm:top-28 max-sm:w-auto absolute top-full left-0 mt-2 w-64 p-3 rounded-2xl bg-slate-950/95 border border-blue-500/60 shadow-2xl backdrop-blur-xl z-50 text-xs space-y-2 animate-fade-in">
            <div className="font-bold text-blue-300 flex items-center justify-between pb-1 border-b border-slate-800">
              <span>Exploração Fluvial & Barcos</span>
              <span className="text-[10px] text-slate-400">{activeGatherers.fish} barcos</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Construa um Cais nas margens do rio para encomendar Barcos de Pesca e Barcos Mercantes que navegam pelo canal!
            </p>

            <div className="pt-2 border-t border-slate-800 grid grid-cols-1 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onJumpToResource('fish_school');
                  setActiveFlyout(null);
                }}
                className="w-full py-1.5 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-blue-400 text-blue-200 flex items-center justify-between transition-colors"
              >
                <span>Focar Cardume no Rio</span>
                <Navigation className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onQuickBuild('dock');
                  setActiveFlyout(null);
                }}
                className="w-full py-1.5 px-2.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/50 text-blue-200 flex items-center justify-between transition-colors font-semibold"
              >
                <span>Construir Cais Naval [B]</span>
                <Hammer className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. GOLD & MINING NAV CARD */}
      <div className="relative">
        <button
          type="button"
          onClick={() => toggleFlyout('gold')}
          aria-expanded={activeFlyout === 'gold'}
          aria-label="Ouro e minério"
          className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-2xl border transition-all ${
            activeFlyout === 'gold'
              ? 'bg-yellow-950/90 border-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.25)] text-yellow-200'
              : 'bg-slate-950/90 hover:bg-slate-900 border-slate-800 hover:border-yellow-500/50 text-slate-200'
          }`}
        >
          {/* Gold Coin SVG */}
          <div className="w-5 h-5 rounded-lg bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center text-yellow-400">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="9" />
            </svg>
          </div>
          <div className="text-left">
            <div className="text-[9px] text-yellow-400/80 font-semibold uppercase tracking-wider flex items-center gap-1">
              <span>Ouro & Minério</span>
              <span className="hidden sm:inline text-[8px] font-mono text-slate-400">({activeGatherers.gold} coletando)</span>
            </div>
            <div className="text-xs sm:text-sm font-mono font-bold text-yellow-300">
              {Math.floor(resources.gold)}
            </div>
          </div>
          <ChevronDown className="hidden sm:block w-3 h-3 text-slate-400 ml-0.5" />
        </button>

        {/* Gold Flyout */}
        {activeFlyout === 'gold' && (
          <div className="max-sm:fixed max-sm:inset-x-2 max-sm:top-28 max-sm:w-auto absolute top-full left-0 mt-2 w-60 p-3 rounded-2xl bg-slate-950/95 border border-yellow-500/60 shadow-2xl backdrop-blur-xl z-50 text-xs space-y-2 animate-fade-in">
            <div className="font-bold text-yellow-300 flex items-center justify-between pb-1 border-b border-slate-800">
              <span>Riqueza Mineral & Forja</span>
              <span className="text-[10px] text-slate-400">{activeGatherers.gold} mineradores</span>
            </div>
            <p className="text-[11px] text-slate-400">
              A Mineradora dá +40% de rendimento aos veios de ouro e pedra nas colinas.
            </p>

            <div className="flex items-center justify-between px-1 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] text-slate-400">Pedra bruta</span>
              <span className="font-mono font-bold text-slate-200">
                {Math.floor(resources.stone)}{' '}
                <span className="text-[10px] text-slate-400">({activeGatherers.stone} pedreiros)</span>
              </span>
            </div>

            <div className="pt-2 border-t border-slate-800 grid grid-cols-1 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onJumpToResource('gold_mine');
                  setActiveFlyout(null);
                }}
                className="w-full py-1.5 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-yellow-400 text-yellow-200 flex items-center justify-between transition-colors"
              >
                <span>Focar Veio Mineral</span>
                <Navigation className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onJumpToResource('stone');
                  setActiveFlyout(null);
                }}
                className="w-full py-1.5 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-400 text-slate-200 flex items-center justify-between transition-colors"
              >
                <span>Focar Pedreira</span>
                <Navigation className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onQuickBuild('mine');
                  setActiveFlyout(null);
                }}
                className="w-full py-1.5 px-2.5 rounded-xl bg-yellow-600/30 hover:bg-yellow-600/50 border border-yellow-500/50 text-yellow-200 flex items-center justify-between transition-colors font-semibold"
              >
                <span>Construir Mineradora [T]</span>
                <Hammer className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. POPULATION & EMPIRE CITIZENS */}
      <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-2xl bg-slate-950/90 border border-slate-800">
        <Users className="w-4 h-4 text-blue-400" />
        <div className="text-left font-mono">
          <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">População</div>
          <div className="text-xs sm:text-sm font-bold text-blue-300">
            {resources.pop}/{resources.maxPop}
          </div>
        </div>

        {/* 1-Click Select Idle Villager Button */}
        {idleVillagersCount > 0 && (
          <button
            type="button"
            onClick={onSelectIdleVillager}
            className="ml-1 px-2 py-1 min-h-6 max-sm:min-h-8 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-[10px] font-bold text-amber-300 flex items-center gap-1"
            title="Selecionar Aldeão Ocioso"
          >
            <span>{idleVillagersCount} Ocioso</span>
          </button>
        )}
      </div>

      {/* 6. EMPIRE CATALOG BUTTON (SKYCITY / IKARIAM / AOE2 STYLE) */}
      <button
        type="button"
        onClick={onOpenCatalog}
        className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-xs shadow-lg hover:shadow-amber-500/25 active:scale-95 transition-all border border-amber-400/40"
        title="Abrir Catálogo de Possibilidades do Império (Tecla K)"
      >
        <Castle className="w-4 h-4 text-amber-200" />
        <span className="hidden md:inline">Catálogo do Império</span>
        <kbd className="hidden lg:inline text-[9px] px-1 py-0.2 rounded bg-black/30 font-mono text-amber-200">K</kbd>
      </button>

      {/* 7. GRAND MARKET BUTTON */}
      <button
        type="button"
        onClick={onOpenMarket}
        className="flex items-center gap-1.5 px-2.5 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-yellow-300 font-bold text-xs border border-yellow-500/30 hover:border-yellow-400 transition-all"
        title="Abrir Mercadão (Trocas de Recursos)"
      >
        <Store className="w-4 h-4 text-yellow-400" />
        <span className="hidden lg:inline">Mercadão</span>
      </button>

      {/* 8. PROCEDURAL MAP REGENERATE BUTTON */}
      {onRegenerateProceduralMap && (
        <button
          type="button"
          onClick={onRegenerateProceduralMap}
          className="p-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 hover:border-emerald-400 transition-all"
          title="Gerar Novo Mapa Procedural (Novo Rio & Vales)"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
