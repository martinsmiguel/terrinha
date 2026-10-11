import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GameEngine } from '../game/engine';
import { generateProceduralTerrain } from '../game/proceduralMap';

/**
 * Medição do custo de cada camada gráfica sobre o terreno e a contagem de objetos reais do jogo (mundo 280, semente 4242).
 * O tempo de quadro sincroniza a GPU a cada quadro (`readPixels` de 1 pixel): mede o custo total de preparar e terminar o
 * quadro, sem o teto do vsync. Não mede o jogo inteiro: os objetos são uma aproximação por primitivas.
 */

const SIZE = 280;
const SEED = 4242;
const out = document.getElementById('saida') as HTMLElement;
const log = (text: string) => { out.textContent += `${text}\n`; };

const container = document.getElementById('palco') as HTMLElement;
const engine = new GameEngine(container);
// O laço do jogo é trocado pelo da medição.
if (engine.animationFrameId !== null) cancelAnimationFrame(engine.animationFrameId);
const map = generateProceduralTerrain(SIZE, SEED);
engine.setWorldSize(SIZE);
engine.setProceduralTerrainMesh(map.terrainMesh, map.waterMesh, map.riverBankDecorations);
const { renderer, scene, camera } = engine;
renderer.info.autoReset = false; // o Three zera o contador a cada passe do composer; aqui o quadro inteiro é contado
const gl = renderer.getContext() as WebGL2RenderingContext;
const sun = scene.children.find((c): c is THREE.DirectionalLight => c instanceof THREE.DirectionalLight)!;
const hemi = scene.children.find((c): c is THREE.HemisphereLight => c instanceof THREE.HemisphereLight)!;

/* ---------- vistas ---------- */
const VIEWS = {
  perto: { zoom: 32, target: { x: map.player1Spawn.x, z: map.player1Spawn.z } },
  longe: { zoom: 120, target: { x: SIZE / 2, z: SIZE / 2 } },
} as const;
type ViewName = keyof typeof VIEWS;
function setView(name: ViewName) {
  engine.zoomLevel = VIEWS[name].zoom;
  engine.cameraTarget.set(VIEWS[name].target.x, 0, VIEWS[name].target.z);
  engine.updateCameraPosition();
  camera.updateMatrixWorld();
}

/* ---------- objetos: como o jogo faz hoje (um Mesh por parte) e instanciado ---------- */
const matCache = new Map<string, THREE.MeshStandardMaterial>();
const mat = (color: number) => {
  const key = String(color);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  return matCache.get(key)!;
};
const geo = {
  trunk: new THREE.CylinderGeometry(0.18, 0.25, 1.2, 6),
  crown: new THREE.ConeGeometry(0.9, 2.2, 7),
  rock: new THREE.IcosahedronGeometry(0.7, 0),
  bush: new THREE.SphereGeometry(0.55, 8, 6),
  unitBody: new THREE.CapsuleGeometry(0.28, 0.6, 3, 8),
  unitHead: new THREE.SphereGeometry(0.22, 8, 6),
  house: new THREE.BoxGeometry(2.4, 1.6, 2.4),
  roof: new THREE.ConeGeometry(2, 1.2, 4),
};
const heightAt = (x: number, z: number) => map.getHeightAt(x, z);
interface Placed { geo: THREE.BufferGeometry; color: number; x: number; y: number; z: number; shadow: boolean }

