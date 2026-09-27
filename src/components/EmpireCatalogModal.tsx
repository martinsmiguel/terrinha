/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  Package,
  Hammer,
  Home,
  Shield,
  Castle,
  Coins,
  ArrowRight,
  TrendingUp,
  Store,
  Compass,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { BUILDING_CATALOG, BuildingType } from '../game/buildingDefs';
import { PlayerResources } from '../game/engine';

interface EmpireCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerResources: PlayerResources;
  onTradeResource: (type: 'wood' | 'food' | 'stone', action: 'buy' | 'sell', amount: number) => void;
  onSelectBuildingToBuild: (type: BuildingType) => void;
  activeGatherersCount: { wood: number; food: number; gold: number; fish: number };
}

export const EmpireCatalogModal: React.FC<EmpireCatalogModalProps> = ({
  isOpen,
  onClose,
  playerResources,
  onTradeResource,
  onSelectBuildingToBuild,
  activeGatherersCount,
}) => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'chains' | 'market' | 'stats'>('catalog');
  const [tradeAmount, setTradeAmount] = useState<number>(50);

  if (!isOpen) return null;

  // Market Prices (Dynamic feel inspired by AoE2 / Ikariam)
  const marketRates = {
    wood: { buyPrice: 50, sellPrice: 35 },
    food: { buyPrice: 55, sellPrice: 38 },
    stone: { buyPrice: 70, sellPrice: 48 },
  };

  const buildingList: BuildingType[] = [
    'house',
    'barracks',
    'tower',
    'sawmill',
    'mine',
    'market',
    'farm',
    'dock',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-950/95 border-2 border-amber-600/70 rounded-3xl shadow-[0_0_50px_rgba(217,119,6,0.25)] overflow-hidden">
        {/* Heraldic AoE2 / SkyCity Ornate Top Banner */}
        <div className="relative px-6 py-4 bg-gradient-to-r from-amber-950/90 via-slate-900 to-amber-950/90 border-b border-amber-500/40 flex items-center justify-between">
          {/* Ornate Corner Accents */}
          <div className="absolute top-1 left-1 text-amber-500/40 text-xs">╔══</div>
          <div className="absolute top-1 right-1 text-amber-500/40 text-xs">══╗</div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center shadow-inner">
              {/* SVG Heraldic Crown / Empire Crest */}
              <svg className="w-6 h-6 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
              </svg>
            </div>
            <div>
              <div className="text-base sm:text-lg font-serif font-bold text-amber-200 tracking-wide flex items-center gap-2">
                <span>Catálogo do Império & Matriz de Produção</span>
              </div>
              <div className="text-xs text-amber-400/70 font-sans">
                Sistema Econômico Colonial Inspirado em SkyCity, Ikariam & Age of Empires 2
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Resource Balance */}
            <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-black/40 border border-amber-500/30 font-mono text-xs">
              <span className="text-amber-300">M {Math.floor(playerResources.wood)}</span>
              <span className="text-red-300">C {Math.floor(playerResources.food)}</span>
              <span className="text-yellow-300">O {Math.floor(playerResources.gold)}</span>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-900 hover:bg-amber-600/30 border border-slate-700 hover:border-amber-400 text-slate-400 hover:text-white transition-colors"
              title="Fechar Catálogo (ESC)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-6 pt-3 pb-2 gap-2 border-b border-slate-800 bg-slate-900/60 overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${
              activeTab === 'catalog'
                ? 'bg-amber-600/25 border-amber-500/70 text-amber-300 shadow-sm'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Castle className="w-4 h-4 text-amber-400" />
            <span>Catálogo de Edificações ({buildingList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('chains')}
            className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${
              activeTab === 'chains'
                ? 'bg-amber-600/25 border-amber-500/70 text-amber-300 shadow-sm'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Cadeias de Recursos & Refino</span>
          </button>

          <button
            onClick={() => setActiveTab('market')}
            className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${
              activeTab === 'market'
                ? 'bg-amber-600/25 border-amber-500/70 text-amber-300 shadow-sm'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Store className="w-4 h-4 text-yellow-400" />
            <span>Mercadão da Cidade (Trocas)</span>
          </button>

          <button
            onClick={() => setActiveTab('stats')}
            className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 ${
              activeTab === 'stats'
                ? 'bg-amber-600/25 border-amber-500/70 text-amber-300 shadow-sm'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Compass className="w-4 h-4 text-cyan-400" />
            <span>Força de Trabalho & Eficiência</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* TAB 1: BUILDING POSSIBILITIES CATALOG */}
          {activeTab === 'catalog' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {buildingList.map((type) => {
                const def = BUILDING_CATALOG[type];
                const canAffordWood = playerResources.wood >= def.cost.wood;
                const canAffordGold = !def.cost.gold || playerResources.gold >= def.cost.gold;
                const canAfford = canAffordWood && canAffordGold;

                return (
                  <div
                    key={type}
                    className="p-3.5 rounded-2xl border border-slate-800 bg-slate-900/70 hover:bg-slate-900 hover:border-amber-500/50 transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-amber-400 group-hover:scale-105 transition-transform">
                            {type === 'house' ? (
                              <Home className="w-5 h-5 text-amber-400" />
                            ) : type === 'barracks' ? (
                              <Shield className="w-5 h-5 text-red-400" />
                            ) : type === 'tower' ? (
                              <Castle className="w-5 h-5 text-cyan-400" />
                            ) : type === 'sawmill' ? (
                              <Package className="w-5 h-5 text-amber-500" />
                            ) : type === 'mine' ? (
                              <Coins className="w-5 h-5 text-yellow-400" />
                            ) : type === 'market' ? (
                              <Store className="w-5 h-5 text-amber-300" />
                            ) : type === 'farm' ? (
                              <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M7 20h10M12 20V10M12 10a5 5 0 0 1 5-5M12 10a5 5 0 0 0-5-5" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M2 19c3 0 4-1 6-1s4 1 6 1 4-1 6-1M2 15c3 0 4-1 6-1s4 1 6 1 4-1 6-1M12 3v10M8 8l4-4 4 4" />
                              </svg>
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-sm text-slate-100 group-hover:text-amber-300 transition-colors">
                              {def.name}
                            </div>
                            <div className="text-[10px] text-amber-400/90 font-medium">
                              {def.benefit}
                            </div>
                          </div>
                        </div>

                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300">
                          [{def.hotkey}]
                        </span>
                      </div>

                      <p className="text-xs text-slate-400 leading-relaxed mb-3">
                        {def.description}
                      </p>
                    </div>

                    <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-mono">
                        <span className={canAffordWood ? 'text-amber-400 font-bold' : 'text-red-400 font-bold'}>
                          M {def.cost.wood}
                        </span>
                        {def.cost.gold && (
                          <span className={canAffordGold ? 'text-yellow-400 font-bold' : 'text-red-400 font-bold'}>
                            O {def.cost.gold}
                          </span>
                        )}
                        <span className="text-slate-500 text-[10px]">{def.buildTimeSeconds}s</span>
                      </div>

                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => {
                          onSelectBuildingToBuild(type);
                          onClose();
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                          canAfford
                            ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-md hover:shadow-amber-500/20 active:scale-95'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                        }`}
                      >
                        <Hammer className="w-3.5 h-3.5" />
                        <span>Construir</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: RESOURCE SUPPLY CHAINS */}
          {activeTab === 'chains' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-amber-400 shrink-0" />
                <span>
                  Cada recurso primário pode ser acelerado por edificações de ofício. A <strong>Serralheria</strong> dá +35% à madeira, a <strong>Mineradora</strong> dá +40% aos minérios, a <strong>Fazenda</strong> oferece grãos perpétuos e o <strong>Cais</strong> pesca nas águas profundas do rio!
                </span>
              </div>

              <div className="space-y-3">
                {/* Chain 1: Wood to Planks */}
                <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-amber-300">Cadeia da Madeira Nobre & Tábuas</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Serralheria & Florestas
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-amber-200">
                      Bosques / Árvores
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <div className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-amber-300">
                      Corte pelo Aldeão (+1x)
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <div className="px-3 py-1.5 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 font-bold">
                      Serralheria & Madeireira (+35% Velocidade)
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <div className="px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-bold">
                      Tábuas Nobres para Navios e Torres
                    </div>
                  </div>
                </div>

                {/* Chain 2: Agriculture & Fishing */}
                <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-red-300">Cadeia de Alimentos (Fazendas & Pesca Fluvial)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40">
                      Fazenda & Cais
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-red-200">
                      Trigo da Fazenda / Cardumes do Rio
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <div className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-red-300">
                      Aldeão Agrícola / Barco de Pesca
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <div className="px-3 py-1.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 font-bold">
                      Produção Contínua e Renovável
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <div className="px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-bold">
                      Sustento de Colonos & Exércitos
                    </div>
                  </div>
                </div>

                {/* Chain 3: Mining & Iron Forge */}
                <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-yellow-300">Cadeia Mineral & Lingotes</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
                      Mineradora & Pedreira
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-yellow-200">
                      Veios de Minério & Ouro
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <div className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-yellow-300">
                      Extração por Picareta (+1x)
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <div className="px-3 py-1.5 rounded-xl bg-yellow-950/60 border border-yellow-500/40 text-yellow-200 font-bold">
                      Mineradora & Forja (+40% Rendimento)
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <div className="px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-bold">
                      Moedas & Mosquetes Avançados
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: GRAND MARKET (MERCADÃO) */}
          {activeTab === 'market' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/40">
                <div className="flex items-center gap-2.5">
                  <Store className="w-5 h-5 text-amber-400" />
                  <div>
                    <div className="font-bold text-sm text-amber-200">Entreposto de Câmbio do Mercadão</div>
                    <div className="text-[10px] text-amber-400/80">
                      Compre ou venda matérias-primas por ouro colonial em pacotes de {tradeAmount} unidades.
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {[25, 50, 100].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setTradeAmount(amt)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-colors ${
                        tradeAmount === amt
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {amt}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Trade Commodity Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* Wood Trade */}
                <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/80 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <span className="flex items-center gap-1.5 font-bold text-sm text-amber-300">
                      Madeira Nobre
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      Estoque: {Math.floor(playerResources.wood)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      onClick={() => onTradeResource('wood', 'buy', tradeAmount)}
                      disabled={playerResources.gold < Math.round((marketRates.wood.buyPrice * tradeAmount) / 50)}
                      className="p-2.5 rounded-xl bg-amber-950/60 hover:bg-amber-900/80 border border-amber-600/50 text-amber-200 font-bold flex flex-col items-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span>Comprar +{tradeAmount}</span>
                      <span className="text-[10px] font-mono text-yellow-300">
                        -{Math.round((marketRates.wood.buyPrice * tradeAmount) / 50)} Ouro
                      </span>
                    </button>

                    <button
                      onClick={() => onTradeResource('wood', 'sell', tradeAmount)}
                      disabled={playerResources.wood < tradeAmount}
                      className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold flex flex-col items-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span>Vender -{tradeAmount}</span>
                      <span className="text-[10px] font-mono text-yellow-400">
                        +{Math.round((marketRates.wood.sellPrice * tradeAmount) / 50)} Ouro
                      </span>
                    </button>
                  </div>
                </div>

                {/* Food Trade */}
                <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/80 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <span className="flex items-center gap-1.5 font-bold text-sm text-red-300">
                      Cereais & Peixes
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      Estoque: {Math.floor(playerResources.food)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      onClick={() => onTradeResource('food', 'buy', tradeAmount)}
                      disabled={playerResources.gold < Math.round((marketRates.food.buyPrice * tradeAmount) / 50)}
                      className="p-2.5 rounded-xl bg-amber-950/60 hover:bg-amber-900/80 border border-amber-600/50 text-amber-200 font-bold flex flex-col items-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span>Comprar +{tradeAmount}</span>
                      <span className="text-[10px] font-mono text-yellow-300">
                        -{Math.round((marketRates.food.buyPrice * tradeAmount) / 50)} Ouro
                      </span>
                    </button>

                    <button
                      onClick={() => onTradeResource('food', 'sell', tradeAmount)}
                      disabled={playerResources.food < tradeAmount}
                      className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold flex flex-col items-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span>Vender -{tradeAmount}</span>
                      <span className="text-[10px] font-mono text-yellow-400">
                        +{Math.round((marketRates.food.sellPrice * tradeAmount) / 50)} Ouro
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: COLONY STATS & WORKFORCE EFFICIENCY */}
          {activeTab === 'stats' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Lenhadores Ativos</div>
                  <div className="text-lg font-bold text-amber-300 font-mono mt-1">
                    {activeGatherersCount.wood} Aldeões
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Agricultores & Pomares</div>
                  <div className="text-lg font-bold text-red-300 font-mono mt-1">
                    {activeGatherersCount.food} Aldeões
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Mineradores & Forja</div>
                  <div className="text-lg font-bold text-yellow-300 font-mono mt-1">
                    {activeGatherersCount.gold} Aldeões
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Pescadores & Barcos</div>
                  <div className="text-lg font-bold text-blue-300 font-mono mt-1">
                    {activeGatherersCount.fish} Unidades
                  </div>
                </div>
              </div>

              {/* Empire Level classification */}
              <div className="p-4 rounded-2xl border border-amber-600/40 bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/40 flex items-center justify-between">
                <div>
                  <div className="text-xs text-amber-400 font-bold uppercase tracking-wider">
                    Estatuto de Civilização:
                  </div>
                  <div className="text-base sm:text-lg font-serif font-bold text-white mt-0.5">
                    {playerResources.maxPop >= 25
                      ? 'Império Metropolitano Fortificado'
                      : playerResources.maxPop >= 15
                      ? 'Cidade Colonial Próspera'
                      : 'Assentamento Pioneiro em Expansão'}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-400">Capacidade Populacional:</div>
                  <div className="text-sm font-mono font-bold text-amber-300">
                    {playerResources.pop} / {playerResources.maxPop} Colonos
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Pressione <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-slate-300">K</kbd> ou clique no ícone para abrir/fechar</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-colors"
          >
            Voltar ao Mapa
          </button>
        </div>
      </div>
    </div>
  );
};
