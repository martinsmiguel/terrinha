/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createPortal } from 'react-dom';
import { homeAnchor } from '../game/foundation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GameEngine, GameState, MAP_SIZE } from '../game/engine';
import { VISION_EXPLORED, VISION_VISIBLE, visionAt } from '../game/visibility';
import { IslandProfile, coastRadiusAt, computeArchipelago } from '../game/archipelago';
import { MINIMAP_PIXEL_SIZE, worldToMapPixel } from '../game/mapProjection';
import { minimapClickTarget, resolveNavigationTarget } from '../game/worldMap';
import { Eye, EyeOff, Home, Compass, Lock, Unlock, ChevronDown, ChevronUp, Map } from 'lucide-react';
import { WorldMapModal } from './WorldMapModal';

interface MinimapProps {
  engine: GameEngine | null;
  gameState: GameState;
  playerSlot: string;
  selectedEntityId: string | null;
  /**
   * Grid de exploracao do jogador local (`x * mapSize + z`), a mesma fonte de
   * verdade usada pela nevoa da cena 3D. Sem ele o minimapa nao inventa visao.
   */
  visibility?: Uint8Array;
  workZones?: { id: string; x: number; z: number; radius: number; isHighlighted?: boolean }[];
  onOrderMove?: (target: { x: number; z: number }) => void;
  isCameraLocked?: boolean;
  onToggleCameraLock?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  /** O mapa-mundi e controlado pelo App para que o Esc nao perca a selecao. */
  isWorldMapOpen?: boolean;
  onWorldMapOpenChange?: (open: boolean) => void;
  /** Revelar o mapa inteiro so existe em modo desenvolvedor. */
  developerToolsEnabled?: boolean;
}

const FACTION_MINIMAP_COLORS: Record<string, string> = {
  player1: '#3b82f6', // Blue
  player2: '#ef4444', // Red
  player3: '#22c55e', // Green
  player4: '#eab308', // Yellow
};

