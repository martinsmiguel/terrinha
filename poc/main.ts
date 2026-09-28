import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

type ResourceKind = 'comida' | 'madeira' | 'pedra';
type IslandKind = 'vale' | 'coral' | 'forja';
type IslandState = 'civilização' | 'abandonada' | 'ruínas';

interface Island {
  id: string;
  name: string;
  kind: IslandKind;
  condition: IslandState | 'início';
  description: string;
  resources: Record<ResourceKind, number>;
  x: number;
  z: number;
  radius: number;
  discovered: boolean;
  settled: boolean;
  mesh?: THREE.Mesh;
  marker?: THREE.Group;
}

const islands: Island[] = [
  {
    id: 'vale', name: 'Porto Verde', kind: 'vale', condition: 'início',
    description: 'Seu primeiro assentamento, cercado por campos e madeira.',
    resources: { comida: 80, madeira: 55, pedra: 25 },
    x: -7.2, z: 0.2, radius: 3.5, discovered: true, settled: true,
  },
  {
    id: 'coral', name: 'Ilha dos Cedros', kind: 'coral', condition: 'civilização',
    description: 'Uma comunidade costeira vive entre os cedros. Há espaço para comércio ou disputa.',
    resources: { comida: 48, madeira: 84, pedra: 22 },
    x: 1.1, z: -2.4, radius: 2.7, discovered: false, settled: false,
  },
  {
    id: 'forja', name: 'Coroa de Pedra', kind: 'forja', condition: 'ruínas',
    description: 'Muralhas antigas e um santuário tomado pela vegetação. Pedra em abundância.',
    resources: { comida: 25, madeira: 35, pedra: 88 },
    x: 7.6, z: 1.6, radius: 3.1, discovered: false, settled: false,
  },
  {
    id: 'bruma', name: 'Ilha da Bruma', kind: 'vale', condition: 'abandonada',
    description: 'Uma aldeia vazia permanece intacta; sinais de partida recente.',
    resources: { comida: 40, madeira: 72, pedra: 41 },
    x: 0.1, z: 5.1, radius: 2.35, discovered: false, settled: false,
  },
];

const stock: Record<ResourceKind, number> = { comida: 90, madeira: 100, pedra: 55 };
const state = { selectedIsland: 'vale', hasDock: false, navigation: false };
const empireState = { villagers: 5, army: 2, houses: 1, barracks: false, foodGathered: 0, woodGathered: 0 };
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Elemento #app ausente.');

app.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-mark">T</span><div><b>TERRINHA</b><small>FRONTEIRA DO ARQUIPÉLAGO</small></div></div>
    <div class="resources" aria-label="Recursos disponíveis">
      <span><i class="dot food"></i>Comida <b data-stock="comida"></b></span>
      <span><i class="dot wood"></i>Madeira <b data-stock="madeira"></b></span>
      <span><i class="dot stone"></i>Pedra <b data-stock="pedra"></b></span>
    </div>
    <div class="era"><small>ESTÁGIO</small><b>ALDEIA</b></div>
  </header>
  <main>
    <section class="scene-shell" aria-label="Mapa do arquipélago">
      <div id="scene"></div>
      <div class="map-label label-home"><span class="marker home"></span>PORTO VERDE · SUA ALDEIA</div>
      <div class="map-label label-coral" data-map-label="coral"><span class="marker"></span>ÁGUAS DESCONHECIDAS</div>
      <div class="map-label label-forja" data-map-label="forja"><span class="marker"></span>ÁGUAS DESCONHECIDAS</div>
      <div class="map-label label-bruma" data-map-label="bruma"><span class="marker"></span>ÁGUAS DESCONHECIDAS</div>
      <div class="map-hint" id="map-hint"><span class="compass">N</span> ARRASTE PARA GIRAR · SCROLL PARA APROXIMAR</div>
      <div class="map-legend"><span><i class="legend-dot home-dot"></i>Seu povo</span><span><i class="legend-dot unknown-dot"></i>Além do horizonte</span><span><i class="legend-dot found-dot"></i>Explorada</span></div>
      <button class="enter-island" id="enter-island">ENTRAR NA ILHA ↗</button>
      <button class="leave-island" id="leave-island" hidden>← VISÃO DO ARQUIPÉLAGO</button>
    </section>
    <aside class="side-panel">
      <div class="eyebrow">ERA DA EXPLORAÇÃO · DIA 01</div>
      <h1>Além do horizonte<br /><em>há outros mundos.</em></h1>
      <p class="intro">Erga um cais, prepare a embarcação e descubra quem vive nas ilhas vizinhas — ou o que ficou para trás.</p>
      <div class="selected-card" id="selected-card"></div>
      <div class="actions" id="actions"></div>
      <div class="empire" id="empire"></div>
      <div class="island-list" id="island-list"></div>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
      <footer>PoC local · Estado reinicia ao recarregar</footer>
    </aside>
  </main>
