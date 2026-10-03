import React, { useEffect, useMemo, useRef } from 'react';
import { Compass, Globe2, MapPin, X } from 'lucide-react';
import type { GameState } from '../game/engine';
import { visionAt } from '../game/visibility';
import type { ProceduralMapResult } from '../game/proceduralMap';

interface WorldMapModalProps {
  open: boolean;
  map: ProceduralMapResult | null;
  gameState: GameState;
  visionGrid: Uint8Array;
  playerSlot: string;
  selectedEntityId: string | null;
  developerMode: boolean;
  revealAll: boolean;
  onClose: () => void;
  onNavigate: (x: number, z: number) => void;
  onPointerChange?: (isOver: boolean) => void;
}

const COLORS: Record<string, string> = {
  player1: '#60a5fa', player2: '#fb7185', player3: '#4ade80', player4: '#facc15',
};
const PALETTE: Record<string, [number, number, number]> = {
  ocean: [8, 39, 62], beach: [205, 177, 119], river: [30, 129, 166], valley: [91, 126, 61],
  plains: [82, 139, 65], hill: [117, 127, 65], mountain_peak: [112, 112, 106], lake: [45, 145, 178],
  forest: [38, 87, 53], volcanic: [83, 61, 57], glacier: [190, 218, 226], arid: [157, 132, 86],
};
const RESOLUTION = 220;