function placements(): Placed[] {
  const list: Placed[] = [];
  for (const node of map.resourceNodes) {
    const { x, z } = node.position;
    const y = heightAt(x, z);
    if (node.type === 'tree') {
      list.push({ geo: geo.trunk, color: 0x5a3b22, x, y: y + 0.6, z, shadow: true });
      list.push({ geo: geo.crown, color: 0x2f6b34, x, y: y + 2.1, z, shadow: true });
    } else if (node.type === 'food_bush') list.push({ geo: geo.bush, color: 0x4f8a3a, x, y: y + 0.5, z, shadow: true });
    else if (node.type === 'fish_school') continue;
    else list.push({ geo: geo.rock, color: node.type === 'gold_mine' ? 0xc9a227 : 0x8a8a8a, x, y: y + 0.6, z, shadow: true });
  }
  const home = map.player1Spawn;
  for (let i = 0; i < 25; i += 1) { // edifícios ao redor da capital
    const a = (i / 25) * Math.PI * 2;
    const x = home.x + Math.cos(a) * (6 + (i % 3) * 3);
    const z = home.z + Math.sin(a) * (6 + (i % 3) * 3);
    const y = heightAt(x, z);
    list.push({ geo: geo.house, color: 0xb08a5a, x, y: y + 0.8, z, shadow: true });
    list.push({ geo: geo.roof, color: 0x8a3b2e, x, y: y + 2.2, z, shadow: true });
  }
  for (let i = 0; i < 120; i += 1) { // unidades
    const x = home.x + ((i * 37) % 21) - 10;
    const z = home.z + ((i * 53) % 21) - 10;
    const y = heightAt(x, z);
    const color = i % 2 ? 0x2a4d9b : 0xb03a2e;
    list.push({ geo: geo.unitBody, color, x, y: y + 0.65, z, shadow: true });
    list.push({ geo: geo.unitHead, color: 0xe8c9a0, x, y: y + 1.4, z, shadow: true });
  }
  return list;
}
const PLACED = placements();
const objects = new THREE.Group();
scene.add(objects);
function clearObjects() {
  for (const child of [...objects.children]) {
    objects.remove(child);
    if (child instanceof THREE.InstancedMesh) child.dispose();
  }
}
function populate(mode: 'meshes' | 'instanced' | 'none') {
  clearObjects();
  if (mode === 'none') return;
  if (mode === 'meshes') {
    for (const p of PLACED) {
      const mesh = new THREE.Mesh(p.geo, mat(p.color));
      mesh.position.set(p.x, p.y, p.z);
      mesh.castShadow = p.shadow;
      mesh.receiveShadow = true;
      objects.add(mesh);
    }
    return;
  }
  const groups = new Map<string, Placed[]>();
  for (const p of PLACED) { const key = `${p.geo.uuid}|${p.color}`; (groups.get(key) ?? groups.set(key, []).get(key)!).push(p); }
  const m4 = new THREE.Matrix4();
  for (const items of groups.values()) {
    const inst = new THREE.InstancedMesh(items[0].geo, mat(items[0].color), items.length);
    items.forEach((p, i) => inst.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.instanceMatrix.needsUpdate = true;
    objects.add(inst);
  }
}

/* ---------- grama instanciada com vento ---------- */
let grass: THREE.InstancedMesh | null = null;
const windUniform = { value: 0 };
function setGrass(count: number, center: { x: number; z: number }) {
  if (grass) { scene.remove(grass); grass.dispose(); grass = null; }
  if (count <= 0) return;
  const blade = new THREE.PlaneGeometry(0.12, 0.6, 1, 3);
  blade.translate(0, 0.3, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0x6aa84f, side: THREE.DoubleSide, roughness: 1 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniform;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nfloat sway = sin(uTime * 2.0 + instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.5) * 0.12;\ntransformed.x += sway * position.y;\n#endif');
  };
  grass = new THREE.InstancedMesh(blade, material, count);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 6) {
    guard += 1;
    const r = Math.sqrt(Math.random()) * 70;
    const a = Math.random() * Math.PI * 2;
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    if (x < 1 || z < 1 || x > SIZE - 1 || z > SIZE - 1 || !map.canStandAt('human', x, z)) continue;
    e.set(0, Math.random() * Math.PI, 0);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, heightAt(x, z), z), q, new THREE.Vector3(1, 0.6 + Math.random() * 0.8, 1));
    grass.setMatrixAt(placed, m4);
    placed += 1;
  }
  grass.count = placed;
  grass.instanceMatrix.needsUpdate = true;
  grass.frustumCulled = false;
  scene.add(grass);
}

