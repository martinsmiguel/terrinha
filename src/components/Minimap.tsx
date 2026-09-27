/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { GameEngine, GameState, Unit, Building, MAP_SIZE } from '../game/engine';
import { visionRadiusFor } from '../game/visibility';
import { Eye, EyeOff, Home, Compass, Lock, Unlock, ChevronDown, ChevronUp } from 'lucide-react';

interface MinimapProps {
  engine: GameEngine | null;
  gameState: GameState;
  playerSlot: string;
  selectedEntityId: string | null;
  workZones?: { id: string; x: number; z: number; radius: number; isHighlighted?: boolean }[];
  onOrderMove?: (target: { x: number; z: number }) => void;
  isCameraLocked?: boolean;
  onToggleCameraLock?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
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
  workZones,
  onOrderMove,
  isCameraLocked = false,
  onToggleCameraLock,
  isCollapsed,
  onToggleCollapse,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fog of War explored grid (60x60)
  const exploredGrid = useRef<boolean[][]>(
    Array(MAP_SIZE)
      .fill(false)
      .map(() => Array(MAP_SIZE).fill(false))
  );

  const [localCollapsed, setLocalCollapsed] = useState(false);
  const isMinimapCollapsed = isCollapsed !== undefined ? isCollapsed : localCollapsed;
  const toggleCollapse = onToggleCollapse || (() => setLocalCollapsed((prev) => !prev));

  const [isDragging, setIsDragging] = useState(false);
  const [fogEnabled, setFogEnabled] = useState(true);
  const [coordinates, setCoordinates] = useState<{ x: number; z: number } | null>(null);

  // Canvas pixel size (compact on mobile screens)
  const SIZE = 210;

  // Vision radius definitions (in world units) — fonte unica em game/visibility
  const getVisionRadius = visionRadiusFor;

  // Convert canvas pixel (cx, cy) to world coords (wx, wz)
  const canvasToWorld = (cx: number, cy: number) => {
    const wx = (cx / SIZE) * MAP_SIZE;
    const wz = (cy / SIZE) * MAP_SIZE;
    return {
      x: Math.max(0, Math.min(MAP_SIZE, wx)),
      z: Math.max(0, Math.min(MAP_SIZE, wz)),
    };
  };

  // Convert world coords (wx, wz) to canvas pixel (cx, cy)
  const worldToCanvas = (wx: number, wz: number) => {
    return {
      x: (wx / MAP_SIZE) * SIZE,
      y: (wz / MAP_SIZE) * SIZE,
    };
  };

  // Check if a point is in line of sight (LOS)
  const isPointInActiveVision = (wx: number, wz: number, friendlySources: (Unit | Building)[]) => {
    for (const source of friendlySources) {
      const radius = getVisionRadius(source);
      const dx = source.position.x - wx;
      const dz = source.position.z - wz;
      if (dx * dx + dz * dz <= radius * radius) {
        return true;
      }
    }
    return false;
  };

  // Main Minimap Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Friendly vision sources
    const friendlyUnits = gameState.units.filter((u) => u.owner === playerSlot);
    const friendlyBuildings = gameState.buildings.filter((b) => b.owner === playerSlot);
    const friendlySources: (Unit | Building)[] = [...friendlyUnits, ...friendlyBuildings];

