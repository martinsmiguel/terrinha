/**
 * Ensaio de compressão de snapshots (card #53): compara perMessageDeflate ligado/desligado com quatro jogadores.
 * Mede bytes no fio (proxy TCP), CPU do servidor e latência do envio do host até o recebimento pelos convidados.
 * Cenários: loopback e link simulado (largura de banda limitada + atraso). Simulação NÃO substitui quatro dispositivos reais.
 *
 * Uso: npx tsx scripts/bench-compressao.ts [--frames=200] [--out=docs/evidence/card-53/benchmark.json]
 */
import { fork } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import { createServer as createTcpServer, connect, type Socket as TcpSocket, type AddressInfo } from 'node:net';
import { cpus, totalmem } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Server as SocketServer } from 'socket.io';
import { io as connectSocket, type Socket } from 'socket.io-client';
import { registerGameSocketHandlers } from '../src/game/socketServer';

const SELF = fileURLToPath(import.meta.url);
const arg = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;

/* ---------- modo servidor (processo filho: CPU medida isoladamente) ---------- */
if (process.argv.includes('--server')) {
  const compressed = process.argv.includes('--compressed');
  const http: HttpServer = createServer();
  const io = new SocketServer(http, {
    transports: ['websocket'],
    ...(compressed ? { httpCompression: { threshold: 1024 }, perMessageDeflate: { threshold: 1024 } } : { httpCompression: false, perMessageDeflate: false }),
  });
  registerGameSocketHandlers(io);
  http.listen(0, '127.0.0.1', () => process.send?.({ type: 'ready', port: (http.address() as AddressInfo).port }));
  process.on('message', (message: { type: string }) => {
    if (message.type === 'cpu') process.send?.({ type: 'cpu', usage: process.cpuUsage() });
    if (message.type === 'stop') process.exit(0);
  });
} else {
  void main();
}

/* ---------- proxy TCP: conta bytes e simula banda/atraso por sentido ---------- */
interface Link { bandwidthMbps: number; oneWayDelayMs: number }
interface Counters { toClients: number; toServer: number }

function shape(source: TcpSocket, sink: TcpSocket, link: Link | null, onBytes: (n: number) => void) {
  let readyAt = 0;
  source.on('data', (chunk: Buffer) => {
    onBytes(chunk.length);
    if (!link) { sink.write(chunk); return; }
    const transmitMs = (chunk.length * 8) / (link.bandwidthMbps * 1000); // Mbit/s -> bits/ms
    const now = performance.now();
    readyAt = Math.max(readyAt, now) + transmitMs;
    setTimeout(() => { if (!sink.destroyed) sink.write(chunk); }, readyAt - now + link.oneWayDelayMs);
  });
  source.on('end', () => setTimeout(() => sink.end(), link ? link.oneWayDelayMs + 5 : 0));
  source.on('error', () => sink.destroy());
}

function startProxy(targetPort: number, link: Link | null, counters: Counters): Promise<{ port: number; close: () => void }> {
  const sockets = new Set<TcpSocket>();
  const server = createTcpServer((client) => {
    const upstream = connect(targetPort, '127.0.0.1');
    sockets.add(client); sockets.add(upstream);
    shape(client, upstream, link, (n) => { counters.toServer += n; });
    shape(upstream, client, link, (n) => { counters.toClients += n; });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    port: (server.address() as AddressInfo).port,
    close: () => { sockets.forEach((s) => s.destroy()); server.close(); },
  })));
}