/* ---------- terreno em blocos (estilo voxel) gerado do mapa de alturas atual ---------- */
// A simulação já é em grade de 1 célula; aqui só o desenho vira blocos. A textura é GERADA POR CÓDIGO (canvas), sem arquivo.
const voxelGroup = new THREE.Group();
voxelGroup.visible = false;
scene.add(voxelGroup);
let voxelBuildMs = 0;
let voxelTriangles = 0;
type Tile = 0 | 1 | 2 | 3; // grama, terra, pedra, areia
function atlasTexture(): THREE.CanvasTexture {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size * 4;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  const bases = ['#5a9e3f', '#7a5230', '#7d7d7d', '#d9c98a'];
  let seed = 7;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  bases.forEach((color, tile) => {
    g.fillStyle = color;
    g.fillRect(tile * size, 0, size, size);
    for (let i = 0; i < 90; i += 1) { // ruído de "pixel art": pontos claros e escuros
      const shade = rand() > 0.5 ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.16)';
      g.fillStyle = shade;
      g.fillRect(tile * size + Math.floor(rand() * size), Math.floor(rand() * size), 1, 1);
    }
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const ATLAS = atlasTexture();
const TILE_COLOR: Record<Tile, THREE.Color> = { 0: new THREE.Color('#5a9e3f'), 1: new THREE.Color('#7a5230'), 2: new THREE.Color('#7d7d7d'), 3: new THREE.Color('#d9c98a') };

function buildVoxel(textured: boolean) {
  const t0 = performance.now();
  for (const child of [...voxelGroup.children]) { voxelGroup.remove(child); (child as THREE.Mesh).geometry.dispose(); }
  const Q = 0.5;
  const heights = new Float32Array(SIZE * SIZE);
  const tops = new Uint8Array(SIZE * SIZE);
  let maxH = 0;
  for (let x = 0; x < SIZE; x += 1) for (let z = 0; z < SIZE; z += 1) {
    const h = heightAt(x + 0.5, z + 0.5);
    heights[x * SIZE + z] = Math.max(-1, Math.round(h / Q) * Q);
    maxH = Math.max(maxH, h);
  }
  for (let x = 0; x < SIZE; x += 1) for (let z = 0; z < SIZE; z += 1) {
    const h = heights[x * SIZE + z];
    const wet = map.isWaterAt(x + 0.5, z + 0.5);
    tops[x * SIZE + z] = wet || h < 0.4 ? 3 : h > maxH * 0.6 ? 2 : 0;
  }
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= SIZE || z >= SIZE ? -1 : heights[x * SIZE + z]);
  const material = new THREE.MeshStandardMaterial({ map: textured ? ATLAS : null, vertexColors: !textured, roughness: 1 });
  const CHUNK = 35;
  let triangles = 0;
  for (let cx = 0; cx < SIZE; cx += CHUNK) for (let cz = 0; cz < SIZE; cz += CHUNK) {
    const pos: number[] = []; const nor: number[] = []; const uv: number[] = []; const col: number[] = [];
    const quad = (p: number[][], n: number[], tile: Tile) => {
      const order = [0, 1, 2, 0, 2, 3];
      const uvq = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (const k of order) {
        pos.push(...p[k]); nor.push(...n);
        uv.push((tile + uvq[k][0]) / 4, uvq[k][1]);
        col.push(TILE_COLOR[tile].r, TILE_COLOR[tile].g, TILE_COLOR[tile].b);
      }
      triangles += 2;
    };
    for (let x = cx; x < Math.min(cx + CHUNK, SIZE); x += 1) for (let z = cz; z < Math.min(cz + CHUNK, SIZE); z += 1) {
      const h = heights[x * SIZE + z];
      quad([[x, h, z], [x, h, z + 1], [x + 1, h, z + 1], [x + 1, h, z]], [0, 1, 0], tops[x * SIZE + z] as Tile);
      const sideTile: Tile = tops[x * SIZE + z] === 2 ? 2 : tops[x * SIZE + z] === 3 ? 3 : 1;
      const lowE = at(x + 1, z); if (lowE < h) quad([[x + 1, lowE, z], [x + 1, lowE, z + 1], [x + 1, h, z + 1], [x + 1, h, z]], [1, 0, 0], sideTile);
      const lowW = at(x - 1, z); if (lowW < h) quad([[x, lowW, z + 1], [x, lowW, z], [x, h, z], [x, h, z + 1]], [-1, 0, 0], sideTile);
      const lowS = at(x, z + 1); if (lowS < h) quad([[x, lowS, z + 1], [x + 1, lowS, z + 1], [x + 1, h, z + 1], [x, h, z + 1]], [0, 0, 1], sideTile);
      const lowN = at(x, z - 1); if (lowN < h) quad([[x + 1, lowN, z], [x, lowN, z], [x, h, z], [x + 1, h, z]], [0, 0, -1], sideTile);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    voxelGroup.add(mesh);
  }
  voxelTriangles = triangles;
  voxelBuildMs = performance.now() - t0;
}

/* ---------- camadas ---------- */
const base = {
  toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure, background: scene.background,
  sunColor: sun.color.clone(), sunIntensity: sun.intensity, hemiSky: hemi.color.clone(), hemiGround: hemi.groundColor!.clone(),
  shadowSize: sun.shadow.mapSize.x, fogColor: (scene.fog as THREE.FogExp2).color.clone(), fogDensity: (scene.fog as THREE.FogExp2).density,
  castShadow: sun.castShadow,
};
function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#5b8fd1'); grad.addColorStop(0.6, '#a9c8e8'); grad.addColorStop(1, '#f2e4c8');
  g.fillStyle = grad; g.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const SKY = skyTexture();

function resetLook() {
  renderer.toneMapping = base.toneMapping;
  renderer.toneMappingExposure = base.exposure;
  scene.background = base.background;
  sun.color.copy(base.sunColor); sun.intensity = base.sunIntensity; hemi.color.copy(base.hemiSky); hemi.groundColor!.copy(base.hemiGround);
  (scene.fog as THREE.FogExp2).color.copy(base.fogColor);
  (scene.fog as THREE.FogExp2).density = base.fogDensity;
  sun.shadow.mapSize.set(base.shadowSize, base.shadowSize);
  sun.shadow.map?.dispose(); sun.shadow.map = null;
  sun.castShadow = base.castShadow;
  renderer.shadowMap.enabled = true;
}
/** Camada "luz e cor": tone mapping, céu em gradiente, luz quente, névoa na cor do horizonte, sombra 2048. */
function applyLook() {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  scene.background = SKY;
  sun.color.set(0xffe2b8); sun.intensity = 1.6;
  hemi.color.set(0xbcd4ff); hemi.groundColor!.set(0x6b5a3a);
  (scene.fog as THREE.FogExp2).color.set(0xcfd9e6);
  (scene.fog as THREE.FogExp2).density = 0.006;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.map?.dispose(); sun.shadow.map = null;
}

const GRADE = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.35 }, uSat: { value: 1.12 }, uContrast: { value: 1.06 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVignette; uniform float uSat; uniform float uContrast; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.299,0.587,0.114)); c.rgb = mix(vec3(l), c.rgb, uSat); c.rgb = (c.rgb - 0.5) * uContrast + 0.5;
      float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - uVignette * smoothstep(0.35, 0.85, d); gl_FragColor = c; }`,
};
const tiltShader = (dir: [number, number]) => ({
  uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(dir[0], dir[1]) }, uRes: { value: new THREE.Vector2(1, 1) }, uBand: { value: 0.28 }, uStrength: { value: 3.0 } },
  vertexShader: GRADE.vertexShader,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uDir; uniform vec2 uRes; uniform float uBand; uniform float uStrength; varying vec2 vUv;
    void main(){ float off = smoothstep(uBand, 0.5, abs(vUv.y - 0.5)); vec2 step = uDir * uStrength * off / uRes; vec4 s = texture2D(tDiffuse, vUv) * 0.2270270270;
      s += texture2D(tDiffuse, vUv + step * 1.3846153846) * 0.3162162162; s += texture2D(tDiffuse, vUv - step * 1.3846153846) * 0.3162162162;
      s += texture2D(tDiffuse, vUv + step * 3.2307692308) * 0.0702702703; s += texture2D(tDiffuse, vUv - step * 3.2307692308) * 0.0702702703; gl_FragColor = s; }`,
});

