/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Compass, Eye, EyeOff, Globe2, MapPin, X } from 'lucide-react';
import type { GameState } from '../game/engine';
import { MAP_SIZE } from '../game/engine';
import { coastRadiusAt, computeArchipelago, type IslandProfile } from '../game/archipelago';
import {
  isIslandDiscovered,
  isMapCellKnown,
  isMapCellVisible,
  worldMapClickTarget,
  type MapDiscoveryQuery,
} from '../game/worldMap';
import { worldToCell, worldToMapPixel, WORLD_MAP_PIXEL_SIZE } from '../game/mapProjection';

/** Cores do interior de cada perfil geografico (espelham o minimapa). */
const PROFILE_COLORS: Record<IslandProfile, string> = {
  floresta: '#3b6f25',
  arida: '#b0a06a',
  glacial: '#a8c4d4',
  montanhosa: '#5f6d4a',
  ruintas: '#7a6a8a',
};

const PLAYER_COLORS: Record<string, string> = {
  player1: '#3b82f6',
  player2: '#ef4444',
  player3: '#22c55e',
  player4: '#eab308',
};

interface WorldMapModalProps {
  gameState: GameState;
  playerSlot: string;
  /** Grid de exploracao do jogador local, compartilhado com o minimapa e a cena 3D. */
  visibility: Uint8Array;
  /** Opcao de revelar tudo existe apenas em modo desenvolvedor. */
  developerToolsEnabled: boolean;
  revealAll: boolean;
  onClose: () => void;
  onToggleRevealAll: () => void;
  onNavigate: (target: { x: number; z: number }) => void;
  /** Mantem a camera parada enquanto o mapa cobre a tela. */
  onPointerOverChange?: (isOver: boolean) => void;
}