/* ---------- cenário ---------- */
const once = <T>(socket: Socket, event: string, timeoutMs = 10000) => new Promise<T>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout aguardando ${event}`)), timeoutMs);
  socket.once(event, (payload: T) => { clearTimeout(timer); resolve(payload); });
});

const snapshotOf = (tick: number) => ({
  tick,
  units: Array.from({ length: 160 }, (_, i) => ({
    id: `unit-${i}`, type: i % 2 === 0 ? 'villager' : 'soldier', owner: `player${(i % 4) + 1}`,
    position: { x: (i * 17 + tick) % 60, z: (i * 29 + tick) % 60 }, targetPosition: { x: (i * 31) % 60, z: (i * 11) % 60 },
    targetEntityId: null, health: 100, maxHealth: 100, state: 'moving',
  })),
});

const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil((p / 100) * values.length) - 1)];

async function runScenario(compressed: boolean, link: Link | null, frames: number) {
  const child = fork(SELF, ['--server', ...(compressed ? ['--compressed'] : [])], { execArgv: process.execArgv });
  const { port } = await new Promise<{ port: number }>((resolve) => child.once('message', (m: { port: number }) => resolve(m)));
  const counters: Counters = { toClients: 0, toServer: 0 };
  const proxy = await startProxy(port, link, counters);
  const url = `http://127.0.0.1:${proxy.port}`;
  const sockets: Socket[] = [];
  const room = `bench-${compressed ? "on" : "off"}-${Math.floor(Math.random() * 1e9)}`;
  for (let slot = 1; slot <= 4; slot += 1) {
    const socket = connectSocket(url, { autoConnect: false, reconnection: false, transports: ['websocket'], perMessageDeflate: compressed ? { threshold: 1024 } : false } as never);
    const connected = once<void>(socket, 'connect');
    socket.connect();
    await connected;
    const joined = once(socket, 'joined-success');
    socket.emit('join-room', { roomId: room, playerName: `P${slot}`, playerSlot: `player${slot}`, isHost: slot === 1 });
    await joined;
    sockets.push(socket);
  }
  const cpuBefore = await new Promise<NodeJS.CpuUsage>((resolve) => { child.once('message', (m: { usage: NodeJS.CpuUsage }) => resolve(m.usage)); child.send({ type: 'cpu' }); });
  const baseline = { ...counters };
  const latencies: number[] = [];
  let outOfOrder = 0;
  let corrupt = 0;
  const lastTick = [-1, -1, -1, -1];
  const sentAt = new Map<number, number>();
  let pending = 0;
  let done!: () => void;
  const finished = new Promise<void>((resolve) => { done = resolve; });
  [1, 2, 3].forEach((index) => sockets[index].on('game-state-update', (state: ReturnType<typeof snapshotOf>) => {
    latencies.push(performance.now() - sentAt.get(state.tick)!);
    if (state.tick <= lastTick[index]) outOfOrder += 1;
    lastTick[index] = state.tick;
    if (state.units.length !== 160 || state.units[159].id !== 'unit-159') corrupt += 1;
    pending -= 1;
    if (pending === 0 && lastTick[1] === frames - 1) done();
  }));
  const startedAt = performance.now();
  for (let tick = 0; tick < frames; tick += 1) {
    sentAt.set(tick, performance.now());
    pending += 3;
    const snapshot = snapshotOf(tick);
    [2, 3, 4].forEach((slot) => sockets[0].emit('sync-game-state-to', { slot: `player${slot}`, state: snapshot }));
    await new Promise((resolve) => setTimeout(resolve, 50)); // 20 Hz
  }
  await Promise.race([finished, new Promise((resolve) => setTimeout(resolve, 5000))]);
  const wallMs = performance.now() - startedAt;
  const cpuAfter = await new Promise<NodeJS.CpuUsage>((resolve) => { child.once('message', (m: { usage: NodeJS.CpuUsage }) => resolve(m.usage)); child.send({ type: 'cpu' }); });
  const delivered = latencies.length;
  const bytesToClients = counters.toClients - baseline.toClients;
  sockets.forEach((s) => s.disconnect());
  proxy.close();
  child.send({ type: 'stop' });
  const cpuMs = (cpuAfter.user - cpuBefore.user + cpuAfter.system - cpuBefore.system) / 1000;
  return {
    compressed,
    link: link ?? 'loopback',
    frames,
    delivered,
    expectedDeliveries: frames * 3,
    outOfOrder,
    corrupt,
    bytesToClients,
    bytesPerSnapshot: Math.round(bytesToClients / Math.max(1, delivered)),
    serverCpuMs: +cpuMs.toFixed(1),
    serverCpuPercentOfOneCore: +((cpuMs / wallMs) * 100).toFixed(2),
    latencyMs: { p50: +percentile(latencies, 50).toFixed(2), p95: +percentile(latencies, 95).toFixed(2), max: +Math.max(...latencies).toFixed(2) },
  };
}