type PassName = 'smaa' | 'bloom' | 'gtao' | 'grade' | 'tilt';
let composer: EffectComposer | null = null;
function buildComposer(passes: PassName[], msaa: boolean): EffectComposer {
  const w = renderer.domElement.width;
  const h = renderer.domElement.height;
  const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: msaa ? 4 : 0 });
  const c = new EffectComposer(renderer, target);
  c.setPixelRatio(1);
  c.setSize(w, h);
  c.addPass(new RenderPass(scene, camera));
  for (const name of passes) {
    if (name === 'gtao') { const p = new GTAOPass(scene, camera, w, h); p.output = GTAOPass.OUTPUT.Default; c.addPass(p); }
    if (name === 'bloom') c.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.6, 0.85));
    if (name === 'tilt') {
      for (const dir of [[1, 0], [0, 1]] as [number, number][]) { const p = new ShaderPass(tiltShader(dir)); (p.uniforms.uRes.value as THREE.Vector2).set(w, h); c.addPass(p); }
    }
    if (name === 'grade') c.addPass(new ShaderPass(GRADE));
    if (name === 'smaa') c.addPass(new SMAAPass());
  }
  c.addPass(new OutputPass());
  return c;
}

/* ---------- medição ---------- */
const sync = new Uint8Array(4);
function frame(time: number) {
  windUniform.value = time / 1000;
  if (composer) composer.render(); else renderer.render(scene, camera);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, sync); // força a GPU a terminar o quadro
}
const stats = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return { median: +s[Math.floor(s.length / 2)].toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), min: +s[0].toFixed(2) }; };
interface Row { grupo: string; config: string; vista: ViewName; ms: ReturnType<typeof stats>; fps: number; chamadas: number; triangulos: number }
const rows: Row[] = [];
async function measure(grupo: string, config: string, vista: ViewName, runs = 3, frames = 60): Promise<Row> {
  setView(vista);
  for (let i = 0; i < 12; i += 1) frame(performance.now()); // aquecimento: compila shaders e aloca alvos
  await new Promise((r) => setTimeout(r, 0));
  const medians: number[] = [];
  const all: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const times: number[] = [];
    for (let i = 0; i < frames; i += 1) { const t0 = performance.now(); frame(t0); times.push(performance.now() - t0); }
    all.push(...times);
    medians.push(stats(times).median);
    await new Promise((r) => setTimeout(r, 0));
  }
  renderer.info.reset();
  frame(performance.now());
  const ms = stats(all);
  ms.median = +[...medians].sort((a, b) => a - b)[Math.floor(medians.length / 2)].toFixed(2);
  const row: Row = { grupo, config, vista, ms, fps: +(1000 / ms.median).toFixed(0), chamadas: renderer.info.render.calls, triangulos: renderer.info.render.triangles };
  rows.push(row);
  log(`${grupo} | ${config} | ${vista}: ${ms.median} ms (p95 ${ms.p95}) ~${row.fps} q/s, ${row.chamadas} chamadas, ${(row.triangulos / 1000).toFixed(0)}k tri`);
  return row;
}