    // Update explored grid based on active friendly vision
    friendlySources.forEach((source) => {
      const radius = getVisionRadius(source);
      const minX = Math.max(0, Math.floor(source.position.x - radius));
      const maxX = Math.min(MAP_SIZE - 1, Math.ceil(source.position.x + radius));
      const minZ = Math.max(0, Math.floor(source.position.z - radius));
      const maxZ = Math.min(MAP_SIZE - 1, Math.ceil(source.position.z + radius));

      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          const dx = source.position.x - x;
          const dz = source.position.z - z;
          if (dx * dx + dz * dz <= radius * radius) {
            exploredGrid.current[x][z] = true;
          }
        }
      }
    });

    // 1. Draw Background Ocean & Ikariam Island
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Deep Ocean Background
    const oceanGrad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    oceanGrad.addColorStop(0, '#0c2438');
    oceanGrad.addColorStop(1, '#082f49');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Island shape with organic coastline
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const baseR = SIZE * 0.40;

    // Draw Beach Coastline perimeter
    ctx.beginPath();
    for (let angle = 0; angle <= Math.PI * 2; angle += 0.08) {
      const a1 = Math.sin(angle * 3 + 0.4) * (SIZE * 0.042);
      const a2 = Math.cos(angle * 5 + 1.2) * (SIZE * 0.025);
      const a3 = Math.sin(angle * 7) * (SIZE * 0.013);
      const r = baseR + a1 + a2 + a3;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (angle === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#d4b483'; // Sandy beach coastline
    ctx.fill();

    // Draw Lush Green Island Interior
    ctx.beginPath();
    for (let angle = 0; angle <= Math.PI * 2; angle += 0.08) {
      const a1 = Math.sin(angle * 3 + 0.4) * (SIZE * 0.042);
      const a2 = Math.cos(angle * 5 + 1.2) * (SIZE * 0.025);
      const a3 = Math.sin(angle * 7) * (SIZE * 0.013);
      const r = Math.max(0, baseR - 4 + a1 + a2 + a3);
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (angle === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const islandGrad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    islandGrad.addColorStop(0, '#2e5a1c');
    islandGrad.addColorStop(0.5, '#3b6f25');
    islandGrad.addColorStop(1, '#4a7c2c');
    ctx.fillStyle = islandGrad;
    ctx.fill();

    // Skyrim-style Impassable Mountain Crags on Minimap
    const mountainCrags = [
      { x: 31, z: 12, rx: 8.5, rz: 4.5 }, // Northern Massif
      { x: 29, z: 49, rx: 8.0, rz: 4.0 }, // Southern Spine
      { x: 49, z: 22, rx: 5.5, rz: 5.5 }, // Eastern Crag
    ];

    mountainCrags.forEach((crag) => {
      const pt = worldToCanvas(crag.x, crag.z);
      const radX = (crag.rx / MAP_SIZE) * SIZE;
      const radZ = (crag.rz / MAP_SIZE) * SIZE;

      // Dark mountain base
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.ellipse(pt.x, pt.y, radX, radZ, 0, 0, Math.PI * 2);
      ctx.fill();

      // Rocky crest
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.ellipse(pt.x, pt.y - 1, radX * 0.7, radZ * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Snowy peak ridge
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.ellipse(pt.x, pt.y - 2, radX * 0.35, radZ * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // Meandering Procedural River on Minimap
    const riverCurve = (wz: number): number => {
      const t = wz / MAP_SIZE;
      return (
        MAP_SIZE * 0.50 +
        Math.sin(t * Math.PI * 2.1 + 0.3) * 6.5 +
        Math.cos(t * Math.PI * 4.0) * 2.2
      );
    };

    // Draw River Sandbanks
    ctx.strokeStyle = '#d4b483';
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let wz = 8; wz <= MAP_SIZE - 8; wz += 2) {
      const rx = riverCurve(wz);
      const pt = worldToCanvas(rx, wz);
      if (wz === 8) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    // Draw River Water
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let wz = 8; wz <= MAP_SIZE - 8; wz += 2) {
      const rx = riverCurve(wz);
      const pt = worldToCanvas(rx, wz);
      if (wz === 8) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    // Subtle grid pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridStep = SIZE / 6;
    for (let i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(i * gridStep, 0);
      ctx.lineTo(i * gridStep, SIZE);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i * gridStep);
      ctx.lineTo(SIZE, i * gridStep);
      ctx.stroke();
    }

    // 2. Draw Resource Nodes
    gameState.resourceNodes.forEach((res) => {
      const gx = Math.min(MAP_SIZE - 1, Math.max(0, Math.floor(res.position.x)));
      const gz = Math.min(MAP_SIZE - 1, Math.max(0, Math.floor(res.position.z)));
      const isExplored = !fogEnabled || exploredGrid.current[gx][gz];

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
      const gx = Math.min(MAP_SIZE - 1, Math.max(0, Math.floor(b.position.x)));
      const gz = Math.min(MAP_SIZE - 1, Math.max(0, Math.floor(b.position.z)));
      const isExplored = !fogEnabled || exploredGrid.current[gx][gz];

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
      const isVisible =
        !fogEnabled ||
        isFriendly ||
        isPointInActiveVision(u.position.x, u.position.z, friendlySources);

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
    if (fogEnabled) {
      // Create offscreen fog canvas
      const fogCanvas = document.createElement('canvas');
      fogCanvas.width = SIZE;
      fogCanvas.height = SIZE;
      const fogCtx = fogCanvas.getContext('2d');

      if (fogCtx) {
        // Step A: Base unexplored shroud (Deep dark black)
        fogCtx.fillStyle = 'rgba(7, 10, 15, 0.94)';
        fogCtx.fillRect(0, 0, SIZE, SIZE);

        // Step B: Explored area revelation (Lightened up to semi-transparent fog)
        const cellW = SIZE / MAP_SIZE;
        const cellH = SIZE / MAP_SIZE;
        fogCtx.fillStyle = 'rgba(20, 28, 40, 0.52)'; // Explored fog overlay color

        for (let x = 0; x < MAP_SIZE; x++) {
          for (let z = 0; z < MAP_SIZE; z++) {
            if (exploredGrid.current[x][z]) {
              // Mark as explored by carving out full darkness and replacing with light fog
              fogCtx.clearRect(x * cellW, z * cellH, cellW + 0.5, cellH + 0.5);
              fogCtx.fillRect(x * cellW, z * cellH, cellW + 0.5, cellH + 0.5);
            }
          }
        }

        // Step C: Cut out live Line of Sight (LOS) circles around friendly sources
        fogCtx.globalCompositeOperation = 'destination-out';

        friendlySources.forEach((source) => {
          const pt = worldToCanvas(source.position.x, source.position.z);
          const worldRadius = getVisionRadius(source);
          const canvasRadius = (worldRadius / MAP_SIZE) * SIZE;

          const grad = fogCtx.createRadialGradient(
            pt.x,
            pt.y,
            canvasRadius * 0.55,
            pt.x,
            pt.y,
            canvasRadius
          );
          grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
          grad.addColorStop(0.85, 'rgba(0, 0, 0, 0.8)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

          fogCtx.fillStyle = grad;
          fogCtx.beginPath();
          fogCtx.arc(pt.x, pt.y, canvasRadius, 0, Math.PI * 2);
          fogCtx.fill();
        });

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
        const r = (z.radius / MAP_SIZE) * SIZE;

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
  }, [gameState, engine, playerSlot, selectedEntityId, fogEnabled, workZones]);

  // Handle click or drag to move camera
  const handleInteraction = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !engine) return;

    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const world = canvasToWorld(cx, cy);
    engine.setCameraTarget(world.x, world.z);
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
    const myTc = gameState.buildings.find(
      (b) => b.owner === playerSlot && b.type === 'town_center'
    );
    if (myTc && engine) {
      engine.setCameraTarget(myTc.position.x, myTc.position.z);
    }
  };

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
            onClick={() => setFogEnabled(!fogEnabled)}
            title={fogEnabled ? 'Desativar Névoa de Guerra (Visão Total)' : 'Ativar Névoa de Guerra'}
            className={`p-1 rounded-lg transition-colors ${
              fogEnabled
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            }`}
          >
            {fogEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>

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
        <span className="text-slate-500 font-mono text-[9px]">Clique: Visão</span>
      </div>
    </div>
  );
};