export function WorldMapModal({
  gameState,
  playerSlot,
  visibility,
  developerToolsEnabled,
  revealAll,
  onClose,
  onToggleRevealAll,
  onNavigate,
  onPointerOverChange,
}: WorldMapModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<{ x: number; z: number } | null>(null);

  // Dimensão do mundo da sessão (60 no padrão).
  const mapSize = gameState.mapSize ?? MAP_SIZE;
  const layout = useMemo(() => computeArchipelago(mapSize, gameState.mapSeed ?? 0), [mapSize, gameState.mapSeed]);
  const query = useMemo<MapDiscoveryQuery>(() => ({ mapSize, visibility, revealAll }), [mapSize, visibility, revealAll]);
  const discoveredIslands = useMemo(
    () => layout.islands.filter((island) => isIslandDiscovered(island, query)),
    [layout, query]
  );

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const scale = WORLD_MAP_PIXEL_SIZE / mapSize;
    context.clearRect(0, 0, WORLD_MAP_PIXEL_SIZE, WORLD_MAP_PIXEL_SIZE);
    const ocean = context.createLinearGradient(0, 0, WORLD_MAP_PIXEL_SIZE, WORLD_MAP_PIXEL_SIZE);
    ocean.addColorStop(0, '#0c2438');
    ocean.addColorStop(1, '#082f49');
    context.fillStyle = ocean;
    context.fillRect(0, 0, WORLD_MAP_PIXEL_SIZE, WORLD_MAP_PIXEL_SIZE);

    // Geografia real da partida: a mesma semente gera o mesmo layout do mapa 3D.
    layout.islands.forEach((island) => {
      const coast = (inset: number) => {
        context.beginPath();
        for (let angle = 0; angle <= Math.PI * 2 + 0.01; angle += 0.04) {
          const radius = Math.max(0, coastRadiusAt(island, angle) - inset);
          const point = worldToMapPixel(
            island.center.x + Math.cos(angle) * radius,
            island.center.z + Math.sin(angle) * radius,
            mapSize,
            WORLD_MAP_PIXEL_SIZE
          );
          if (angle === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        }
        context.closePath();
      };

      coast(0);
      context.fillStyle = '#d4b483';
      context.fill();
      context.strokeStyle = '#f4d7a1';
      context.lineWidth = 2;
      context.stroke();

      coast(1.6 * (mapSize / MAP_SIZE));
      context.fillStyle = PROFILE_COLORS[island.profile];
      context.fill();
    });

    // Nevoa: o que nunca foi visto fica opaco; o explorado ganha nevoa leve.
    if (!revealAll) {
      // Em mundos grandes a névoa é desenhada por blocos (no máximo ~120 por eixo).
      const stride = Math.max(1, Math.ceil(mapSize / 120));
      for (let x = 0; x < mapSize; x += stride) {
        for (let z = 0; z < mapSize; z += stride) {
          const known = isMapCellKnown(Math.min(mapSize - 1, x + Math.floor(stride / 2)), Math.min(mapSize - 1, z + Math.floor(stride / 2)), query);
          context.fillStyle = known ? 'rgba(15, 23, 42, 0.5)' : 'rgba(2, 6, 23, 0.97)';
          context.fillRect(x * scale, z * scale, scale * stride + 0.4, scale * stride + 0.4);
        }
      }
    }

    // Rotulos apenas das ilhas ja descobertas.
    discoveredIslands.forEach((island) => {
      const anchor = worldToMapPixel(island.center.x, island.center.z + island.baseRadius + 2 * (mapSize / MAP_SIZE), mapSize, WORLD_MAP_PIXEL_SIZE);
      context.fillStyle = '#f8fafc';
      context.font = '600 13px system-ui';
      context.textAlign = 'center';
      context.shadowColor = '#020617';
      context.shadowBlur = 4;
      context.fillText(island.name, anchor.x, anchor.y);
      context.shadowBlur = 0;
    });

    gameState.resourceNodes.forEach((resource) => {
      if (resource.remaining <= 0) return;
      const cell = worldToCell(resource.position.x, resource.position.z, mapSize);
      if (!isMapCellKnown(cell.x, cell.z, query)) return;
      const point = worldToMapPixel(resource.position.x, resource.position.z, mapSize, WORLD_MAP_PIXEL_SIZE);
      context.fillStyle =
        resource.type === 'gold_mine' ? '#facc15'
          : resource.type === 'stone' ? '#cbd5e1'
            : resource.type === 'fish_school' ? '#38bdf8'
              : resource.type === 'tree' ? '#22c55e'
                : '#fb7185';
      context.beginPath();
      context.arc(point.x, point.y, 2, 0, Math.PI * 2);
      context.fill();
    });

    gameState.buildings.forEach((building) => {
      const cell = worldToCell(building.position.x, building.position.z, mapSize);
      if (building.owner !== playerSlot && !isMapCellKnown(cell.x, cell.z, query)) return;
      const point = worldToMapPixel(building.position.x, building.position.z, mapSize, WORLD_MAP_PIXEL_SIZE);
      context.fillStyle = PLAYER_COLORS[building.owner] ?? '#e2e8f0';
      const size = building.type === 'town_center' ? 10 : 7;
      context.fillRect(point.x - size / 2, point.y - size / 2, size, size);
      context.strokeStyle = '#fff';
      context.lineWidth = 1;
      context.strokeRect(point.x - size / 2, point.y - size / 2, size, size);
    });

    gameState.units.forEach((unit) => {
      const cell = worldToCell(unit.position.x, unit.position.z, mapSize);
      if (unit.owner !== playerSlot && !isMapCellVisible(cell.x, cell.z, query)) return;
      const point = worldToMapPixel(unit.position.x, unit.position.z, mapSize, WORLD_MAP_PIXEL_SIZE);
      context.fillStyle = PLAYER_COLORS[unit.owner] ?? '#e2e8f0';
      context.beginPath();
      context.arc(point.x, point.y, unit.owner === playerSlot ? 3 : 2.5, 0, Math.PI * 2);
      context.fill();
    });
  }, [discoveredIslands, gameState, layout, playerSlot, query, revealAll]);

  const handleMapClick = (event: MouseEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const target = worldMapClickTarget({
      pixelX: ((event.clientX - bounds.left) / bounds.width) * WORLD_MAP_PIXEL_SIZE,
      pixelY: ((event.clientY - bounds.top) / bounds.height) * WORLD_MAP_PIXEL_SIZE,
      mapSize: mapSize,
      visibility,
      revealAll,
    });
    if (!target) return;
    onNavigate(target);
    onClose();
  };

  const handleMapMove = (event: MouseEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const cell = worldToCell(
      ((event.clientX - bounds.left) / bounds.width) * mapSize,
      ((event.clientY - bounds.top) / bounds.height) * mapSize,
      mapSize
    );
    setHovered({ x: cell.x, z: cell.z });
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onMouseEnter={() => onPointerOverChange?.(true)}
      onMouseLeave={() => onPointerOverChange?.(false)}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="max-h-full w-full max-w-5xl overflow-auto rounded-2xl border border-cyan-400/30 bg-slate-950 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="world-map-title"
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-2 text-cyan-300">
              <Globe2 className="h-5 w-5" />
            </div>
            <div>
              <h2 id="world-map-title" className="text-sm font-bold text-white">Mapa-múndi</h2>
              <p className="text-[11px] text-slate-400">
                {revealAll ? 'Visão de cartógrafo (desenvolvedor)' : 'Clique em uma área explorada para orientar a câmera.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {developerToolsEnabled && (
              <button
                type="button"
                onClick={onToggleRevealAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-200"
                aria-pressed={revealAll}
              >
                {revealAll ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {revealAll ? 'Ocultar mapa' : 'Revelar tudo (dev)'}
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" aria-label="Fechar mapa-múndi">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="grid gap-3 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_230px]">
          <div className="overflow-hidden rounded-xl border border-cyan-900/60 bg-slate-950">
            <canvas
              ref={canvasRef}
              width={WORLD_MAP_PIXEL_SIZE}
              height={WORLD_MAP_PIXEL_SIZE}
              onClick={handleMapClick}
              onMouseMove={handleMapMove}
              className="block aspect-square w-full cursor-crosshair"
              aria-label="Mapa-múndi explorável"
            />
          </div>

          <aside className="flex flex-row flex-wrap content-start gap-x-3 gap-y-2 text-[11px] text-slate-300 md:flex-col">
            <span className="flex w-full items-center gap-2 font-semibold text-slate-100">
              <MapPin className="h-3.5 w-3.5 text-cyan-300" /> Ilhas descobertas
            </span>
            {discoveredIslands.length === 0 && (
              <p className="w-full text-slate-400">Explore com barcos ou unidades para revelar terras.</p>
            )}
            {discoveredIslands.map((island) => (
              <button
                key={island.index}
                type="button"
                onClick={() => {
                  onNavigate({ x: island.center.x, z: island.center.z });
                  onClose();
                }}
                className="flex w-full items-center justify-between rounded-lg border border-transparent px-2 py-1.5 text-left hover:border-cyan-600/40 hover:bg-cyan-500/10"
              >
                <span className="text-slate-200">{island.name}</span>
                <span className="ml-2 shrink-0 font-mono text-[9px] text-slate-400">
                  {Math.round(island.center.x)},{Math.round(island.center.z)}
                </span>
              </button>
            ))}

            <span className="w-full pt-1 font-semibold text-slate-100">Legenda</span>
            {Object.entries(PLAYER_COLORS).map(([slot, color]) => (
              <span key={slot} className="flex items-center gap-2">
                <i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                {slot === playerSlot ? 'Sua civilização' : slot.replace('player', 'Jogador ')}
              </span>
            ))}
            <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-green-500" />Madeira e vegetação</span>
            <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-yellow-400" />Ouro</span>
            <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-sky-400" />Cardumes</span>

            <span className="flex w-full items-center gap-2 pt-1 text-slate-400">
              <Compass className="h-3.5 w-3.5" />
              {hovered ? `Célula ${hovered.x}, ${hovered.z}` : 'Semente do mundo:'} {hovered ? '' : gameState.mapSeed ?? '—'}
            </span>
          </aside>
        </div>
      </section>
    </div>
  );
}