export const Minimap: React.FC<MinimapProps> = ({
  engine,
  gameState,
  playerSlot,
  selectedEntityId,
  visibility,
  workZones,
  onOrderMove,
  isCameraLocked = false,
  onToggleCameraLock,
  isCollapsed,
  onToggleCollapse,
  isWorldMapOpen: isWorldMapOpenProp,
  onWorldMapOpenChange,
  developerToolsEnabled = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dimensão do mundo da sessão (60 no padrão).
  const mapSize = gameState.mapSize ?? MAP_SIZE;

  // Grid vazio estavel usado apenas enquanto o App ainda nao publicou a nevoa.
  const emptyVision = useMemo(() => new Uint8Array(mapSize * mapSize), [mapSize]);
  const visionGrid = visibility ?? emptyVision;

  const [localCollapsed, setLocalCollapsed] = useState(false);
  const isMinimapCollapsed = isCollapsed !== undefined ? isCollapsed : localCollapsed;
  const toggleCollapse = onToggleCollapse || (() => setLocalCollapsed((prev) => !prev));

  const [isDragging, setIsDragging] = useState(false);
  const [localWorldMapOpen, setLocalWorldMapOpen] = useState(false);
  const [developerRevealAll, setDeveloperRevealAll] = useState(false);
  const isWorldMapOpen = isWorldMapOpenProp !== undefined ? isWorldMapOpenProp : localWorldMapOpen;
  const setWorldMapOpen = onWorldMapOpenChange || setLocalWorldMapOpen;
  // A nevoa e sempre aplicada; revelar tudo e exclusivo do modo desenvolvedor.
  const revealAll = developerToolsEnabled && developerRevealAll;
  const [coordinates, setCoordinates] = useState<{ x: number; z: number } | null>(null);
  const [navHint, setNavHint] = useState<string | null>(null);

  // Canvas pixel size (compact on mobile screens)
  const SIZE = MINIMAP_PIXEL_SIZE;

  const archipelago = useMemo(
    () => computeArchipelago(mapSize, gameState.mapSeed ?? 0),
    [mapSize, gameState.mapSeed]
  );

  // Convert canvas pixel (cx, cy) to world coords (wx, wz)
  const canvasToWorld = (cx: number, cy: number) => minimapClickTarget(cx, cy, mapSize, SIZE);

  // Convert world coords (wx, wz) to canvas pixel (cx, cy)
  const worldToCanvas = (wx: number, wz: number) => worldToMapPixel(wx, wz, mapSize, SIZE);

  const isKnown = (x: number, z: number) => revealAll || visionAt(visionGrid, x, z) !== 0;

  // Main Minimap Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Draw Background Ocean & Ikariam Island
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Deep Ocean Background
    const oceanGrad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    oceanGrad.addColorStop(0, '#0c2438');
    oceanGrad.addColorStop(1, '#082f49');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Arquipelago (layout puro compartilhado com o gerador: semente do host)
    const layout = archipelago;
    const scale = SIZE / mapSize;
    const PROFILE_FILL: Record<IslandProfile, string> = {
      floresta: '#3b6f25',
      arida: '#b0a06a',
      glacial: '#a8c4d4',
      montanhosa: '#5f6d4a',
      ruintas: '#7a6a8a',
    };

    layout.islands.forEach((island) => {
      const cc = worldToCanvas(island.center.x, island.center.z);
      const traceIsland = (rInset: number) => {
        ctx.beginPath();
        for (let angle = 0; angle <= Math.PI * 2; angle += 0.08) {
          const r = Math.max(0, coastRadiusAt(island, angle) - rInset) * scale;
          const px = cc.x + Math.cos(angle) * r;
          const py = cc.y + Math.sin(angle) * r;
          if (angle === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      };

      // Praia / linha de costa
      traceIsland(0);
      ctx.fillStyle = '#d4b483';
      ctx.fill();

      // Interior no cor do perfil geografico (ilhas legivelmente distintas)
      traceIsland(1.6);
      ctx.fillStyle = PROFILE_FILL[island.profile];
      ctx.fill();

      // Cristas montanhosas
      island.ridges.forEach((ridge) => {
        const pt = worldToCanvas(ridge.x, ridge.z);
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.ellipse(pt.x, pt.y, ridge.radiusX * scale, ridge.radiusZ * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.ellipse(pt.x, pt.y - 1, ridge.radiusX * 0.7 * scale, ridge.radiusZ * 0.6 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
      });

      // Lagos e lagoa de cratera
      island.lakes.forEach((lake) => {
        const pt = worldToCanvas(lake.x, lake.z);
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, lake.radius * scale, 0, Math.PI * 2);
        ctx.fill();
      });

      // Rio endorreico (nunca toca o oceano)
      if (island.river) {
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = Math.max(1.5, island.river.width * scale * 2);
        ctx.beginPath();
        island.river.points.forEach((p, i2) => {
          const pt = worldToCanvas(p.x, p.z);
          if (i2 === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      }
    });

    // 2. Draw Resource Nodes
    gameState.resourceNodes.forEach((res) => {
      const gx = Math.min(mapSize - 1, Math.max(0, Math.floor(res.position.x)));
      const gz = Math.min(mapSize - 1, Math.max(0, Math.floor(res.position.z)));
      const isExplored = isKnown(gx, gz);

      if (!isExplored) return;

      const pt = worldToCanvas(res.position.x, res.position.z);

      if (res.type === 'tree') {
        ctx.fillStyle = '#166534'; // Forest Green
        ctx.fillRect(pt.x - 1, pt.y - 1, 2.5, 2.5);
      } else if (res.type === 'gold_mine') {
        ctx.fillStyle = '#facc15'; // Gold Yellow
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#854d0e';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      } else if (res.type === 'stone') {
        ctx.fillStyle = '#94a3b8'; // Granite Grey
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      } else if (res.type === 'fish_school') {
        ctx.fillStyle = '#38bdf8'; // Fish Cyan in river
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      } else {
        ctx.fillStyle = '#e11d48'; // Berry Bush Red
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // 3. Draw Buildings
    gameState.buildings.forEach((b) => {
      const gx = Math.min(mapSize - 1, Math.max(0, Math.floor(b.position.x)));
      const gz = Math.min(mapSize - 1, Math.max(0, Math.floor(b.position.z)));
      const isExplored = isKnown(gx, gz);

      if (!isExplored && b.owner !== playerSlot) return;

      const pt = worldToCanvas(b.position.x, b.position.z);
      const color = FACTION_MINIMAP_COLORS[b.owner] || '#94a3b8';

      ctx.fillStyle = color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = b.id === selectedEntityId ? 1.5 : 0.8;

      if (b.type === 'town_center') {
        ctx.fillRect(pt.x - 4.5, pt.y - 4.5, 9, 9);
        ctx.strokeRect(pt.x - 4.5, pt.y - 4.5, 9, 9);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(pt.x - 1, pt.y - 1, 2, 2);
      } else if (b.type === 'barracks') {
        ctx.fillRect(pt.x - 3.5, pt.y - 3, 7, 6);
        ctx.strokeRect(pt.x - 3.5, pt.y - 3, 7, 6);
      } else if (b.type === 'tower') {
        ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
        ctx.strokeRect(pt.x - 2, pt.y - 2, 4, 4);
      } else if (b.type === 'sawmill') {
        ctx.fillStyle = '#b45309';
        ctx.fillRect(pt.x - 3, pt.y - 2.5, 6, 5);
        ctx.strokeRect(pt.x - 3, pt.y - 2.5, 6, 5);
      } else if (b.type === 'mine') {
        ctx.fillStyle = '#eab308';
        ctx.fillRect(pt.x - 3, pt.y - 3, 6, 6);
        ctx.strokeRect(pt.x - 3, pt.y - 3, 6, 6);
      } else if (b.type === 'market') {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(pt.x - 4, pt.y - 3.5, 8, 7);
        ctx.strokeRect(pt.x - 4, pt.y - 3.5, 8, 7);
      } else if (b.type === 'farm') {
        ctx.fillStyle = '#84cc16';
        ctx.fillRect(pt.x - 3, pt.y - 3, 6, 6);
        ctx.strokeRect(pt.x - 3, pt.y - 3, 6, 6);
      } else if (b.type === 'dock') {
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(pt.x - 3.5, pt.y - 3.5, 7, 7);
        ctx.strokeRect(pt.x - 3.5, pt.y - 3.5, 7, 7);
      } else {
        // House
        ctx.fillRect(pt.x - 2.5, pt.y - 2.5, 5, 5);
        ctx.strokeRect(pt.x - 2.5, pt.y - 2.5, 5, 5);
      }
    });

    // 4. Draw Units
    gameState.units.forEach((u) => {
      const isFriendly = u.owner === playerSlot;
      const isVisible = isFriendly || revealAll || visionAt(
        visionGrid,
        Math.max(0, Math.min(mapSize - 1, Math.floor(u.position.x))),
        Math.max(0, Math.min(mapSize - 1, Math.floor(u.position.z)))
      ) === VISION_VISIBLE;

      if (!isVisible) return;

      const pt = worldToCanvas(u.position.x, u.position.z);
      const color = FACTION_MINIMAP_COLORS[u.owner] || '#94a3b8';
      const isSelected = u.id === selectedEntityId;

      ctx.save();
      ctx.fillStyle = color;

      if (isSelected) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.beginPath();
      if (u.type === 'soldier') {
        ctx.moveTo(pt.x, pt.y - 3);
        ctx.lineTo(pt.x + 3, pt.y);
        ctx.lineTo(pt.x, pt.y + 3);
        ctx.lineTo(pt.x - 3, pt.y);
        ctx.closePath();
      } else if (u.type === 'fishing_boat' || u.type === 'trade_boat') {
        // Boat triangle facing forward
        ctx.moveTo(pt.x, pt.y - 3.5);
        ctx.lineTo(pt.x + 2.5, pt.y + 2.5);
        ctx.lineTo(pt.x - 2.5, pt.y + 2.5);
        ctx.closePath();
      } else {
        // Circle for villagers
        ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
      }
      ctx.fill();

      // Sharp white dot for contrast
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 0.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });

    // 5. Draw Fog of War (Authentic RTS 2-layer Fog: Unexplored Shroud + Explored Semi-Fog)
    // A nevoa vem do mesmo grid que a cena 3D usa, entao minimapa, mapa-mundi e
    // terreno nunca discordam sobre o que ja foi descoberto.
    if (!revealAll) {
      // Create offscreen fog canvas
      const fogCanvas = document.createElement('canvas');
      fogCanvas.width = SIZE;
      fogCanvas.height = SIZE;
      const fogCtx = fogCanvas.getContext('2d');

      if (fogCtx) {
        // Em mundos grandes a névoa é desenhada por blocos (no máximo ~100 por eixo).
        const stride = Math.max(1, Math.ceil(mapSize / 100));
        const cellW = (SIZE / mapSize) * stride;
        const cellH = (SIZE / mapSize) * stride;

        for (let x = 0; x < mapSize; x += stride) {
          for (let z = 0; z < mapSize; z += stride) {
            const state = visionAt(visionGrid, Math.min(mapSize - 1, x + Math.floor(stride / 2)), Math.min(mapSize - 1, z + Math.floor(stride / 2)));
            if (state === VISION_VISIBLE) continue; // Sob visao atual: sem nevoa
            // Nunca visto: veu quase opaco. Ja explorado: nevoa leve.
            fogCtx.fillStyle = state === VISION_EXPLORED
              ? 'rgba(20, 28, 40, 0.52)'
              : 'rgba(7, 10, 15, 0.94)';
            fogCtx.fillRect((x / stride) * cellW, (z / stride) * cellH, cellW + 0.5, cellH + 0.5);
          }
        }

        // Overlay fog onto main canvas
        ctx.drawImage(fogCanvas, 0, 0);
      }
    }

    // 5b. Draw Active Work Zones
    if (workZones && workZones.length > 0) {
      ctx.save();
      workZones.forEach((z) => {
        if (z.radius >= 999) return;
        const pt = worldToCanvas(z.x, z.z);
        const r = (z.radius / mapSize) * SIZE;

        ctx.strokeStyle = z.isHighlighted ? '#10b981' : '#34d399';
        ctx.lineWidth = z.isHighlighted ? 2.0 : 1.2;
        ctx.setLineDash(z.isHighlighted ? [4, 2] : [2, 2]);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(2, r), 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = z.isHighlighted ? 'rgba(16, 185, 129, 0.22)' : 'rgba(52, 211, 153, 0.1)';
        ctx.fill();

        // Center beacon dot
        ctx.fillStyle = z.isHighlighted ? '#10b981' : '#34d399';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.0, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    // 6. Draw Camera Frustum / Viewport Box
    if (engine) {
      const bounds = engine.getCameraFrustumBounds();
      const pMin = worldToCanvas(bounds.minX, bounds.minZ);
      const pMax = worldToCanvas(bounds.maxX, bounds.maxZ);
      const pCenter = worldToCanvas(bounds.centerX, bounds.centerZ);

      ctx.save();
      // Viewport rectangle
      ctx.strokeStyle = '#f59e0b'; // Amber gold
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(pMin.x, pMin.y, pMax.x - pMin.x, pMax.y - pMin.y);

      // Center crosshair
      ctx.setLineDash([]);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(pCenter.x, pCenter.y, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }, [gameState, engine, playerSlot, selectedEntityId, revealAll, workZones, archipelago, visionGrid]);

  // Handle click or drag to move camera
  const handleInteraction = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !engine) return;

    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const world = canvasToWorld(cx, cy);
    // Regra única de destino: a câmera nunca salta para célula desconhecida.
    const result = resolveNavigationTarget({ kind: 'point', x: world.x, z: world.z }, { mapSize, visibility: visionGrid, revealAll });
    if (!result.ok) {
      setNavHint(result.message);
      return;
    }
    setNavHint(null);
    engine.setCameraTarget(result.target.x, result.target.z);
    setCoordinates({ x: Math.round(world.x), z: Math.round(world.z) });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0) {
      // Left click
      setIsDragging(true);
      handleInteraction(e);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const world = canvasToWorld(cx, cy);
      setCoordinates({ x: Math.round(world.x), z: Math.round(world.z) });
    }

    if (isDragging) {
      handleInteraction(e);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const world = canvasToWorld(cx, cy);

    onOrderMove?.(world);
  };

  // Center camera on own Town Center
  const centerOnTownCenter = () => {
    const home = homeAnchor(playerSlot, gameState.buildings, gameState.units);
    if (home && engine) {
      engine.setCameraTarget(home.x, home.z);
    }
  };

  // Portal em document.body: dentro da barra do minimapa (backdrop-filter) o `fixed inset-0` do modal
  // ficava preso à caixa da barra, e com o minimapa recolhido o diálogo virava 216x14 px.
  const worldMapModal = isWorldMapOpen ? createPortal(
    <WorldMapModal
      gameState={gameState}
      playerSlot={playerSlot}
      visibility={visionGrid}
      developerToolsEnabled={developerToolsEnabled}
      revealAll={revealAll}
      onClose={() => setWorldMapOpen(false)}
      onToggleRevealAll={() => setDeveloperRevealAll((value) => !value)}
      onNavigate={(target) => engine?.setCameraTarget(target.x, target.z)}
      onPointerOverChange={(isOver) => engine?.setIsPointerOverUI(isOver)}
    />,
    document.body
  ) : null;

  // If Minimap is collapsed: render a sleek, compact tactical pill
  if (isMinimapCollapsed) {
    return (
      <div
        ref={containerRef}
        onMouseEnter={() => engine?.setIsPointerOverUI(true)}
        onMouseLeave={() => engine?.setIsPointerOverUI(false)}
        className="bg-slate-950/90 backdrop-blur-xl border border-amber-600/40 hover:border-amber-500 rounded-2xl p-2 px-3 shadow-2xl flex items-center gap-2.5 text-slate-200 select-none pointer-events-auto transition-all"
      >
        <button
          type="button"
          onClick={toggleCollapse}
          title="Expandir Mini-Mapa Completo"
          className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 font-bold text-xs group"
        >
          <Compass className="w-4 h-4 animate-spin-slow group-hover:scale-110 transition-transform" />
          <span className="uppercase text-[11px] tracking-wider">Mapa</span>
          <ChevronUp className="w-3.5 h-3.5 text-amber-400 group-hover:-translate-y-0.5 transition-transform" />
        </button>

        <div className="h-4 w-px bg-slate-800" />

        {/* Quick Base Center button in collapsed mode */}
        <button
          type="button"
          onClick={centerOnTownCenter}
          title="Centrar Visão na Minha Base"
          className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 transition-colors"
        >
          <Home className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setWorldMapOpen(true)}
          title="Abrir mapa-múndi"
          className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 transition-colors"
        >
          <Map className="w-3.5 h-3.5" />
        </button>

        {developerToolsEnabled && (
          <button
            type="button"
            onClick={() => setDeveloperRevealAll((value) => !value)}
            title={revealAll ? 'Restaurar névoa de guerra' : 'Revelar mapa (somente desenvolvimento)'}
            aria-pressed={revealAll}
            className={`p-1 rounded-lg transition-colors ${
              revealAll
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            {revealAll ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* Camera lock toggle button */}
        {onToggleCameraLock && (
          <button
            type="button"
            onClick={onToggleCameraLock}
            title={
              isCameraLocked
                ? 'Câmera Travada (Rolagem de borda desativada). Clique para destravar.'
                : 'Câmera Livre (Rolagem de borda ativa). Clique para travar.'
            }
            className={`p-1 rounded-lg transition-colors ${
              isCameraLocked
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
            }`}
          >
            {isCameraLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
        )}
        {worldMapModal}
      </div>
    );
  }

  // Expanded Minimap
  return (
    <div
      ref={containerRef}
      onMouseEnter={() => engine?.setIsPointerOverUI(true)}
      onMouseLeave={() => {
        setIsDragging(false);
        setCoordinates(null);
        engine?.setIsPointerOverUI(false);
      }}
      className="bg-slate-950/95 backdrop-blur-xl border-2 border-amber-600/40 rounded-3xl p-3 sm:p-3.5 shadow-2xl shadow-black/80 flex flex-col gap-2.5 text-slate-200 select-none pointer-events-auto transition-all max-w-[240px]"
    >
      <p role="status" aria-live="polite" className="px-1 text-[10px] text-amber-300 empty:hidden">{navHint}</p>
      {/* Minimap Header */}
      <div className="flex items-center justify-between text-xs px-1 font-semibold">
        <div className="flex items-center gap-1.5 text-amber-400">
          <Compass className="w-4 h-4 animate-spin-slow" />
          <span className="tracking-wide uppercase text-[11px] font-bold">Mini-Mapa</span>
          {coordinates && (
            <span className="text-[10px] font-mono text-slate-400">
              ({coordinates.x}, {coordinates.z})
            </span>
          )}
        </div>

        {/* Quick Toolbar */}
        <div className="flex items-center gap-1">
          {/* Camera Lock toggle */}
          {onToggleCameraLock && (
            <button
              type="button"
              onClick={onToggleCameraLock}
              title={
                isCameraLocked
                  ? 'Movimento Automático Travado (Câmera Fixa - Tecla L)'
                  : 'Movimento Automático Ativo (Rolagem de Borda - Tecla L)'
              }
              className={`p-1 rounded-lg transition-colors ${
                isCameraLocked
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {isCameraLocked ? <Lock className="w-3.5 h-3.5 text-amber-300" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
          )}

          <button
            type="button"
            onClick={centerOnTownCenter}
            title="Centrar na Minha Base (Centro da Vila)"
            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setWorldMapOpen(true)}
            title="Abrir mapa-múndi (todas as ilhas conhecidas)"
            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 transition-colors"
          >
            <Map className="w-3.5 h-3.5" />
          </button>

          {developerToolsEnabled && (
            <button
              type="button"
              onClick={() => setDeveloperRevealAll((value) => !value)}
              title={revealAll ? 'Restaurar Névoa de Guerra' : 'Revelar Mapa (somente modo desenvolvedor)'}
              aria-pressed={revealAll}
              className={`p-1 rounded-lg transition-colors ${
                revealAll
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              {revealAll ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Minimize / Collapse Button */}
          <button
            type="button"
            onClick={toggleCollapse}
            title="Recolher Mini-Mapa para Liberar Espaço"
            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-300 transition-colors"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Minimap Canvas with Ornate Frame */}
      <div className="relative rounded-2xl overflow-hidden border border-amber-500/30 shadow-inner bg-black cursor-crosshair">
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onContextMenu={handleContextMenu}
          className="block w-full h-auto aspect-square"
        />

        {/* Compass Cardinal Badges */}
        <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-mono font-bold text-amber-400/60 pointer-events-none">
          N
        </span>
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-mono font-bold text-amber-400/60 pointer-events-none">
          S
        </span>
        <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] font-mono font-bold text-amber-400/60 pointer-events-none">
          O
        </span>
        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] font-mono font-bold text-amber-400/60 pointer-events-none">
          L
        </span>
      </div>

      {/* Legend & Instructions Bar */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 pt-0.5 border-t border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Aliados
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Inimigos
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Ouro
          </span>
        </div>
        <span className="text-slate-400 font-mono text-[9px]">Clique: Visão</span>
      </div>

      {worldMapModal}
    </div>
  );
};