interface Opts { look?: boolean; shadows?: boolean; objects?: 'meshes' | 'instanced' | 'none'; grass?: number; passes?: PassName[]; msaa?: boolean; composerOn?: boolean; terrain?: 'malha' | 'blocos' | 'blocos-textura' }
function setup(opts: Opts) {
  resetLook();
  if (opts.look) applyLook();
  sun.castShadow = opts.shadows !== false;
  populate(opts.objects ?? 'meshes');
  setGrass(opts.grass ?? 0, VIEWS.perto.target);
  const terrain = opts.terrain ?? 'malha';
  engine.groundMesh.visible = terrain === 'malha';
  voxelGroup.visible = terrain !== 'malha';
  if (terrain !== 'malha') buildVoxel(terrain === 'blocos-textura');
  composer?.dispose();
  composer = opts.composerOn || opts.passes ? buildComposer(opts.passes ?? [], opts.msaa ?? false) : null;
}

/** Combinação de orçamento: luz e cor, objetos instanciados, 100k de grama, SMAA e cor graduada, sem GTAO nem MSAA. */
const RECOMENDADO: Opts = { look: true, objects: 'instanced', grass: 100000, passes: ['smaa', 'grade'], msaa: false };
const RECOMENDADO_BLOOM: Opts = { ...RECOMENDADO, passes: ['smaa', 'bloom', 'grade'] };
const ALVO: Opts = { look: true, objects: 'instanced', grass: 100000, passes: ['bloom', 'gtao', 'grade', 'tilt'], msaa: true };