export const WorldMapModal: React.FC<WorldMapModalProps> = ({
  open, map, gameState, visionGrid, playerSlot, selectedEntityId, developerMode, revealAll, onClose, onNavigate, onPointerChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terrainRef = useRef<{ seed: number; canvas: HTMLCanvasElement } | null>(null);
  const islands = map?.islands ?? [];
  const knownIslands = useMemo(() => islands.filter((island) => {
    if (developerMode || revealAll) return true;
    if (!map) return false;
    const radius = Math.max(1, Math.ceil((island.radius / map.mapSize) * RESOLUTION));
    const cx = Math.floor((island.center.x / map.mapSize) * RESOLUTION);
    const cz = Math.floor((island.center.z / map.mapSize) * RESOLUTION);
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dz * dz > radius * radius) continue;
      const worldX = Math.floor(((cx + dx + 0.5) / RESOLUTION) * map.mapSize);
      const worldZ = Math.floor(((cz + dz + 0.5) / RESOLUTION) * map.mapSize);
      if (visionAt(visionGrid, worldX, worldZ, { size: map.mapSize }) > 0) return true;
    }
    return false;
  }), [islands, map, visionGrid, developerMode, revealAll]);

  useEffect(() => {
    if (!open || !map) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = RESOLUTION;
    canvas.height = RESOLUTION;

    if (terrainRef.current?.seed !== map.seed) {
      const terrainCanvas = document.createElement('canvas');
      terrainCanvas.width = RESOLUTION;
      terrainCanvas.height = RESOLUTION;
      const terrainContext = terrainCanvas.getContext('2d');
      if (terrainContext) {
        const terrain = terrainContext.createImageData(RESOLUTION, RESOLUTION);
        for (let z = 0; z < RESOLUTION; z++) for (let x = 0; x < RESOLUTION; x++) {
          const worldX = ((x + 0.5) / RESOLUTION) * map.mapSize;
          const worldZ = ((z + 0.5) / RESOLUTION) * map.mapSize;
          const cell = map.getCellAt(worldX, worldZ);
          const [r, g, b] = PALETTE[cell.biome] ?? PALETTE.plains;
          const index = (z * RESOLUTION + x) * 4;
          terrain.data[index] = r; terrain.data[index + 1] = g; terrain.data[index + 2] = b; terrain.data[index + 3] = 255;
        }
        terrainContext.putImageData(terrain, 0, 0);
        terrainRef.current = { seed: map.seed, canvas: terrainCanvas };
      }
    }
    if (terrainRef.current) ctx.drawImage(terrainRef.current.canvas, 0, 0);

    const known = (x: number, z: number) => developerMode || revealAll
      ? 2
      : visionAt(visionGrid, Math.floor(x), Math.floor(z), { size: map.mapSize });
    const point = (x: number, z: number) => ({ x: (x / map.mapSize) * RESOLUTION, y: (z / map.mapSize) * RESOLUTION });

    // Hide unknown terrain and mute places explored in the past, preserving the game fog rules.
    if (!(developerMode || revealAll)) {
      const fog = ctx.createImageData(RESOLUTION, RESOLUTION);
      for (let z = 0; z < RESOLUTION; z++) for (let x = 0; x < RESOLUTION; x++) {
        const worldX = Math.floor(((x + 0.5) / RESOLUTION) * map.mapSize);
        const worldZ = Math.floor(((z + 0.5) / RESOLUTION) * map.mapSize);
        const state = visionAt(visionGrid, worldX, worldZ, { size: map.mapSize });
        const alpha = state === 2 ? 0 : state === 1 ? 122 : 247;
        const pixel = (z * RESOLUTION + x) * 4;
        fog.data[pixel] = 3; fog.data[pixel + 1] = 10; fog.data[pixel + 2] = 18; fog.data[pixel + 3] = alpha;
      }
      ctx.putImageData(fog, 0, 0);
    }

    islands.forEach((island, index) => {
      const state = known(island.center.x, island.center.z);
      if (state === 0) return;
      const p = point(island.center.x, island.center.z);
      ctx.save();
      ctx.font = 'bold 5px system-ui';
      ctx.textAlign = 'center';
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(5, 12, 20, .9)';
      ctx.fillStyle = state === 2 ? '#f4d28a' : '#9ba9ab';
      ctx.strokeText(island.name, p.x, p.y - 5);
      ctx.fillText(island.name, p.x, p.y - 5);
      ctx.restore();
      if (developerMode || revealAll) {
        ctx.strokeStyle = `hsla(${(index * 57 + 30) % 360}, 75%, 72%, .75)`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(6, (island.radius / map.mapSize) * RESOLUTION), 0, Math.PI * 2); ctx.stroke();
      }
    });

    gameState.resourceNodes.forEach((node) => {
      if (known(node.position.x, node.position.z) === 0) return;
      const p = point(node.position.x, node.position.z);
      ctx.fillStyle = node.type === 'gold_mine' ? '#facc15' : node.type === 'stone' ? '#cbd5e1' : node.type === 'tree' ? '#164e36' : '#fb7185';
      ctx.fillRect(p.x - 0.55, p.y - 0.55, 1.1, 1.1);
    });
    gameState.buildings.forEach((building) => {
      const state = known(building.position.x, building.position.z);
      if (state === 0 && building.owner !== playerSlot) return;
      const p = point(building.position.x, building.position.z);
      ctx.fillStyle = COLORS[building.owner] ?? '#e2e8f0';
      ctx.strokeStyle = building.id === selectedEntityId ? '#ffffff' : '#0b1220';
      ctx.lineWidth = building.id === selectedEntityId ? 1.5 : 0.7;
      ctx.fillRect(p.x - (building.type === 'town_center' ? 2.2 : 1.3), p.y - (building.type === 'town_center' ? 2.2 : 1.3), building.type === 'town_center' ? 4.4 : 2.6, building.type === 'town_center' ? 4.4 : 2.6);
      ctx.strokeRect(p.x - (building.type === 'town_center' ? 2.2 : 1.3), p.y - (building.type === 'town_center' ? 2.2 : 1.3), building.type === 'town_center' ? 4.4 : 2.6, building.type === 'town_center' ? 4.4 : 2.6);
    });
    gameState.units.forEach((unit) => {
      if (known(unit.position.x, unit.position.z) === 0 && unit.owner !== playerSlot) return;
      const p = point(unit.position.x, unit.position.z);
      ctx.fillStyle = COLORS[unit.owner] ?? '#e2e8f0';
      ctx.beginPath(); ctx.arc(p.x, p.y, unit.id === selectedEntityId ? 1.8 : 1, 0, Math.PI * 2); ctx.fill();
      if (unit.id === selectedEntityId) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.7; ctx.stroke(); }
    });
  }, [open, map, gameState, visionGrid, playerSlot, selectedEntityId, developerMode, revealAll, islands]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!map) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * map.mapSize;
    const z = ((event.clientY - rect.top) / rect.height) * map.mapSize;
    onNavigate(x, z);
    onClose();
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-md sm:p-6" onMouseEnter={() => onPointerChange?.(true)} onMouseLeave={() => onPointerChange?.(false)}>
      <section className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-amber-700/50 bg-[#101a20] text-slate-100 shadow-[0_30px_100px_rgba(0,0,0,.7)]">
        <header className="flex items-center justify-between border-b border-amber-900/40 bg-gradient-to-r from-[#18272b] via-[#172127] to-[#1d2b2b] px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2 text-amber-300"><Globe2 className="h-5 w-5" /></div>
            <div><h2 className="font-serif text-lg font-bold tracking-wide text-amber-100">Carta do Mundo</h2><p className="text-[11px] text-slate-400">Arquipélago • {developerMode || revealAll ? 'visão de cartógrafo' : 'áreas conhecidas'}</p></div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:border-amber-500/60 hover:text-white" aria-label="Fechar mapa mundi"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:flex-row sm:p-5">
          <div className="relative mx-auto aspect-square w-full max-w-[min(68vh,68vw)] overflow-hidden rounded-xl border border-amber-800/50 bg-[#071521] shadow-inner">
            <canvas ref={canvasRef} onClick={handleCanvasClick} className="h-full w-full cursor-crosshair image-pixelated" aria-label="Mapa mundi. Clique para mover a câmera para uma região." />
            <div className="pointer-events-none absolute inset-0 border-[10px] border-[#07111a]/35" />
            <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-lg border border-slate-600/40 bg-slate-950/75 px-2.5 py-1.5 text-[10px] text-slate-300 backdrop-blur">
              <Compass className="h-3.5 w-3.5 text-amber-300" /> Clique no mapa para navegar a câmera
            </div>
          </div>
          <aside className="flex min-h-0 w-full flex-col gap-3 sm:w-64 sm:shrink-0">
            <div className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-3">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-200"><MapPin className="h-3.5 w-3.5" /> Ilhas conhecidas</h3>
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {knownIslands.length === 0 && <p className="py-2 text-xs text-slate-500">Explore com barcos ou unidades para revelar terras.</p>}
                {knownIslands.map((island) => (
                  <button key={island.id} type="button" onClick={() => { onNavigate(island.center.x, island.center.z); onClose(); }} className="flex w-full items-start justify-between rounded-lg border border-transparent px-2.5 py-2 text-left hover:border-amber-600/30 hover:bg-amber-500/5">
                    <span className="text-xs text-slate-200">{island.name}</span><span className="ml-2 shrink-0 font-mono text-[9px] text-slate-500">{Math.round(island.center.x)},{Math.round(island.center.z)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-3 text-[11px] text-slate-400">
              <div className="mb-2 font-semibold text-slate-200">Legenda</div>
              <div className="grid grid-cols-2 gap-y-1.5">
                <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-blue-400" />Seu império</span>
                <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-rose-400" />Outras facções</span>
                <span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-amber-300" />Minério</span>
                <span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-slate-300" />Pedra</span>
              </div>
            </div>
            <p className="mt-auto text-[10px] leading-relaxed text-slate-500">Na partida, regiões desconhecidas permanecem encobertas. No modo desenvolvedor com revelação total, todas as ilhas, recursos e posições ficam visíveis.</p>
          </aside>
        </div>
      </section>
    </div>
  );
};
