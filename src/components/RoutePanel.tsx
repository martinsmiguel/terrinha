import { useState } from 'react';
import { Anchor, Pause, Play, Route, X } from 'lucide-react';
import type { GameState, Unit } from '../game/model';
import { cargoCapacity } from '../game/colonialTransport';
import { routeProblems, routeView, type RouteConfig, type RouteResource } from '../game/tradeRoutes';

export interface RoutePortOption { buildingId: string; name: string; berth: { x: number; z: number } }

interface RoutePanelProps {
  boat: Unit;
  gameState: GameState;
  ports: RoutePortOption[];
  /** Envia o comando real ao host; a autorização acontece lá. */
  send(command: unknown): void;
  onFocusBoat(x: number, z: number): void;
}

const RESOURCES: { value: RouteResource; label: string }[] = [
  { value: 'wood', label: 'Madeira' }, { value: 'food', label: 'Comida' }, { value: 'gold', label: 'Ouro' },
  { value: 'stone', label: 'Pedra' }, { value: 'planks', label: 'Tábuas' },
];
const TONE: Record<string, string> = {
  ok: 'text-emerald-300', wait: 'text-amber-300', alert: 'text-rose-300', idle: 'text-slate-300',
};

/** Configuração e acompanhamento da rota comercial automática de um mercante próprio. */
export function RoutePanel({ boat, gameState, ports, send, onFocusBoat }: RoutePanelProps) {
  const capacity = cargoCapacity(boat.type);
  const [a, setA] = useState(ports[0]?.buildingId ?? '');
  const [b, setB] = useState(ports[1]?.buildingId ?? '');
  const [outResource, setOutResource] = useState<RouteResource>('wood');
  const [outAmount, setOutAmount] = useState(Math.min(50, capacity));
  const [emptyBack, setEmptyBack] = useState(true);
  const [backResource, setBackResource] = useState<RouteResource>('stone');
  const [backAmount, setBackAmount] = useState(Math.min(50, capacity));
  const [partial, setPartial] = useState(false);

  const route = boat.route;
  const portOf = (id: string) => ports.find((port) => port.buildingId === id);
  const nameOf = (id: string) => portOf(id)?.name ?? 'cais perdido';

  if (route) {
    const view = routeView(route);
    const lostEnd = route.status === 'blocked' && route.cause === 'lost' ? (portOf(route.a.buildingId) ? 'b' : 'a') : null;
    const replacements = ports.filter((port) => port.buildingId !== route.a.buildingId && port.buildingId !== route.b.buildingId);
    return (
      <div className="mt-2 space-y-1.5 rounded-xl border border-slate-700 bg-slate-900/60 p-2.5 text-xs" aria-label="Rota comercial">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-semibold text-slate-100"><Route className="h-3.5 w-3.5" /> Rota comercial</span>
          <span role="status" className={`font-bold ${TONE[view.tone]}`}>{view.label}</span>
        </div>
        <div className="text-[11px] text-slate-300">
          {nameOf(route.a.buildingId)} ⇄ {nameOf(route.b.buildingId)} · ida {route.outbound.amount} {route.outbound.resource}
          {route.back ? ` · volta ${route.back.amount} ${route.back.resource}` : ' · volta vazia'}{route.partial ? ' · carga parcial permitida' : ''}
        </div>
        {view.reason && <div className="text-[11px] text-amber-200">{view.reason}</div>}
        <div className="flex flex-wrap gap-1.5">
          {route.paused ? (
            <button type="button" onClick={() => send({ type: 'resume_route', boatId: boat.id })} className="flex items-center gap-1 rounded-lg bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600">
              <Play className="h-3 w-3" /> Retomar
            </button>
          ) : (
            <button type="button" onClick={() => send({ type: 'pause_route', boatId: boat.id })} className="flex items-center gap-1 rounded-lg bg-slate-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-600">
              <Pause className="h-3 w-3" /> Pausar
            </button>
          )}
          <button type="button" onClick={() => send({ type: 'cancel_route', boatId: boat.id })} title="O porão fica a bordo; nada é devolvido nem entregue" className="flex items-center gap-1 rounded-lg bg-rose-800 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-700">
            <X className="h-3 w-3" /> Cancelar
          </button>
          <button type="button" onClick={() => onFocusBoat(boat.position.x, boat.position.z)} className="flex items-center gap-1 rounded-lg bg-cyan-800 px-2 py-1 text-[11px] font-semibold text-white hover:bg-cyan-700">
            <Anchor className="h-3 w-3" /> Localizar barco
          </button>
        </div>
        {lostEnd && replacements.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-slate-400">Redirecionar para:</span>
            {replacements.map((port) => (
              <button key={port.buildingId} type="button" onClick={() => send({ type: 'redirect_route', boatId: boat.id, end: lostEnd, port: { buildingId: port.buildingId, berth: port.berth } })} className="rounded-lg bg-amber-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-600">
                {port.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const portA = portOf(a);
  const portB = portOf(b);
  const config: RouteConfig | null = portA && portB
    ? {
        a: { buildingId: portA.buildingId, berth: portA.berth },
        b: { buildingId: portB.buildingId, berth: portB.berth },
        outbound: { resource: outResource, amount: outAmount },
        back: emptyBack ? null : { resource: backResource, amount: backAmount },
        partial,
      }
    : null;
  const problems = config ? routeProblems(gameState, boat.id, config) : ['Escolha dois cais próprios e concluídos.'];
  if (ports.length < 2) problems.unshift('É preciso ter pelo menos dois cais próprios concluídos com água navegável ao lado.');
  const field = 'rounded-md border border-slate-600 bg-slate-800 px-1.5 py-1 text-[11px] text-slate-100';

  return (
    <form
      className="mt-2 space-y-1.5 rounded-xl border border-slate-700 bg-slate-900/60 p-2.5 text-xs"
      aria-label="Configurar rota comercial"
      onSubmit={(event) => {
        event.preventDefault();
        if (config && problems.length === 0) send({ type: 'set_route', boatId: boat.id, ...config });
      }}
    >
      <div className="flex items-center gap-1.5 font-semibold text-slate-100"><Route className="h-3.5 w-3.5" /> Rota comercial (porão {capacity})</div>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="space-y-0.5"><span className="text-[10px] text-slate-400">Porto A</span>
          <select className={`${field} w-full`} value={a} onChange={(event) => setA(event.target.value)}>
            {ports.map((port) => <option key={port.buildingId} value={port.buildingId}>{port.name}</option>)}
          </select></label>
        <label className="space-y-0.5"><span className="text-[10px] text-slate-400">Porto B</span>
          <select className={`${field} w-full`} value={b} onChange={(event) => setB(event.target.value)}>
            {ports.map((port) => <option key={port.buildingId} value={port.buildingId}>{port.name}</option>)}
          </select></label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-slate-400">Ida A→B</span>
        <select className={field} value={outResource} onChange={(event) => setOutResource(event.target.value as RouteResource)} aria-label="Recurso da ida">
          {RESOURCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <input className={`${field} w-16`} type="number" min={1} max={capacity} value={outAmount} onChange={(event) => setOutAmount(Number(event.target.value))} aria-label="Quantidade da ida" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="flex items-center gap-1 text-[10px] text-slate-300"><input type="checkbox" checked={emptyBack} onChange={(event) => setEmptyBack(event.target.checked)} /> Volta vazia</label>
        {!emptyBack && (
          <>
            <select className={field} value={backResource} onChange={(event) => setBackResource(event.target.value as RouteResource)} aria-label="Recurso da volta">
              {RESOURCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <input className={`${field} w-16`} type="number" min={1} max={capacity} value={backAmount} onChange={(event) => setBackAmount(Number(event.target.value))} aria-label="Quantidade da volta" />
          </>
        )}
      </div>
      <label className="flex items-center gap-1 text-[10px] text-slate-300"><input type="checkbox" checked={partial} onChange={(event) => setPartial(event.target.checked)} /> Aceitar carga parcial (sem isso o barco espera o estoque completo)</label>
      {problems.length > 0 && <ul className="list-disc pl-4 text-[10px] text-amber-200">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
      <button type="submit" disabled={problems.length > 0} className={`rounded-lg px-3 py-1 text-[11px] font-bold text-white ${problems.length === 0 ? 'bg-emerald-700 hover:bg-emerald-600' : 'cursor-not-allowed bg-slate-700 text-slate-400'}`}>
        Iniciar rota
      </button>
    </form>
  );
}