`;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight - 68);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.querySelector('#scene')?.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#86a9a3');
scene.fog = new THREE.Fog('#86a9a3', 18, 45);
const camera = new THREE.PerspectiveCamera(36, window.innerWidth / (window.innerHeight - 68), 0.1, 100);
camera.position.set(0, 13.5, 20);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.1, 0);
controls.enablePan = false;
controls.minDistance = 12;
controls.maxDistance = 220;
controls.maxPolarAngle = Math.PI * 0.46;
controls.update();

scene.add(new THREE.HemisphereLight('#e8f2d9', '#29434d', 2.0));
const sun = new THREE.DirectionalLight('#fff0ce', 3.2);
sun.position.set(-8, 16, 8);
sun.castShadow = true;
scene.add(sun);

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(48, 32),
  new THREE.MeshStandardMaterial({ color: '#2b7e82', roughness: 0.42, metalness: 0.05 }),
);
water.rotation.x = -Math.PI / 2;
water.position.y = -0.04;
water.receiveShadow = true;
scene.add(water);

const islandMeshes = new Map<string, THREE.Object3D>();
const islandTerrain = new Map<string, THREE.Group>();
const islandDetailedTerrain = new Map<string, THREE.Group>();
const unitMeshes: THREE.Mesh[] = [];
const unitOrders = new Map<THREE.Group, THREE.Vector3>();
let selectedUnits: THREE.Group[] = [];
let islandMode = false;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function noise(seed: number, angle: number): number {
  return Math.sin(angle * 3 + seed) * 0.11 + Math.sin(angle * 7 - seed * 1.7) * 0.065 + Math.cos(angle * 11 + seed * 0.7) * 0.035;
}

const blockGeometry = new THREE.BoxGeometry(0.58, 0.58, 0.58);
const blockMaterials = {
  grass: new THREE.MeshStandardMaterial({ color: '#6fa34f', roughness: 1 }),
  grassLight: new THREE.MeshStandardMaterial({ color: '#81ad58', roughness: 1 }),
  grassDark: new THREE.MeshStandardMaterial({ color: '#5c8945', roughness: 1 }),
  sand: new THREE.MeshStandardMaterial({ color: '#c9a965', roughness: 1 }),
  dirt: new THREE.MeshStandardMaterial({ color: '#78543b', roughness: 1 }),
  stone: new THREE.MeshStandardMaterial({ color: '#777b70', roughness: 1 }),
};

function addBlock(parent: THREE.Object3D, x: number, y: number, z: number, material: THREE.Material, scale = 1): THREE.Mesh {
  const block = new THREE.Mesh(blockGeometry, material);
  block.position.set(x, y, z);
  block.scale.setScalar(scale);
  block.castShadow = true;
  block.receiveShadow = true;
  parent.add(block);
  return block;
}

function buildVoxelLand(parent: THREE.Object3D, island: Island, scale = 1): void {
  const cell = scale === 1 ? 0.58 : 2.4;
  const radius = island.radius * scale;
  const placements = new Map<THREE.Material, THREE.Matrix4[]>();
  const block = new THREE.Object3D();
  const addInstance = (x: number, y: number, z: number, material: THREE.Material) => {
    const matrices = placements.get(material) ?? [];
    block.position.set(x, y, z);
    block.updateMatrix();
    matrices.push(block.matrix.clone());
    placements.set(material, matrices);
  };
  for (let gx = -Math.ceil(radius / cell); gx <= Math.ceil(radius / cell); gx++) {
    for (let gz = -Math.ceil(radius / cell); gz <= Math.ceil(radius / cell); gz++) {
      const x = gx * cell;
      const z = gz * cell;
      const angle = Math.atan2(z, x);
      const r = Math.hypot(x, z) / radius;
      if (r > 0.73 + noise(island.id.length * 2.4, angle)) continue;
      const edge = r > 0.58;
      const villageClearing = scale > 1 && Math.hypot(x, z) < 19;
      const hill = !villageClearing && r > 0.18 && r < 0.65 && (Math.sin(gx * 2.1 + gz) + Math.cos(gz * 2.7)) > 0.15;
      const layers = hill ? 3 : r < 0.52 ? 2 : 1;
      for (let layer = 0; layer < layers; layer++) {
        const grassVariant = Math.abs(gx * 7 + gz * 11) % 3;
        const surface = edge ? blockMaterials.sand : grassVariant === 0 ? blockMaterials.grassLight : grassVariant === 1 ? blockMaterials.grass : blockMaterials.grassDark;
        addInstance(x, 0.02 + layer * 0.5, z,
          layer === layers - 1 ? surface : blockMaterials.dirt);
      }
      if (edge) addInstance(x, -0.56, z, blockMaterials.dirt);
    }
  }
  const geometry = new THREE.BoxGeometry(cell, 0.58, cell);
  placements.forEach((matrices, material) => {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    parent.add(mesh);
  });
}

function makeTree(x: number, z: number, scale = 1): THREE.Group {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * scale, 0.11 * scale, 0.42 * scale, 6), new THREE.MeshStandardMaterial({ color: '#70523a' }));
  trunk.position.y = 0.22 * scale;
  trunk.castShadow = true;
  group.add(trunk);
  const leaves = new THREE.Mesh(new THREE.BoxGeometry(0.58 * scale, 0.55 * scale, 0.58 * scale), new THREE.MeshStandardMaterial({ color: '#477c42', roughness: 1 }));
  leaves.position.y = 0.65 * scale;
  leaves.castShadow = true;
  group.add(leaves);
  group.position.set(x, 0.48, z);
  return group;
}

function addHouse(parent: THREE.Object3D, x: number, z: number, color = '#b88954'): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.48, 0.56), new THREE.MeshStandardMaterial({ color }));
  body.position.y = 0.25;
  body.castShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.2, 0.72), new THREE.MeshStandardMaterial({ color: '#704b3c' }));
  roof.position.y = 0.58;
  roof.castShadow = true;
  group.add(body, roof);
  group.position.set(x, 0.48, z);
  group.scale.setScalar(1.65);
  parent.add(group);
  return group;
}

function addVillager(parent: THREE.Object3D, x: number, z: number, soldier = false): THREE.Group {
  const person = new THREE.Group();
  const tunicColor = soldier ? '#748b50' : '#b18a58';
  const tunic = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.4, 0.2), new THREE.MeshStandardMaterial({ color: tunicColor }));
  tunic.position.y = 0.42;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshStandardMaterial({ color: '#d5b089' }));
  head.position.y = 0.74;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.12, 0.27), new THREE.MeshStandardMaterial({ color: soldier ? '#b8b6a0' : '#573f2b' }));
  helmet.position.y = 0.88;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.16, 0.2), new THREE.MeshStandardMaterial({ color: '#443c31' }));
  legs.position.y = 0.14;
  person.add(tunic, head, helmet, legs);
  const ring = new THREE.Mesh(new THREE.CircleGeometry(0.43, 16), new THREE.MeshBasicMaterial({ color: '#f4ce58', transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.name = 'selection-ring';
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.48;
  ring.visible = false;
  person.add(ring);
  if (soldier) {
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.48, 0.06), new THREE.MeshStandardMaterial({ color: '#c4c4b3', metalness: 0.35 }));
    sword.position.set(0.23, 0.48, 0);
    person.add(sword);
  }
  person.position.set(x, 0.52, z);
  person.scale.setScalar(1.35);
  person.userData.entityType = soldier ? 'soldier' : 'villager';
  person.traverse((object) => {
    if (object instanceof THREE.Mesh && object !== ring) {
      object.userData.unitRoot = person;
      unitMeshes.push(object);
    }
  });
  parent.add(person);
  return person;
}

function buildIsland(island: Island): THREE.Group {
  const group = new THREE.Group();
  group.position.set(island.x, 0, island.z);
  const terrain = new THREE.Group();
  buildVoxelLand(terrain, island);
  group.add(terrain);
  islandTerrain.set(island.id, terrain);
  const detailedTerrain = new THREE.Group();
  buildVoxelLand(detailedTerrain, island, 32);
  detailedTerrain.visible = false;
  group.add(detailedTerrain);
  islandDetailedTerrain.set(island.id, detailedTerrain);

  if (island.condition === 'ruínas') {
    for (let i = 0; i < 7; i++) {
      addBlock(group, -1.5 + i * 0.48, 0.7 + (i === 1 || i === 5 ? 0.58 : 0), 0.25, blockMaterials.stone, 1.05);
    }
    for (let i = 0; i < 4; i++) addBlock(group, -1.5, 0.7 + i * 0.5, -0.72 + i * 0.48, blockMaterials.stone, 1.05);
    for (let i = 0; i < 3; i++) addBlock(group, 1.32, 0.68 + i * 0.5, -0.72 + i * 0.48, blockMaterials.stone, 1.05);
    addHouse(group, 0, 0.05, '#8b7759');
  }
  if (island.kind === 'coral') {
    const palms = ['#548557', '#668f57', '#789c5d'];
    for (let i = 0; i < 7; i++) {
      const tree = makeTree(Math.cos(i * 2.4) * 1.25, Math.sin(i * 2.4) * 0.95, 0.8 + (i % 3) * 0.12);
      (tree.children[1] as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: palms[i % palms.length] });
      group.add(tree);
    }
  }
  if (island.condition === 'abandonada') {
    addHouse(group, -0.15, 0.15, '#8b765b');
    addHouse(group, 0.72, -0.38, '#9a8464');
    for (let i = 0; i < 5; i++) group.add(makeTree(-1.6 + i * 0.66, -1.35, 0.75));
  }
  if (island.condition === 'civilização') {
    for (let i = 0; i < 6; i++) {
      const wall = addBlock(group, -0.9 + i * 0.36, 0.68, 0.75, blockMaterials.stone, 0.86);
      wall.scale.y = i === 2 ? 1.9 : 1.2;
    }
    addHouse(group, 0.15, -0.4, '#d4bd86');
  }
  if (island.id === 'vale') {
    for (let i = 0; i < 8; i++) {
      group.add(makeTree(-1.7 + (i % 4) * 0.42, -1.7 + Math.floor(i / 4) * 0.62, 0.65 + (i % 3) * 0.1));
    }
    addHouse(group, 0.6, 0.1, '#b98e5c');
    addHouse(group, 1.32, 0.28, '#a8794c');
    const crop = new THREE.MeshStandardMaterial({ color: '#cda846', roughness: 1 });
    for (let row = 0; row < 3; row++) {
      for (let plant = 0; plant < 5; plant++) {
        addBlock(group, -0.9 + plant * 0.18, 0.7 + (plant % 2) * 0.1, 1.1 + row * 0.2, crop, 0.38);
      }
    }
  }

  const marker = new THREE.Group();
  marker.position.set(0, island.kind === 'forja' ? 1.15 : 0.82, 0);
  const markerDisc = new THREE.Mesh(new THREE.CircleGeometry(0.56, 32), new THREE.MeshBasicMaterial({ color: island.id === 'vale' ? '#f6d37a' : '#e9f1df', transparent: true, opacity: 0.88, side: THREE.DoubleSide }));
  markerDisc.rotation.x = -Math.PI / 2;
  markerDisc.position.y = -0.2;
  const markerPost = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), new THREE.MeshStandardMaterial({ color: '#614d36' }));
  markerPost.position.y = 0.05;
  const markerFlag = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.32, 3), new THREE.MeshStandardMaterial({ color: island.id === 'vale' ? '#e0a944' : '#e6ede0' }));
  markerFlag.position.set(0.16, 0.27, 0);
  marker.add(markerDisc, markerPost, markerFlag);
  group.add(marker);
  island.marker = marker;

  if (island.settled) {
    const dock = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.46), new THREE.MeshStandardMaterial({ color: '#a67c52' }));
    deck.position.set(2.15, 0.18, 0.9);
    deck.rotation.y = -0.3;
    deck.castShadow = true;
    dock.add(deck);
    for (let i = 0; i < 3; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 0.08), new THREE.MeshStandardMaterial({ color: '#704f35' }));
      post.position.set(1.72 + i * 0.4, 0.08, 0.9);
      dock.add(post);
    }
    dock.name = 'dock';
    group.add(dock);
    if (!state.hasDock) dock.visible = false;
    addHouse(group, -0.1, 0.5, '#d1b77f');
  }

  if (island.id === 'vale') {
    const people = new THREE.Group();
    people.name = 'people';
    for (let i = 0; i < empireState.villagers; i++) addVillager(people, -2.6 + (i % 4) * 1.1, 2 + Math.floor(i / 4) * 0.9);
    for (let i = 0; i < empireState.army; i++) addVillager(people, 2.6 + i * 0.75, -1.7, true);
    group.add(people);
  }

  if (island.settled && island.id !== 'vale') {
    const outpost = addHouse(group, 0.2, 0.2, '#d5c18d');
    outpost.name = 'outpost';
    outpost.visible = false;
  }

  islandMeshes.set(island.id, group);
  scene.add(group);
  return group;
}

islands.forEach((island) => {
  const group = buildIsland(island);
  group.traverse((object) => { if (object instanceof THREE.Mesh) object.userData.islandId = island.id; });
});

const ship = new THREE.Group();
const hull = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.5), new THREE.MeshStandardMaterial({ color: '#70482c' }));
hull.position.y = 0.28;
const deck = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.12, 0.42), new THREE.MeshStandardMaterial({ color: '#b88950' }));
deck.position.set(-0.02, 0.43, 0);
const mast = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.88, 0.08), new THREE.MeshStandardMaterial({ color: '#61452e' }));
mast.position.set(0.12, 0.87, 0);
const sail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.63, 0.48), new THREE.MeshStandardMaterial({ color: '#eee1bd', roughness: 1 }));
sail.position.set(0.1, 0.91, 0.05);
const pennant = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.06), new THREE.MeshStandardMaterial({ color: '#bb5338' }));
pennant.position.set(0.31, 1.3, 0);
ship.add(hull, deck, mast, sail, pennant);
ship.position.set(-3.2, 0, 0.7);
ship.visible = true;
scene.add(ship);

let shipTravel: { from: THREE.Vector3; to: THREE.Vector3; start: number; duration: number; target: Island } | null = null;

function selected(): Island {
  return islands.find((island) => island.id === state.selectedIsland) ?? islands[0];
}

function fmt(kind: ResourceKind): string {
  return `${stock[kind]}`;
}

function notify(message: string): void {
  const toast = document.querySelector<HTMLDivElement>('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  window.setTimeout(() => toast.classList.remove('visible'), 2500);
}

function affordable(cost: Partial<Record<ResourceKind, number>>): boolean {
  return Object.entries(cost).every(([kind, amount]) => stock[kind as ResourceKind] >= (amount ?? 0));
}

function pay(cost: Partial<Record<ResourceKind, number>>): boolean {
  if (!affordable(cost)) return false;
  for (const [kind, amount] of Object.entries(cost)) stock[kind as ResourceKind] -= amount ?? 0;
  return true;
}

function costs(cost: Partial<Record<ResourceKind, number>>): string {
  return Object.entries(cost).map(([kind, amount]) => `${amount} ${kind}`).join(' · ');
}

function enterIslandView(): void {
  const island = selected();
  if (!island.discovered) return notify('Explore esta ilha antes de desembarcar.');
  islandMode = true;
  islands.forEach((candidate) => {
    const root = islandMeshes.get(candidate.id);
    if (!root) return;
    root.visible = candidate.id === island.id;
    if (candidate.id === island.id) {
      root.position.set(0, 0, 0);
      islandTerrain.get(candidate.id)!.visible = false;
      islandDetailedTerrain.get(candidate.id)!.visible = true;
    }
  });
  water.scale.set(32, 1, 32);
  scene.fog = new THREE.Fog('#86a9a3', 150, 430);
  camera.far = 600;
  camera.position.set(0, 22, 30);
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.enablePan = true;
  controls.minDistance = 18;
  controls.maxDistance = 260;
  controls.update();
  render();
}

function leaveIslandView(): void {
  if (!islandMode) return;
  islandMode = false;
  selectedUnits.forEach((unit) => { const ring = unit.getObjectByName('selection-ring'); if (ring) ring.visible = false; });
  selectedUnits = [];
  islands.forEach((island) => {
    const root = islandMeshes.get(island.id);
    if (!root) return;
    root.visible = true;
    root.position.set(island.x, 0, island.z);
    islandTerrain.get(island.id)!.visible = true;
    islandDetailedTerrain.get(island.id)!.visible = false;
  });
  water.scale.set(1, 1, 1);
  scene.fog = new THREE.Fog('#86a9a3', 18, 45);
  camera.far = 100;
  camera.position.set(0, 13.5, 20);
  camera.updateProjectionMatrix();
  controls.target.set(0, 0.1, 0);
  controls.enablePan = false;
  controls.minDistance = 13;
  controls.maxDistance = 36;
  controls.update();
  render();
}

function render(): void {
  const enterButton = document.querySelector<HTMLButtonElement>('#enter-island');
  if (enterButton) enterButton.hidden = islandMode;
  const leaveButton = document.querySelector<HTMLButtonElement>('#leave-island');
  if (leaveButton) leaveButton.hidden = !islandMode;
  const mapHint = document.querySelector<HTMLDivElement>('#map-hint');
  if (mapHint) mapHint.innerHTML = islandMode
    ? 'CLIQUE EM UM ALDEÃO OU SOLDADO · BOTÃO DIREITO ORDENA MOVIMENTO · ARRASTE PARA GIRAR'
    : '<span class="compass">N</span> ARRASTE PARA GIRAR · SCROLL PARA APROXIMAR';
  document.querySelectorAll<HTMLElement>('.map-label, .map-legend').forEach((element) => { element.hidden = islandMode; });
  document.querySelectorAll<HTMLElement>('[data-stock]').forEach((node) => {
    const kind = node.dataset.stock as ResourceKind;
    node.textContent = fmt(kind);
  });
  const island = selected();
  const selectedCard = document.querySelector<HTMLDivElement>('#selected-card');
  if (selectedCard) {
    const title = island.discovered ? island.name : 'Ilha desconhecida';
    const kindLabel = island.discovered ? island.condition.toUpperCase() : 'AGUARDA NAVEGAÇÃO';
    const resourceRows = island.discovered
      ? (Object.entries(island.resources) as [ResourceKind, number][]).map(([kind, value]) => `<div><span>${kind}</span><b>${value}</b></div>`).join('')
      : '<div><span>Recursos</span><b>Não mapeados</b></div>';
    selectedCard.innerHTML = `
      <div class="card-heading"><div><small>ILHA SELECIONADA</small><h2>${title}</h2></div><span class="island-kind">${kindLabel}</span></div>
      <p>${island.discovered ? island.description : 'Pesquise Navegação para revelar o terreno e os recursos desta ilha.'}</p>
      <div class="resource-grid">${resourceRows}</div>
      ${island.settled ? `<div class="settled-note">◆ ${island.id === 'vale' ? 'Colônia inicial estabelecida' : 'Posto avançado estabelecido'}</div>` : ''}
    `;
  }

  const actions = document.querySelector<HTMLDivElement>('#actions');
  if (actions) {
    const dockCost = { madeira: 40, pedra: 20 };
    const navigationCost = { comida: 30, madeira: 35 };
    const outpostCost = { comida: 20, madeira: 20 };
    if (!state.hasDock) {
      actions.innerHTML = `<button class="action primary" id="build-dock"><span class="action-icon">⚓</span><span><b>Construir cais</b><small>${costs(dockCost)}</small></span><i>→</i></button>`;
      document.querySelector('#build-dock')?.addEventListener('click', () => {
        if (!pay(dockCost)) return notify('Recursos insuficientes para construir o cais.');
        state.hasDock = true;
        islands[0].settled = true;
        islands[0].marker?.scale.setScalar(1.18);
        const group = islandMeshes.get('vale');
        if (group) group.getObjectByName('dock')!.visible = true;
        notify('Cais concluído. Agora você pode preparar a travessia.');
        render();
      });
    } else if (!state.navigation) {
      actions.innerHTML = `<button class="action primary" id="research-navigation"><span class="action-icon">⌁</span><span><b>Pesquisar Navegação</b><small>${costs(navigationCost)}</small></span><i>→</i></button><div class="action-note">O cais permite estudar rotas e revelar o arquipélago.</div>`;
      document.querySelector('#research-navigation')?.addEventListener('click', () => {
        if (!pay(navigationCost)) return notify('Recursos insuficientes para pesquisar Navegação.');
        state.navigation = true;
        ship.visible = true;
        notify('Navegação pesquisada. Escolha uma ilha vizinha no mapa.');
        render();
      });
    } else if (!island.discovered) {
      actions.innerHTML = `<button class="action primary" id="sail"><span class="action-icon">➤</span><span><b>Explorar ${island.name}</b><small>Enviar embarcação · 5s</small></span><i>→</i></button><div class="action-note">A viagem revela os recursos e o terreno da ilha.</div>`;
      document.querySelector('#sail')?.addEventListener('click', () => sailTo(island));
    } else if (!island.settled) {
      actions.innerHTML = `<button class="action primary" id="settle"><span class="action-icon">⌂</span><span><b>Estabelecer posto avançado</b><small>${costs(outpostCost)}</small></span><i>→</i></button><div class="action-note">Leve recursos para começar a explorar esta ilha.</div>`;
      document.querySelector('#settle')?.addEventListener('click', () => {
        if (!pay(outpostCost)) return notify('Recursos insuficientes para o posto avançado.');
        island.settled = true;
        island.marker?.scale.setScalar(1.18);
        const group = islandMeshes.get(island.id);
        const outpost = group?.getObjectByName('outpost');
        if (outpost) outpost.visible = true;
        else if (group) addHouse(group, 0.2, 0.2, '#d5c18d');
        if (group && island.id !== 'vale') {
          for (let i = 0; i < empireState.villagers; i++) addVillager(group, -2.6 + (i % 4) * 1.1, 2 + Math.floor(i / 4) * 0.9);
          for (let i = 0; i < empireState.army; i++) addVillager(group, 2.6 + i * 0.75, -1.7, true);
        }
        notify(`Posto avançado estabelecido na ilha ${island.name}.`);
        render();
      });
    } else {
      actions.innerHTML = '<div class="complete"><span>✓</span> Ilha incorporada ao seu arquipélago</div><div class="action-note">Esta PoC termina após a primeira expansão naval.</div>';
    }
  }

  const empire = document.querySelector<HTMLDivElement>('#empire');
  if (empire) {
    const capacity = empireState.houses * 5;
    empire.innerHTML = islandMode ? `
      <div class="empire-heading"><span>POVO & EXÉRCITO</span><small>${island.name.toUpperCase()}</small></div>
      <div class="unit-stats"><div><small>ALDEÕES</small><b>♟ ${empireState.villagers}/${capacity}</b></div><div><small>EXÉRCITO</small><b>⚔ ${empireState.army}</b></div></div>
      <div class="empire-actions">
        <button data-empire="gather-food">🌾 Colher alimento <small>+45 comida</small></button>
        <button data-empire="gather-wood">🪓 Cortar madeira <small>+35 madeira</small></button>
        <button data-empire="house">⌂ Construir casa <small>30 madeira · +5 vagas</small></button>
        <button data-empire="villager">♟ Criar aldeão <small>25 comida</small></button>
        <button data-empire="barracks">▣ ${empireState.barracks ? 'Quartel construído' : 'Construir quartel'} <small>${empireState.barracks ? 'Pronto para treinar' : '70 madeira · 30 pedra'}</small></button>
        <button data-empire="soldier" ${empireState.barracks ? '' : 'disabled'}>⚔ Treinar espadachim <small>35 comida · 20 madeira</small></button>
      </div>
      <div class="action-note">Use aldeões para reunir recursos, ampliar a aldeia e formar um exército.</div>
    ` : `<div class="empire-heading"><span>VIDA NA ILHA</span><small>${empireState.villagers} ALDEÕES · ${empireState.army} SOLDADOS</small></div><div class="action-note">Entre na ilha para administrar recursos, construir casas e quartel, criar aldeões e treinar tropas.</div>`;
    empire.querySelectorAll<HTMLButtonElement>('[data-empire]').forEach((button) => button.addEventListener('click', () => {
      const task = button.dataset.empire;
      if (task === 'gather-food') { stock.comida += 45; empireState.foodGathered += 45; notify('Os aldeões colheram 45 de comida.'); }
      if (task === 'gather-wood') { stock.madeira += 35; empireState.woodGathered += 35; notify('Os aldeões trouxeram 35 de madeira.'); }
      if (task === 'house') {
        if (!pay({ madeira: 30 })) return notify('Falta madeira para construir a casa.');
        empireState.houses++;
        addHouse(islandMeshes.get(island.id)!, -8 + ((empireState.houses - 2) % 4) * 4, 7 + Math.floor((empireState.houses - 2) / 4) * 4, '#c7aa71');
        notify('Casa construída. A aldeia ganhou 5 vagas.');
      }
      if (task === 'villager') {
        if (empireState.villagers >= capacity) return notify('Construa uma casa para aumentar a população máxima.');
        if (!pay({ comida: 25 })) return notify('Falta comida para criar um aldeão.');
        empireState.villagers++;
        addVillager(islandMeshes.get(island.id)!, -5 + (empireState.villagers % 5) * 2.2, 4 + Math.floor(empireState.villagers / 5) * 2.2);
        notify('Novo aldeão chegou à ilha.');
      }
      if (task === 'barracks') {
        if (empireState.barracks) return notify('O quartel já está construído.');
        if (!pay({ madeira: 70, pedra: 30 })) return notify('Faltam recursos para construir o quartel.');
        empireState.barracks = true;
        const barracks = addHouse(islandMeshes.get(island.id)!, 10, 5, '#8a5941');
        barracks.scale.set(2.2, 1.45, 2.1);
        notify('Quartel pronto. Agora você pode treinar tropas.');
      }
      if (task === 'soldier') {
        if (!empireState.barracks) return notify('Construa um quartel primeiro.');
        if (!pay({ comida: 35, madeira: 20 })) return notify('Faltam recursos para treinar o espadachim.');
        empireState.army++;
        addVillager(islandMeshes.get(island.id)!, 9 + (empireState.army % 4) * 1.8, -5, true);
        notify('Espadachim treinado. O exército cresceu.');
      }
      render();
    }));
  }

  const list = document.querySelector<HTMLDivElement>('#island-list');
  if (list) {
    list.innerHTML = `<div class="list-title">ARQUIPÉLAGO <span>${islands.filter((item) => item.discovered).length}/${islands.length}</span></div>` + islands.map((item) => `
      <button class="island-row ${item.id === island.id ? 'selected' : ''}" data-island="${item.id}">
        <span class="island-icon ${item.kind}">${item.discovered ? (item.condition === 'ruínas' ? '▦' : item.condition === 'abandonada' ? '⌂' : '⚑') : '?'}</span>
        <span><b>${item.discovered ? item.name : 'Desconhecida'}</b><small>${item.discovered ? item.condition : state.navigation ? 'Clique para selecionar' : 'Bloqueada'}</small></span>
        <span class="row-status">${item.settled ? '●' : item.discovered ? '○' : '·'}</span>
      </button>`).join('');
    list.querySelectorAll<HTMLButtonElement>('[data-island]').forEach((button) => button.addEventListener('click', () => selectIsland(button.dataset.island!)));
  }
  document.querySelectorAll<HTMLElement>('[data-map-label]').forEach((label) => {
    const item = islands.find((candidate) => candidate.id === label.dataset.mapLabel);
    label!.innerHTML = `<span class="marker ${item?.discovered ? 'found' : ''}"></span>${item?.discovered ? item.name.toUpperCase() : 'ÁGUAS DESCONHECIDAS'}`;
  });
  const era = document.querySelector<HTMLElement>('.era b');
  if (era) era.textContent = state.navigation ? 'NAVEGAÇÃO' : state.hasDock ? 'PESQUISA' : 'ALDEIA';
}

function selectIsland(id: string): void {
  const island = islands.find((candidate) => candidate.id === id);
  if (!island) return;
  if (!island.discovered && !state.navigation) {
    notify('Esta rota ainda não foi descoberta. Pesquise Navegação primeiro.');
    return;
  }
  if (islandMode) leaveIslandView();
  state.selectedIsland = id;
  render();
}

function sailTo(island: Island): void {
  if (shipTravel) return;
  const startIsland = islands.find((candidate) => candidate.id === 'vale')!;
  const from = new THREE.Vector3(startIsland.x + 1.1, 0.1, startIsland.z + 0.6);
  const to = new THREE.Vector3(island.x - island.radius * 0.52, 0.1, island.z + island.radius * 0.52);
  ship.position.copy(from);
  ship.visible = true;
  shipTravel = { from, to, start: performance.now(), duration: 5200, target: island };
  notify(`Embarcação a caminho de ${island.name}…`);
  render();
}

function updateShip(now: number): void {
  if (!shipTravel) return;
  const progress = Math.min(1, (now - shipTravel.start) / shipTravel.duration);
  const eased = progress * progress * (3 - 2 * progress);
  ship.position.lerpVectors(shipTravel.from, shipTravel.to, eased);
  ship.position.y = 0.08 + Math.sin(now / 300) * 0.035;
  ship.rotation.y = Math.atan2(shipTravel.to.x - shipTravel.from.x, shipTravel.to.z - shipTravel.from.z);
  if (progress >= 1) {
    const destination = shipTravel.target;
    destination.discovered = true;
    shipTravel = null;
    state.selectedIsland = destination.id;
    notify(`${destination.name} mapeada: ${destination.description}`);
    render();
  }
}

function onPointerDown(event: PointerEvent): void {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  if (islandMode) {
    if (event.button === 0) {
      const unitHit = raycaster.intersectObjects(unitMeshes, false).find((item) => item.object.visible && item.object.userData.unitRoot);
      const clickedUnit = unitHit?.object.userData.unitRoot as THREE.Group | undefined;
      selectedUnits.forEach((unit) => { const ring = unit.getObjectByName('selection-ring'); if (ring) ring.visible = false; });
      selectedUnits = clickedUnit ? [clickedUnit] : [];
      selectedUnits.forEach((unit) => { const ring = unit.getObjectByName('selection-ring'); if (ring) ring.visible = true; });
      if (clickedUnit) {
        notify(clickedUnit.userData.entityType === 'soldier' ? 'Espadachim selecionado. Clique com o botão direito para mover.' : 'Aldeão selecionado. Clique com o botão direito para mover.');
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
    }
    if (event.button === 2 && selectedUnits.length) {
      const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.45);
      const destination = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(ground, destination)) {
        selectedUnits.forEach((unit, index) => unitOrders.set(unit, new THREE.Vector3(destination.x + index * 1.2, unit.position.y, destination.z)));
        notify('Ordem de movimento enviada.');
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
  }
  const hit = raycaster.intersectObjects([...islandMeshes.values()], true).find((item) => item.object.userData.islandId);
  if (hit?.object.userData.islandId) selectIsland(hit.object.userData.islandId as string);
}
renderer.domElement.addEventListener('pointerdown', onPointerDown, { capture: true });
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());

function resize(): void {
  const panel = window.matchMedia('(max-width: 860px)').matches;
  const height = panel ? window.innerHeight * 0.56 : window.innerHeight - 68;
  const width = renderer.domElement.parentElement?.clientWidth ?? window.innerWidth;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function animate(now = 0): void {
  requestAnimationFrame(animate);
  updateShip(now);
  unitOrders.forEach((target, unit) => {
    const dx = target.x - unit.position.x;
    const dz = target.z - unit.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.12) unitOrders.delete(unit);
    else {
      const step = Math.min(0.12, distance) / distance;
      unit.position.x += dx * step;
      unit.position.z += dz * step;
    }
  });
  controls.update();
  renderer.render(scene, camera);
}
render();
resize();
animate();
document.querySelector('#enter-island')?.addEventListener('click', enterIslandView);
document.querySelector('#leave-island')?.addEventListener('click', leaveIslandView);