async function main() {
  const frames = Number(arg('frames', '200'));
  const out = arg('out', 'docs/evidence/card-53/benchmark.json');
  const links: { name: string; link: Link | null }[] = [
    { name: 'loopback', link: null },
    { name: 'wifi-simulado-20mbps-8ms', link: { bandwidthMbps: 20, oneWayDelayMs: 8 } },
    { name: 'wifi-simulado-5mbps-15ms', link: { bandwidthMbps: 5, oneWayDelayMs: 15 } },
  ];
  const rows: Record<string, unknown>[] = [];
  const only = arg('only', '');
  for (const { name, link } of links.filter((l) => !only || l.name.includes(only))) {
    const off = await runScenario(false, link, frames);
    const on = await runScenario(true, link, frames);
    const row = {
      scenario: name,
      off, on,
      byteReduction: +(1 - on.bytesToClients / off.bytesToClients).toFixed(3),
      p95LatencyDeltaMs: +(on.latencyMs.p95 - off.latencyMs.p95).toFixed(2),
      cpuDeltaMs: +(on.serverCpuMs - off.serverCpuMs).toFixed(1),
    };
    rows.push(row);
    console.log(`${name}: bytes -${(row.byteReduction * 100).toFixed(1)}%, p95 ${off.latencyMs.p95} -> ${on.latencyMs.p95} ms, CPU ${off.serverCpuMs} -> ${on.serverCpuMs} ms`);
  }
  /**
   * Limiar de aceite (vale só para links limitados; loopback é informativo e não mede latência percebida):
   * manter a compressão se cortar >= 50% dos bytes, não piorar o p95 em mais de 10 ms e entregar todos os quadros.
   */
  const threshold = { minByteReduction: 0.5, maxP95RegressionMs: 10, scenarios: 'wifi-simulado-*' };
  const gated = rows.filter((r) => String(r.scenario).startsWith('wifi-simulado'));
  const passes = (r: Record<string, unknown>) => (r.byteReduction as number) >= threshold.minByteReduction
    && (r.p95LatencyDeltaMs as number) <= threshold.maxP95RegressionMs
    && (r.on as { delivered: number; expectedDeliveries: number; outOfOrder: number; corrupt: number }).delivered === (r.on as { expectedDeliveries: number }).expectedDeliveries
    && (r.on as { outOfOrder: number }).outOfOrder === 0 && (r.on as { corrupt: number }).corrupt === 0;
  const verdict = gated.length && gated.every(passes) ? 'ganho-confirmado-no-ambiente-simulado' : 'sem-ganho-suficiente';
  const report = {
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model, cores: cpus().length, memoryGb: Math.round(totalmem() / 2 ** 30) },
    scenario: '4 jogadores, host envia 1 snapshot (160 unidades) por convidado a 20 Hz; servidor em processo próprio; bytes contados em proxy TCP',
    limitation: 'Quatro dispositivos reais em LAN/Wi-Fi NÃO foram usados: links são simulados por proxy no mesmo computador. Resultado não prova usabilidade em Wi-Fi real.',
    notes: 'Com compressão desligada o link de 5 Mbps satura e nem todos os quadros chegam dentro da tolerância; o p95 desse caso só considera os quadros entregues e subestima a piora.',
    threshold, verdict, rows,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`veredito: ${verdict}\nrelatório: ${out}`);
  process.exit(0);
}