async function runAll() {
  out.textContent = '';
  rows.length = 0;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'desconhecida';
  renderer.setPixelRatio(1);
  renderer.setSize(container.clientWidth, container.clientHeight);
  const env = { gpu, versao: gl.getParameter(gl.VERSION), pixelRatio: renderer.getPixelRatio(), canvas: `${renderer.domElement.width}x${renderer.domElement.height}`, mundo: SIZE, semente: SEED, malhasDeObjetos: PLACED.length, userAgent: navigator.userAgent };
  log(`GPU: ${gpu}\nCanvas: ${env.canvas}; objetos: ${PLACED.length} malhas`);
  for (const vista of ['perto', 'longe'] as ViewName[]) {
    setup({}); await measure('A base', 'Como o jogo hoje', vista);
    setup({ shadows: false }); await measure('A base', 'Sem sombras (isola o custo da sombra)', vista);
    setup({ objects: 'none' }); await measure('A base', 'Só terreno (sem objetos)', vista);
    setup({ look: true }); await measure('B luz e cor', 'Tone mapping + céu + luz quente + névoa + sombra 2048', vista);
    setup({ composerOn: true, msaa: true }); await measure('C pós', 'Composer vazio (alvo HDR + MSAA 4x + saída)', vista);
    setup({ passes: ['smaa'] }); await measure('C pós', '+ SMAA (sem MSAA)', vista);
    setup({ passes: ['bloom'], msaa: true }); await measure('C pós', '+ Bloom', vista);
    setup({ passes: ['gtao'], msaa: true }); await measure('C pós', '+ Oclusão ambiente (GTAO)', vista);
    setup({ passes: ['grade'], msaa: true }); await measure('C pós', '+ Cor graduada e vinheta', vista);
    setup({ passes: ['tilt'], msaa: true }); await measure('C pós', '+ Tilt-shift (2 passes)', vista);
    setup({ look: true, passes: ['bloom', 'gtao', 'grade', 'tilt'], msaa: true }); await measure('C pós', 'Tudo: luz e cor + bloom + GTAO + cor + tilt-shift', vista);
    setup({ objects: 'instanced' }); await measure('D objetos', 'Instanciado (mesmos objetos)', vista);
    for (const n of [20000, 100000, 400000]) { setup({ grass: n }); await measure('E grama', `${n / 1000}k lâminas instanciadas com vento`, vista); }
    setup({ terrain: 'blocos' }); await measure('G blocos', `Terreno em blocos, cor por vértice (${(voxelTriangles / 1000).toFixed(0)}k tri; construído em ${voxelBuildMs.toFixed(0)} ms)`, vista);
    setup({ terrain: 'blocos-textura' }); await measure('G blocos', 'Terreno em blocos com textura gerada por código (atlas 4x16 px, NearestFilter)', vista);
    setup({ terrain: 'blocos-textura', look: true }); await measure('G blocos', 'Blocos com textura + luz e cor', vista);
    setup({ terrain: 'blocos-textura', ...ALVO }); await measure('G blocos', 'Blocos com textura + alvo completo (pós + instanciado + grama)', vista);
    setup(ALVO); await measure('F alvo', 'Alvo estilizado: tudo + objetos instanciados + 100k de grama', vista);
  }
  setup({});
  const result = { ambiente: env, voxel: { triangulos: voxelTriangles, construcaoMs: +voxelBuildMs.toFixed(0) }, linhas: rows };
  (window as unknown as { __grafico: unknown }).__grafico = result;
  log('Concluído. Resultado em window.__grafico');
  return result;
}

async function runExtra() {
  rows.length = 0;
  renderer.setPixelRatio(1);
  renderer.setSize(container.clientWidth, container.clientHeight);
  for (const vista of ['perto', 'longe'] as ViewName[]) {
    setup({ look: true, objects: 'instanced', grass: 100000 }); await measure('H orçamento', 'Luz e cor + instanciado + 100k grama (sem pós)', vista);
    setup(RECOMENDADO); await measure('H orçamento', 'Recomendado: + SMAA + cor graduada (sem GTAO, sem MSAA)', vista);
    setup(RECOMENDADO_BLOOM); await measure('H orçamento', 'Recomendado + bloom', vista);
    setup({ ...RECOMENDADO, terrain: 'blocos-textura' }); await measure('H orçamento', 'Recomendado com terreno em blocos texturizado', vista);
    setup({ look: true, objects: 'instanced', grass: 100000, passes: ['smaa', 'grade', 'gtao'] }); await measure('H orçamento', 'Recomendado + GTAO (para ver o custo no pacote)', vista);
    setup({}); await measure('H orçamento', 'Referência: como o jogo hoje (contagem corrigida)', vista);
  }
  setup({});
  (window as unknown as { __extra: unknown }).__extra = [...rows];
  return rows;
}

async function runResolutions() {
  rows.length = 0;
  const results: { resolucao: string; base: Row; rec: Row; alvo: Row }[] = [];
  for (const [w, h] of [[1280, 720], [1920, 1080], [2560, 1440]] as const) {
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    setup({}); const base = await measure('R resolução', `${w}x${h}: como o jogo hoje`, 'perto');
    setup(RECOMENDADO); const rec = await measure('R resolução', `${w}x${h}: recomendado (SMAA + cor)`, 'perto');
    setup(ALVO); const alvo = await measure('R resolução', `${w}x${h}: alvo completo (GTAO + bloom + tilt-shift)`, 'perto');
    results.push({ resolucao: `${w}x${h}`, base, rec, alvo } as never);
  }
  (window as unknown as { __resolucoes: unknown }).__resolucoes = results;
  setup({});
  return results;
}

document.getElementById('rodar')!.addEventListener('click', () => { void runAll(); });
document.getElementById('resolucao')!.addEventListener('click', () => { void runResolutions(); });
(window as unknown as { __runAll: typeof runAll; __runExtra: typeof runExtra }).__runAll = runAll;
(window as unknown as { __runExtra: typeof runExtra }).__runExtra = runExtra;
(window as unknown as { __runResolutions: typeof runResolutions }).__runResolutions = runResolutions;
setView('perto');
frame(performance.now());
log('Pronto. Use "Medir tudo".');
(window as unknown as { __setup: (o: Opts) => void; __opts: Record<string, Opts>; __frame: () => void }).__setup = setup;
(window as unknown as { __opts: Record<string, Opts> }).__opts = { RECOMENDADO, RECOMENDADO_BLOOM, ALVO };
(window as unknown as { __frame: () => void }).__frame = () => frame(performance.now());
