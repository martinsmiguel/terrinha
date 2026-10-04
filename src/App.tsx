/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GameEngine, GameState, PlayerResources, Unit, Building, ResourceNode, MAP_SIZE, UnitType, isBoatUnit } from './game/engine';
import { createVisionGrid, expireVision, revealVision, visionRadiusFor } from './game/visibility';
import { MultiplayerManager, ChatMessage } from './game/multiplayer';
import { Minimap } from './components/Minimap';
import { TechPanel } from './components/TechPanel';
import { soundManager } from './game/audio';
import { update3DHealthBar, align3DHealthBarToCamera } from './game/healthBar';
import { createBuildingGhost, updateBuildingGhost, checkBuildingPlacementValid } from './game/buildingGhost';
import { BUILDING_CATALOG, BuildingType } from './game/buildingDefs';
import { generateProceduralTerrain, findNearestOceanCell, ProceduralMapResult } from './game/proceduralMap';
import { EmpireCatalogModal } from './components/EmpireCatalogModal';
import { Tutorial } from './components/Tutorial';

/** Marcador de que o tutorial de primeira partida ja foi exibido. */
const TUTORIAL_SEEN_KEY = 'terrinha:tutorial-seen';
import {
  Hammer,
  Shield,
  Check,
  Home,
  Sparkles,
  AlertCircle,
  Castle,
  Compass,
  TreePine,
  Sprout,
  Coins,
} from 'lucide-react';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import { createWorkZoneMesh, updateWorkZoneMesh } from './game/workZone';
import {
  applyCost,
  canAfford,
  COST_CHIP_CLASS,
  COST_SHORT,
  describeCost,
  MARKET_LABELS,
  MarketResourceType,
  missingCost,
  refundCost,
  tradeResource,
  UNIT_COSTS,
  halfCost,
} from './game/economy';
import { PLAYER_SLOTS, isAuthorizedPlayerCommand, isPlayerSlot, isValidNetworkCommand, soloMatchSlots, type PlayerSlot } from './game/networkCommands';
import { localOutcome, type LocalOutcome } from './game/victory';
import {
  createTechState,
  researchTarget,
  startResearch,
} from './game/tech';
import { FACTION_COLORS } from './game/factions';
import { tickGameState } from './game/simulation';
import { useSceneSynchronization } from './hooks/useSceneSynchronization';
import { LobbyScreen } from './components/LobbyScreen';
import { GameDialogs } from './components/GameDialogs';
import { GameHeader } from './components/GameHeader';
import { SelectionPanel } from './components/SelectionPanel';


export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const multiRef = useRef<MultiplayerManager | null>(null);

  // Rota de demonstracao da PoC de interface: abre uma partida solo direto,
  // sem passar pelo lobby, e permite esconder o HUD do proprio jogo para que a
  // proposta seja sobreposta a partida real. Fora dessa rota nada muda: o jogo
  // em `/` continua abrindo no lobby como sempre.
  const isSoloPreviewRoute = window.location.pathname === '/poc.html';
  const isHudPreviewMode = isSoloPreviewRoute && new URLSearchParams(window.location.search).has('hud-preview');

  // Menu / Lobby state
  const [isGameStarted, setIsGameStarted] = useState(isSoloPreviewRoute);
  const [role, setRole] = useState<'host' | 'client' | 'single'>(isSoloPreviewRoute ? 'single' : 'host');
  const [roomId, setRoomId] = useState('vila-principal');
  const [playerName, setPlayerName] = useState('Comandante');
  const [playerSlot, setPlayerSlot] = useState<PlayerSlot>('player1');
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [lanIps, setLanIps] = useState<string[]>([]);
  const [copiedIp, setCopiedIp] = useState(false);
  const [, setConnectedPlayers] = useState(1);

  // Participantes da partida: no solo vem do tamanho escolhido (2..4),
  // no multiplayer e o host mais quem entrar na sala.
  const [activeSlots, setActiveSlots] = useState<PlayerSlot[]>(['player1', 'player2']);
  const activeSlotsRef = useRef<PlayerSlot[]>(['player1', 'player2']);
  activeSlotsRef.current = activeSlots;
  const [matchSize, setMatchSize] = useState<2 | 3 | 4>(2);
  const playerSlotRef = useRef<PlayerSlot>('player1');
  playerSlotRef.current = playerSlot;

  // Squad Formation Mode ('box' | 'line' | 'spread')
  const [squadFormation, setSquadFormation] = useState<'box' | 'line' | 'spread'>('box');
  const squadFormationRef = useRef<'box' | 'line' | 'spread'>('box');
  squadFormationRef.current = squadFormation;

  // HUD Display modes: 'full' (completo) | 'compact' (compacto tático) | 'hidden' (cinemático)
  const [hudMode, setHudMode] = useState<'full' | 'compact' | 'hidden'>(isHudPreviewMode ? 'hidden' : 'full');
  const isHudVisible = hudMode !== 'hidden';
  const [isHoverPeeking, setIsHoverPeeking] = useState(false);

  // Camera auto-movement locking (locks edge-scrolling for peaceful exploration)
  const [isCameraAutoMoveLocked, setIsCameraAutoMoveLocked] = useState(false);
  const isCameraAutoMoveLockedRef = useRef(false);
  isCameraAutoMoveLockedRef.current = isCameraAutoMoveLocked;

  // Collapsible bottom cards & minimap state
  const [isBottomCardCollapsed, setIsBottomCardCollapsed] = useState(false);
  const [isMinimapCollapsed, setIsMinimapCollapsed] = useState(false);

  // Sustainable Forestry & Gathering Proximity Leash
  // When active, any tree gathered by player villagers automatically replants with seedlings!
  const [isColonySustainableForestry, setIsColonySustainableForestry] = useState(false);
  const isColonySustainableForestryRef = useRef(false);
  isColonySustainableForestryRef.current = isColonySustainableForestry;

  // Gathering search radius clamp (8 = Bosque Estrito, 14 = Bosque Padrão, 22 = Área Local, 35 = Setor Amplo, 999 = Sem Limite)
  const [gatherRadiusLimit, setGatherRadiusLimit] = useState<number>(14);
  const gatherRadiusLimitRef = useRef<number>(14);
  gatherRadiusLimitRef.current = gatherRadiusLimit;

  // Work Zone Visual Overlay & Management Modal
  const [isWorkZoneModalOpen, setIsWorkZoneModalOpen] = useState(false);
  const [isTechPanelOpen, setIsTechPanelOpen] = useState(false);
  const [showWorkZones3D, setShowWorkZones3D] = useState(true);
  const [isStrictZoneLeash, setIsStrictZoneLeash] = useState(true);
  const isStrictZoneLeashRef = useRef(true);
  isStrictZoneLeashRef.current = isStrictZoneLeash;
  const [isSettingZoneCenter, setIsSettingZoneCenter] = useState(false);
  const workZoneMeshes = useRef<Map<string, THREE.Group>>(new Map());

  // Gathering work shift timer duration (0 = contínuo/sem limite, 60 = 1 min, 120 = 2 min, 180 = 3 min)
  const [gatherShiftDuration, setGatherShiftDuration] = useState<number>(0);
  const gatherShiftDurationRef = useRef<number>(0);
  gatherShiftDurationRef.current = gatherShiftDuration;

  // Tactical notification toast & Controls modal
  const [notification, setNotification] = useState<{ message: string; type: 'info' | 'success' | 'warning'; id: number } | null>(null);
  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showControlsModal, setShowControlsModal] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const tutorialSeenCheckedRef = useRef(false);

  const triggerNotification = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
    const id = Date.now();
    setNotification({ message, type, id });
    notificationTimeoutRef.current = setTimeout(() => {
      setNotification((curr) => (curr?.id === id ? null : curr));
    }, 3800);
  };

  const toggleCameraLock = () => {
    setIsCameraAutoMoveLocked((prev) => {
      const next = !prev;
      engineRef.current?.setEdgeScrollEnabled(!next);
      soundManager.playClickSound();
      triggerNotification(
        next
          ? 'Movimento automático travado: câmera fixa (use WASD ou arraste para mover).'
          : 'Movimento automático liberado: rolagem suave pelas bordas ativa.',
        'info'
      );
      return next;
    });
  };

  const toggleHudMode = () => {
    setHudMode((curr) => {
      const next = curr === 'full' ? 'compact' : curr === 'compact' ? 'hidden' : 'full';
      soundManager.playClickSound();
      const label =
        next === 'full'
          ? 'Interface Completa expandida.'
          : next === 'compact'
          ? 'Interface Compacta (Modo Tático ativado).'
          : 'Interface Ocultada (Modo Cinemático. Pressione H para restaurar).';
      triggerNotification(label, 'info');
      return next;
    });
  };

  // Building placement mode & preview
  const [buildMode, setBuildMode] = useState<BuildingType | null>(null);
  const [buildPreviewInfo, setBuildPreviewInfo] = useState<{
    x: number;
    z: number;
    isValid: boolean;
    reason?: string;
    width: number;
    depth: number;
  } | null>(null);

  // Empire Catalog Modal (Ikariam / SkyCity / AoE style)
  const [isEmpireCatalogOpen, setIsEmpireCatalogOpen] = useState(false);
  const proceduralMapRef = useRef<ProceduralMapResult | null>(null);

  // Audio mute state & multiplayer client unit tracker
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const prevMyUnitsCountRef = useRef<number | null>(null);

  // Selection
  const [selectedEntity, setSelectedEntity] = useState<{ id: string; kind: 'unit' | 'building' | 'resource' } | null>(null);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const selectedUnitIdsRef = useRef<string[]>([]);
  selectedUnitIdsRef.current = selectedUnitIds;

  // Marquee drag-selection box state
  const [marqueeBox, setMarqueeBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const isMouseDownRef = useRef(false);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingMarqueeRef = useRef(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentChatInput, setCurrentChatInput] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Core Game State
  const [gameState, setGameState] = useState<GameState>({
    units: [],
    buildings: [],
    resourceNodes: [],
    playerResources: {
      player1: { wood: 350, food: 350, gold: 200, stone: 100, planks: 0, pop: 3, maxPop: 15 },
      player2: { wood: 350, food: 350, gold: 200, stone: 100, planks: 0, pop: 3, maxPop: 15 },
      player3: { wood: 350, food: 350, gold: 200, stone: 100, planks: 0, pop: 3, maxPop: 15 },
      player4: { wood: 350, food: 350, gold: 200, stone: 100, planks: 0, pop: 3, maxPop: 15 },
    },
  });

  // 3D Object Render references
  const unitMeshes = useRef<Map<string, THREE.Group>>(new Map());
  // Caminho A* por unidade: recalculado so quando o alvo muda (custo por tick = O(tamanho do caminho))
  const unitPathsRef = useRef<Map<string, { goal: { x: number; z: number }; path: { x: number; z: number }[] }>>(new Map());
  // Nevoa de guerra do jogador local: 0 = nunca visto, 1 = explorado, 2 = visivel
  const visionGridRef = useRef<Uint8Array>(createVisionGrid());
  const buildingMeshes = useRef<Map<string, THREE.Group>>(new Map());
  const resourceMeshes = useRef<Map<string, THREE.Group>>(new Map());
  const ghostBuildingMesh = useRef<THREE.Group | null>(null);
  const gameStateRef = useRef<GameState>(gameState);
  gameStateRef.current = gameState;
  const selectedEntityRef = useRef(selectedEntity);
  selectedEntityRef.current = selectedEntity;

  // Active Work Zones calculated from player's working/assigned villagers
  const activeWorkZones = useMemo(() => {
    const zonesMap = new Map<
      string,
      {
        id: string;
        x: number;
        z: number;
        radius: number;
        unitIds: string[];
        resourceType?: 'tree' | 'gold_mine' | 'food_bush' | 'fish_school' | 'stone';
        clusterName?: string;
      }
    >();

    gameState.units.forEach((u) => {
      if (u.owner !== playerSlot || u.type !== 'villager') return;
      if (u.state === 'gathering' || (u.gatherOrigin && u.targetEntityId)) {
        let origin = u.gatherOrigin;
        const targetNode = u.targetEntityId ? gameState.resourceNodes.find((n) => n.id === u.targetEntityId) : undefined;
        if (!origin && targetNode) {
          origin = { x: targetNode.position.x, z: targetNode.position.z };
        }
        if (origin) {
          const key = `${Math.round(origin.x * 2) / 2}_${Math.round(origin.z * 2) / 2}`;
          const radius = u.gatherRadiusLimit || gatherRadiusLimit || 14;
          const existing = zonesMap.get(key);
          if (existing) {
            existing.unitIds.push(u.id);
            existing.radius = Math.max(existing.radius, radius);
            if (!existing.clusterName && targetNode?.clusterName) existing.clusterName = targetNode.clusterName;
          } else {
            zonesMap.set(key, {
              id: `zone-${key}`,
              x: origin.x,
              z: origin.z,
              radius,
              unitIds: [u.id],
              resourceType: targetNode?.type || 'tree',
              clusterName: targetNode?.clusterName,
            });
          }
        }
      }
    });

    return Array.from(zonesMap.values()).map((z) => {
      const isHighlighted = selectedUnitIds.some((uid) => z.unitIds.includes(uid));
      const resType = z.resourceType || 'tree';
      const treesRemaining = gameState.resourceNodes.filter(
        (n) =>
          n.type === resType &&
          n.remaining > 0 &&
          !n.isRegrowing &&
          Math.hypot(n.position.x - z.x, n.position.z - z.z) <= z.radius
      ).length;
      const regrowingCount = gameState.resourceNodes.filter(
        (n) =>
          n.type === resType &&
          n.isRegrowing &&
          Math.hypot(n.position.x - z.x, n.position.z - z.z) <= z.radius
      ).length;

      return {
        ...z,
        unitCount: z.unitIds.length,
        treesRemaining,
        regrowingCount,
        isHighlighted,
      };
    });
  }, [gameState.units, gameState.resourceNodes, playerSlot, selectedUnitIds, gatherRadiusLimit]);

  // Selected Resource prospective Work Zone preview
  const previewZone = useMemo(() => {
    if (selectedEntity?.kind !== 'resource') return null;
    const res = gameState.resourceNodes.find((n) => n.id === selectedEntity.id);
    if (!res) return null;

    const radius = gatherRadiusLimit;
    const treesCovered = gameState.resourceNodes.filter(
      (n) =>
        n.type === res.type &&
        Math.hypot(n.position.x - res.position.x, n.position.z - res.position.z) <= radius
    ).length;

    return {
      x: res.position.x,
      z: res.position.z,
      radius,
      resourceType: res.type,
      treesCovered,
    };
  }, [selectedEntity, gameState.resourceNodes, gatherRadiusLimit]);

  // Active gatherers by resource type for HUD and Empire Catalog
  const activeGatherers = useMemo(() => {
    let wood = 0;
    let food = 0;
    let gold = 0;
    let fish = 0;
    let stone = 0;
    gameState.units.forEach((u) => {
      if (u.owner === playerSlot && u.state === 'gathering' && u.targetEntityId) {
        const node = gameState.resourceNodes.find((n) => n.id === u.targetEntityId);
        if (node) {
          if (node.type === 'tree') wood++;
          else if (node.type === 'gold_mine') gold++;
          else if (node.type === 'fish_school') fish++;
          else if (node.type === 'stone') stone++;
          else food++;
        }
      }
    });
    return { wood, food, gold, fish, stone };
  }, [gameState.units, gameState.resourceNodes, playerSlot]);

  // Fetch local network IP to assist LAN players
  useEffect(() => {
    fetch('/api/lan-info')
      .then((res) => res.json())
      .then((data) => {
        if (data.localIps && data.localIps.length > 0) {
          setLanIps(data.localIps);
        }
      })
      .catch(() => {
        // Fallback if running offline without api or standalone
        setLanIps([window.location.hostname]);
      });
  }, []);

  // Initialize Game Simulation
  useEffect(() => {
    if (!isGameStarted || !containerRef.current) return;

    const engine = new GameEngine(containerRef.current);
    engineRef.current = engine;

    // Continuous 60fps unit animation callback
    engine.onRenderFrame = (time: number) => {
      const currentUnits = gameStateRef.current.units;
      const currentNodes = gameStateRef.current.resourceNodes;

      currentUnits.forEach((unit, index) => {
        const group = unitMeshes.current.get(unit.id);
        if (!group) return;

        const seed = index * 1.73;
        const groundY = proceduralMapRef.current ? proceduralMapRef.current.getHeightAt(unit.position.x, unit.position.z) : 0;
        const isBoat = isBoatUnit(unit.type);
        const baseElevation = isBoat ? Math.min(0.04, groundY) : groundY;

        if (unit.state === 'attacking') {
          // 1. Orient unit to face target entity
          let targetX = unit.position.x;
          let targetZ = unit.position.z;
          const targetEnemy = currentUnits.find((u) => u.id === unit.targetEntityId);
          const targetBuilding = !targetEnemy ? gameStateRef.current.buildings.find((b) => b.id === unit.targetEntityId) : null;
          const targetEntity = targetEnemy || targetBuilding;
          if (targetEntity) {
            targetX = targetEntity.position.x;
            targetZ = targetEntity.position.z;
          }

          const dx = targetX - unit.position.x;
          const dz = targetZ - unit.position.z;
          if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
            group.rotation.y = Math.atan2(dx, dz);
          }

          if (unit.type === 'soldier') {
            // Soldier Musket Firing & Recoil Animation
            // Cycle: Steady aim -> Sudden gunshot & recoil kickback -> Recovery & reload
            const cycle = (time * 5.2 + seed) % (Math.PI * 2);
            const isRecoil = cycle < 0.75;
            const recoilAmount = isRecoil ? Math.sin((cycle / 0.75) * Math.PI) : 0;

            // Kickback displacement opposite to facing angle
            const kickDist = recoilAmount * 0.18;
            group.position.x = unit.position.x - Math.sin(group.rotation.y) * kickDist;
            group.position.z = unit.position.z - Math.cos(group.rotation.y) * kickDist;
            group.position.y = baseElevation + recoilAmount * 0.035;

            // Pitch rotation: Musket kicks up, body recoils backwards
            group.rotation.x = -recoilAmount * 0.24;
            group.rotation.z = Math.sin(cycle * 3) * 0.03;
          } else {
            // Villager Melee Attack / Swing Animation
            const cycle = time * 8.2 + seed;
            const swing = Math.sin(cycle);
            const lunge = Math.max(0, swing) * 0.22;

            // Lunge forward towards target
            group.position.x = unit.position.x + Math.sin(group.rotation.y) * lunge;
            group.position.z = unit.position.z + Math.cos(group.rotation.y) * lunge;
            group.position.y = baseElevation + Math.abs(swing) * 0.04;

            // Dynamic forward swing and lateral strike tilt
            group.rotation.x = swing * 0.38;
            group.rotation.z = Math.cos(cycle) * 0.15;
          }
        } else if (unit.state === 'moving') {
          // Orient towards moving destination
          if (unit.targetPosition) {
            const dx = unit.targetPosition.x - unit.position.x;
            const dz = unit.targetPosition.z - unit.position.z;
            if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
              group.rotation.y = Math.atan2(dx, dz);
            }
          }

          // Natural running gait
          const walkCycle = time * 12 + seed;
          group.position.x = unit.position.x;
          group.position.z = unit.position.z;
          group.position.y = baseElevation + Math.abs(Math.sin(walkCycle)) * 0.08;
          group.rotation.x = 0.05; // forward sprint lean
          group.rotation.z = Math.sin(walkCycle) * 0.06;
        } else if (unit.state === 'gathering') {
          const targetNode = currentNodes.find((n) => n.id === unit.targetEntityId);
          if (targetNode) {
            const dx = targetNode.position.x - unit.position.x;
            const dz = targetNode.position.z - unit.position.z;
            group.rotation.y = Math.atan2(dx, dz);
          }

          const chopCycle = Math.sin(time * 6 + seed);
          group.position.x = unit.position.x;
          group.position.z = unit.position.z;
          group.position.y = baseElevation + Math.max(0, chopCycle) * 0.03;
          group.rotation.x = Math.max(0, chopCycle) * 0.32;
          group.rotation.z = 0;
        } else if (unit.state === 'building') {
          // Carpentry hammering animation facing building under construction
          const targetBuilding = gameStateRef.current.buildings.find((b) => b.id === unit.targetEntityId);
          if (targetBuilding) {
            const dx = targetBuilding.position.x - unit.position.x;
            const dz = targetBuilding.position.z - unit.position.z;
            if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
              group.rotation.y = Math.atan2(dx, dz);
            }
          }

          const hammerCycle = Math.sin(time * 11 + seed);
          group.position.x = unit.position.x;
          group.position.z = unit.position.z;
          group.position.y = baseElevation + Math.max(0, hammerCycle) * 0.04;
          // Forward rhythmic strike swing
          group.rotation.x = Math.max(0, hammerCycle) * 0.42;
          group.rotation.z = Math.cos(time * 11 + seed) * 0.07;
        } else {
          // Idle breathing
          group.position.x = unit.position.x;
          group.position.z = unit.position.z;
          group.position.y = baseElevation + Math.sin(time * 2.5 + seed) * 0.015;
          group.rotation.x = 0;
          group.rotation.z = 0;
        }

        // Align Unit Floating 3D Health Bar to Camera
        if (engineRef.current) {
          const healthBar = group.getObjectByName('health_bar_container') as THREE.Group;
          if (healthBar) {
            const isSelected = selectedUnitIdsRef.current.includes(unit.id) || selectedEntityRef.current?.id === unit.id;
            update3DHealthBar(healthBar, unit.health, unit.maxHealth, isSelected);
            if (healthBar.visible) {
              align3DHealthBarToCamera(healthBar, group, engineRef.current.camera.quaternion);
            }
          }
        }
      });

      // Align Building Floating 3D Health Bars to Camera
      gameStateRef.current.buildings.forEach((b) => {
        const group = buildingMeshes.current.get(b.id);
        if (group && engineRef.current) {
          const healthBar = group.getObjectByName('health_bar_container') as THREE.Group;
          if (healthBar) {
            const isSelected = selectedEntityRef.current?.id === b.id;
            update3DHealthBar(healthBar, b.health, b.maxHealth, isSelected);
            if (healthBar.visible) {
              align3DHealthBarToCamera(healthBar, group, engineRef.current.camera.quaternion);
            }
          }
        }
      });

      // Animate Work Zone 3D holographic perimeters
      workZoneMeshes.current.forEach((group) => {
        const radiusGroup = group.getObjectByName('radius_group');
        if (radiusGroup) {
          radiusGroup.rotation.y = time * 0.08;
        }
        const ring = group.getObjectByName('perimeter_ring') as THREE.Mesh;
        if (ring && ring.material instanceof THREE.MeshBasicMaterial) {
          ring.material.opacity = 0.72 + Math.sin(time * 3) * 0.14;
        }
      });
    };

    // Handle Multiplayer Connection
    if (role !== 'single') {
      const multi = new MultiplayerManager(roomId, role === 'host', playerName, playerSlot);
      multiRef.current = multi;

      multi.onJoinError = (message) => {
        setLobbyError(message);
        setIsGameStarted(false);
      };

      multi.onPlayerJoined = (data) => {
        setConnectedPlayers(data.playerCount);
        const joinedSlot = isPlayerSlot(data.playerSlot) ? data.playerSlot : null;
        if (joinedSlot) {
          if (!activeSlotsRef.current.includes(joinedSlot)) {
            activeSlotsRef.current = [...activeSlotsRef.current, joinedSlot];
            setActiveSlots(activeSlotsRef.current);
          }
          if (role === 'host') spawnStarterBaseFor(joinedSlot);
        }
        setChatMessages((prev) => [
          ...prev,
          { sender: 'Sistema', message: `${data.playerName} entrou na partida!`, timestamp: Date.now() },
        ]);
      };

      multi.onPlayerLeft = (data) => {
        setConnectedPlayers(data.playerCount);
        const leftSlot = isPlayerSlot(data.playerSlot) ? data.playerSlot : null;
        if (leftSlot && role === 'host') {
          activeSlotsRef.current = activeSlotsRef.current.filter((slot) => slot !== leftSlot);
          setActiveSlots(activeSlotsRef.current);
        }
        setChatMessages((prev) => [
          ...prev,
          { sender: 'Sistema', message: `${data.playerName || 'Um jogador'} saiu da partida.`, timestamp: Date.now() },
        ]);
      };

      multi.onStateUpdate = (remoteState) => {
        if (role === 'client') {
          // Mesma semente do host: cliente e host veem o mesmo arquipelago.
          const hostSeed = remoteState.mapSeed;
          if (hostSeed !== undefined && proceduralMapRef.current?.seed !== hostSeed) {
            applyTerrainSeed(hostSeed);
          }
          const myUnits = remoteState.units.filter((u: Unit) => u.owner === playerSlot);
          if (prevMyUnitsCountRef.current !== null && myUnits.length > prevMyUnitsCountRef.current) {
            const newUnit = myUnits[myUnits.length - 1];
            soundManager.playUnitTrainedSound(newUnit?.type || 'villager');
          }
          prevMyUnitsCountRef.current = myUnits.length;

          // Detect damage dealt to any unit and trigger hit particles
          remoteState.units.forEach((remUnit: Unit) => {
            const prevUnit = gameStateRef.current.units.find((u) => u.id === remUnit.id);
            if (prevUnit && remUnit.health < prevUnit.health) {
              const isMusket = remUnit.type === 'soldier';
              engineRef.current?.spawnHitEffect(remUnit.position.x, 0.65, remUnit.position.z, isMusket);
              soundManager.playCombatHitSound(isMusket);
            }
          });
        }
        setGameState(remoteState);
      };

      multi.onCommand = (cmd) => {
        handleIncomingCommand(cmd);
      };

      multi.onChatMessage = (chat) => {
        setChatMessages((prev) => [...prev, chat]);
      };
    }

    // Host or Singleplayer populates initial map
    if (role === 'host' || role === 'single') {
      setupInitialMap();
    }

    const handleResize = () => engine.handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      engine.dispose();
      multiRef.current?.disconnect();
      unitMeshes.current.clear();
      buildingMeshes.current.clear();
      resourceMeshes.current.clear();
    };
  }, [isGameStarted]);

  // Base inicial de um slot: Centro da Vila + 2 aldeoes + 1 soldado
  const buildStarterBase = (slot: PlayerSlot, spawn: { x: number; z: number }) => {
    const townCenter: Building = {
      id: uuidv4(),
      type: 'town_center',
      owner: slot,
      position: { x: spawn.x, z: spawn.z },
      health: 2400,
      maxHealth: 2400,
      isComplete: true,
      trainingQueue: [],
    };

    const villager = (offsetX: number): Unit => ({
      id: uuidv4(),
      type: 'villager',
      owner: slot,
      position: { x: spawn.x + offsetX, z: spawn.z + 2 },
      targetPosition: null,
      targetEntityId: null,
      health: 100,
      maxHealth: 100,
      attackDamage: 5,
      state: 'idle' as const,
    });

    const units: Unit[] = [
      villager(1.8),
      villager(-1.8),
      {
        id: uuidv4(),
        type: 'soldier',
        owner: slot,
        position: { x: spawn.x + 2.5, z: spawn.z - 1.5 },
        targetPosition: null,
        targetEntityId: null,
        health: 150,
        maxHealth: 150,
        attackDamage: 18,
        state: 'idle',
      },
    ];

    return { townCenter, units };
  };

  const spawnForSlot = (slot: PlayerSlot): { x: number; z: number } | null => {
    const procMap = proceduralMapRef.current;
    if (!procMap) return null;
    if (slot === 'player1') return procMap.player1Spawn;
    if (slot === 'player2') return procMap.player2Spawn;
    if (slot === 'player3') return procMap.player3Spawn;
    return procMap.player4Spawn;
  };

  const startingColonyResources = (pop: number): PlayerResources => ({
    wood: 350,
    food: 350,
    gold: 200,
    stone: 100,
    planks: 0,
    pop,
    maxPop: 15,
  });

  // Multiplayer: quem entra depois do inicio da partida ganha a propria base no host
  const spawnStarterBaseFor = (slot: PlayerSlot) => {
    const spawn = spawnForSlot(slot);
    if (!spawn) return;
    if (gameStateRef.current.buildings.some((b) => b.owner === slot && b.type === 'town_center')) return;

    const { townCenter, units } = buildStarterBase(slot, spawn);
    setGameState((prev) => ({
      ...prev,
      buildings: [...prev.buildings, townCenter],
      units: [...prev.units, ...units],
      playerResources: { ...prev.playerResources, [slot]: startingColonyResources(units.length) },
      techs: { ...prev.techs, [slot]: prev.techs?.[slot] ?? createTechState() },
    }));
    triggerNotification(`${FACTION_COLORS[slot]?.name ?? slot} recebeu uma base inicial!`, 'success');
  };

  // Initial map setup with Procedural Archipelago, Town Centers, Resources & Villagers
  const applyTerrainSeed = (seed: number) => {
    const procMap = generateProceduralTerrain(MAP_SIZE, seed);
    proceduralMapRef.current = procMap;
    if (engineRef.current) {
      engineRef.current.setProceduralTerrainMesh(
        procMap.terrainMesh,
        procMap.waterMesh,
        procMap.riverBankDecorations
      );
    }
    unitPathsRef.current.clear();
    return procMap;
  };

  const setupInitialMap = () => {
    const procMap = generateProceduralTerrain(MAP_SIZE);
    proceduralMapRef.current = procMap;

    if (engineRef.current) {
      engineRef.current.setProceduralTerrainMesh(
        procMap.terrainMesh,
        procMap.waterMesh,
        procMap.riverBankDecorations
      );
    }

    const nodes: ResourceNode[] = procMap.resourceNodes;

    // Solo: o jogador local escolhe 2, 3 ou 4 participantes (ele + IA).
    // Multiplayer: o host nasce sozinho e cada slot que entrar ganha a propria base.
    const slots: PlayerSlot[] = role === 'single' ? soloMatchSlots(playerSlot, matchSize) : [playerSlot];

    const buildings: Building[] = [];
    const units: Unit[] = [];
    const playerResources: Record<string, PlayerResources> = {};
    const techs: Record<string, ReturnType<typeof createTechState>> = {};

    PLAYER_SLOTS.forEach((slot) => {
      playerResources[slot] = startingColonyResources(0);
      techs[slot] = createTechState();
    });

    slots.forEach((slot) => {
      const spawn = spawnForSlot(slot);
      if (!spawn) return;
      const starter = buildStarterBase(slot, spawn);
      buildings.push(starter.townCenter);
      units.push(...starter.units);
      playerResources[slot] = startingColonyResources(starter.units.length);
    });

    setActiveSlots(slots);
    activeSlotsRef.current = slots;

    setGameState({
      units,
      buildings,
      resourceNodes: nodes,
      playerResources,
      techs,
      mapSeed: procMap.seed,
    });
  };

  // Regenerate the procedural archipelago with a fresh seed
  const handleRegenerateProceduralMap = () => {
    const newSeed = Math.floor(Math.random() * 999999);
    const procMap = applyTerrainSeed(newSeed);
    setGameState((prev) => ({
      ...prev,
      resourceNodes: procMap.resourceNodes,
      mapSeed: newSeed,
    }));
    soundManager.playClickSound();
    triggerNotification(
      `Novo arquipélago gerado! Ilhas, rios, lagos e cardumes renovados (Semente: ${newSeed}).`,
      'success'
    );
  };


  useSceneSynchronization({
    engineRef,
    multiRef,
    proceduralMapRef,
    resourceMeshes,
    unitMeshes,
    buildingMeshes,
    gameState,
    selectedEntity,
    selectedUnitIds,
    role,
    playerSlot,
    visionGridRef,
  });

  // Nevoa de guerra: expira a visao do tick anterior e revela a visao atual
  // das unidades/edificios do jogador local (raios iguais aos do Minimap)
  useEffect(() => {
    const sources = [...gameState.units, ...gameState.buildings]
      .filter((entity) => entity.owner === playerSlot)
      .map((entity) => ({ x: entity.position.x, z: entity.position.z, radius: visionRadiusFor(entity) }));
    const grid = revealVision(expireVision(visionGridRef.current), sources);
    visionGridRef.current = grid;
    engineRef.current?.setFogGrid(grid);
  }, [gameState, playerSlot]);

  // Synchronize 3D Work Zone ground overlays with active zones and preview
  useEffect(() => {
    if (!engineRef.current) return;
    const { scene } = engineRef.current;

    if (!showWorkZones3D) {
      workZoneMeshes.current.forEach((mesh) => scene.remove(mesh));
      workZoneMeshes.current.clear();
      return;
    }

    const currentZoneKeys = new Set<string>();

    // 1. Sync Active Work Zones of player villagers
    activeWorkZones.forEach((zone) => {
      if (zone.radius >= 999) return;
      const key = zone.id;
      currentZoneKeys.add(key);

      let group = workZoneMeshes.current.get(key);
      const colorHex =
        zone.resourceType === 'tree'
          ? 0x10b981
          : zone.resourceType === 'gold_mine'
          ? 0xf59e0b
          : zone.resourceType === 'stone'
          ? 0x94a3b8
          : 0xf43f5e;

      if (!group) {
        group = createWorkZoneMesh(colorHex);
        scene.add(group);
        workZoneMeshes.current.set(key, group);
      }

      updateWorkZoneMesh(group, zone.x, zone.z, zone.radius, colorHex, zone.isHighlighted, false);
    });

    // 2. Sync Selected Resource prospective Work Zone preview
    if (previewZone && previewZone.radius < 999) {
      const previewKey = 'preview_work_zone';
      currentZoneKeys.add(previewKey);

      let group = workZoneMeshes.current.get(previewKey);
      const colorHex =
        previewZone.resourceType === 'tree'
          ? 0x34d399
          : previewZone.resourceType === 'gold_mine'
          ? 0xfbbf24
          : previewZone.resourceType === 'stone'
          ? 0xcbd5e1
          : 0xfb7185;

      if (!group) {
        group = createWorkZoneMesh(colorHex);
        scene.add(group);
        workZoneMeshes.current.set(previewKey, group);
      }

      updateWorkZoneMesh(group, previewZone.x, previewZone.z, previewZone.radius, colorHex, true, true);
    }

    // 3. Remove expired zone meshes
    workZoneMeshes.current.forEach((mesh, key) => {
      if (!currentZoneKeys.has(key)) {
        scene.remove(mesh);
        workZoneMeshes.current.delete(key);
      }
    });
  }, [activeWorkZones, previewZone, showWorkZones3D]);

  // Main Simulation Tick (Host or Singleplayer)
  useEffect(() => {
    if (role !== 'host' && role !== 'single') return;

    const buildingDefinitions = Object.fromEntries(
      Object.entries(BUILDING_CATALOG).map(([type, definition]) => [type, {
        name: definition.name,
        buildTimeSeconds: definition.buildTimeSeconds,
      }])
    );

    const interval = setInterval(() => {
      setGameState((prev) => {
        const procMap = proceduralMapRef.current;
        const result = tickGameState(prev, {
          playerSlot,
          mode: role,
          map: procMap ?? undefined,
          nearestOceanCell: procMap ? (x, z) => findNearestOceanCell(procMap, x, z) : undefined,
          pathCache: unitPathsRef.current,
          activeSlots: activeSlotsRef.current,
          gatherRadiusLimit: gatherRadiusLimitRef.current,
          sustainableForestryEnabled: isColonySustainableForestryRef.current,
          buildingDefinitions,
          random: Math.random,
          createId: uuidv4,
        });

        result.effects.forEach((effect) => {
          if (effect.type === 'hit') {
            engineRef.current?.spawnHitEffect(effect.x, effect.y, effect.z, effect.musket);
          } else if (effect.type === 'boat-sinking') {
            engineRef.current?.spawnBoatSinking(effect.x, effect.z);
          } else if (effect.type === 'construction-particles') {
            engineRef.current?.spawnConstructionParticles(effect.x, 0.7, effect.z);
          } else if (effect.type === 'notification') {
            triggerNotification(effect.message, effect.level);
          } else if (effect.type === 'sound') {
            if (effect.sound === 'combat-hit') soundManager.playCombatHitSound(effect.musket ?? false);
            else if (effect.sound === 'hammer') soundManager.playHammerSound();
            else if (effect.sound === 'building-completed' && effect.buildingType) {
              soundManager.playBuildingCompletedSound(effect.buildingType);
            } else if (effect.sound === 'unit-trained') {
              soundManager.playUnitTrainedSound(effect.unitType ?? 'villager');
            }
          }
        });

        return result.state;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [role]);

  // Handle incoming network command from peer
  const handleIncomingCommand = (cmd: unknown) => {
    if (!isValidNetworkCommand(cmd)) return;
    const commandOwner = cmd.playerSlot === undefined ? playerSlot : isPlayerSlot(cmd.playerSlot) ? cmd.playerSlot : null;
    if (!commandOwner || !isAuthorizedPlayerCommand(gameStateRef.current, cmd, commandOwner)) return;

    if (cmd.type === 'build') {
      const placement = checkBuildingPlacementValid(
        cmd.buildingType,
        cmd.position.x,
        cmd.position.z,
        gameStateRef.current.buildings,
        gameStateRef.current.resourceNodes,
        MAP_SIZE,
        proceduralMapRef.current ? proceduralMapRef.current.isWaterAt : undefined,
        proceduralMapRef.current ? proceduralMapRef.current.isCliffAt : undefined,
        proceduralMapRef.current ? proceduralMapRef.current.getHeightAt : undefined
      );
      if (!placement.isValid) return;
    }

    if (cmd.type === 'move') {
      setGameState((prev) => ({
        ...prev,
        units: prev.units.map((u) => (u.id === cmd.unitId ? { ...u, targetPosition: cmd.target, targetEntityId: null, state: 'moving' } : u)),
      }));
    } else if (cmd.type === 'gather') {
      const targetNode = gameStateRef.current.resourceNodes.find((n) => n.id === cmd.targetId);
      const origin = cmd.origin || (targetNode ? { x: targetNode.position.x, z: targetNode.position.z } : undefined);
      const radius = cmd.radiusLimit || gatherRadiusLimitRef.current || 14;
      const timeLimit = cmd.timeLimitSeconds !== undefined ? cmd.timeLimitSeconds : (gatherShiftDurationRef.current || 0);

      setGameState((prev) => ({
        ...prev,
        units: prev.units.map((u) =>
          u.id === cmd.unitId
            ? {
                ...u,
                targetEntityId: cmd.targetId,
                targetPosition: null,
                state: 'gathering' as const,
                gatherOrigin: origin,
                gatherRadiusLimit: radius,
                gatherTimeLimitSeconds: timeLimit,
                gatherShiftSecondsRemaining: timeLimit > 0 ? timeLimit : undefined,
              }
            : u
        ),
      }));
    } else if (cmd.type === 'set_work_zone') {
      setGameState((prev) => ({
        ...prev,
        units: prev.units.map((u) => {
          if (cmd.unitIds.includes(u.id)) {
            const targetNode = u.targetEntityId ? prev.resourceNodes.find((n) => n.id === u.targetEntityId) : undefined;
            const newOrigin =
              cmd.origin ||
              u.gatherOrigin ||
              (targetNode ? { x: targetNode.position.x, z: targetNode.position.z } : { x: u.position.x, z: u.position.z });
            return {
              ...u,
              gatherRadiusLimit: cmd.radiusLimit,
              gatherOrigin: newOrigin,
            };
          }
          return u;
        }),
      }));
    } else if (cmd.type === 'attack') {
      setGameState((prev) => ({
        ...prev,
        units: prev.units.map((u) => (u.id === cmd.unitId ? { ...u, targetEntityId: cmd.targetId, state: 'attacking' } : u)),
      }));
    } else if (cmd.type === 'build_order') {
      setGameState((prev) => ({
        ...prev,
        units: prev.units.map((u) =>
          u.id === cmd.unitId
            ? { ...u, state: 'building' as const, targetEntityId: cmd.targetId, targetPosition: null }
            : u
        ),
      }));
    } else if (cmd.type === 'build') {
      // Audio feedback: New building construction started!
      if (cmd.owner === playerSlot) {
        soundManager.playBuildingConstructStartedSound(cmd.buildingType);
      }
      const def = BUILDING_CATALOG[cmd.buildingType];
      const maxHp = def.maxHealth;
      const newBuilding: Building = {
        id: uuidv4(),
        type: cmd.buildingType,
        owner: cmd.owner,
        position: cmd.position,
        health: Math.round(maxHp * 0.1),
        maxHealth: maxHp,
        isComplete: false,
        buildProgress: 0,
        trainingQueue: [],
      };
      setGameState((prev) => {
        const pRes = prev.playerResources[cmd.owner];
        if (!pRes || !canAfford(pRes, def.cost)) return prev;
        const placement = checkBuildingPlacementValid(
          cmd.buildingType,
          cmd.position.x,
          cmd.position.z,
          prev.buildings,
          prev.resourceNodes,
          MAP_SIZE,
          proceduralMapRef.current ? proceduralMapRef.current.isWaterAt : undefined,
          proceduralMapRef.current ? proceduralMapRef.current.isCliffAt : undefined,
          proceduralMapRef.current ? proceduralMapRef.current.getHeightAt : undefined
        );
        if (!placement.isValid) return prev;

        // Auto-assign any selected villagers from the builder to start hammering
        const updatedUnits = prev.units.map((u) => {
          if (cmd.builderIds && cmd.builderIds.includes(u.id)) {
            return {
              ...u,
              state: 'building' as const,
              targetEntityId: newBuilding.id,
              targetPosition: null,
            };
          }
          return u;
        });

        return {
          ...prev,
          buildings: [...prev.buildings, newBuilding],
          units: updatedUnits,
          playerResources: {
            ...prev.playerResources,
            [cmd.owner]: applyCost(pRes, def.cost),
          },
        };
      });
    } else if (cmd.type === 'train') {
      setGameState((prev) => {
        const building = prev.buildings.find((candidate) => candidate.id === cmd.buildingId);
        const owner = cmd.playerSlot || building?.owner;
        const resources = owner ? prev.playerResources[owner] : undefined;
        if (!building || !isPlayerSlot(owner) || !resources || !building.isComplete || building.trainingQueue.length >= 5) return prev;

        const queuedForOwner = prev.buildings
          .filter((candidate) => candidate.owner === owner)
          .reduce((total, candidate) => total + candidate.trainingQueue.length, 0);
        if (resources.pop + queuedForOwner >= resources.maxPop) return prev;
        const unitCost = UNIT_COSTS[cmd.unitType];
        if (cmd.playerSlot && !canAfford(resources, unitCost)) return prev;

        return {
          ...prev,
          buildings: prev.buildings.map((candidate) =>
            candidate.id === cmd.buildingId
              ? { ...candidate, trainingQueue: [...candidate.trainingQueue, { unitType: cmd.unitType, progress: 0 }] }
              : candidate
          ),
          ...(cmd.playerSlot ? {
            playerResources: {
              ...prev.playerResources,
              [owner]: applyCost(resources, unitCost),
            },
          } : {}),
        };
      });
    } else if (cmd.type === 'cancel_train') {
      setGameState((prev) => {
        const b = prev.buildings.find((bd) => bd.id === cmd.buildingId);
        if (!b || b.trainingQueue.length <= cmd.index) return prev;
        const item = b.trainingQueue[cmd.index];
        const unitCost = UNIT_COSTS[item.unitType];
        const pRes = prev.playerResources[b.owner];
        const newQueue = b.trainingQueue.filter((_, idx) => idx !== cmd.index);
        return {
          ...prev,
          buildings: prev.buildings.map((bd) =>
            bd.id === cmd.buildingId ? { ...bd, trainingQueue: newQueue } : bd
          ),
          playerResources: {
            ...prev.playerResources,
            [b.owner]: refundCost(pRes, unitCost),
          },
        };
      });
    } else if (cmd.type === 'research') {
      // Pesquisa de tecnologia ou avanco de era: custo debitado e fila validada no host
      setGameState((prev) => {
        const owner = cmd.playerSlot || playerSlot;
        const techState = prev.techs?.[owner];
        const resources = prev.playerResources[owner];
        if (!techState || !resources) return prev;

        const started = startResearch(techState, cmd.id, resources);
        if (!started) return prev;

        if (owner === playerSlotRef.current) {
          soundManager.playClickSound();
          triggerNotification(`Pesquisa iniciada: ${researchTarget(cmd.id)?.name ?? cmd.id}`, 'info');
        }

        return {
          ...prev,
          techs: { ...prev.techs, [owner]: started.techState },
          playerResources: { ...prev.playerResources, [owner]: started.resources },
        };
      });
    } else if (cmd.type === 'repair') {
      // Aldeao do dono passa a consertar o edificio proprio (paga madeira por HP)
      setGameState((prev) => {
        const building = prev.buildings.find((bd) => bd.id === cmd.buildingId);
        const unit = prev.units.find((u) => u.id === cmd.unitId);
        if (!building || !unit || unit.owner !== building.owner || unit.type !== 'villager') return prev;
        return {
          ...prev,
          units: prev.units.map((u) =>
            u.id === cmd.unitId
              ? { ...u, state: 'repairing' as const, targetEntityId: cmd.buildingId, targetPosition: null }
              : u
          ),
        };
      });
      triggerNotification('Aldeão a caminho para reparar o edifício.', 'info');
    } else if (cmd.type === 'demolish') {
      setGameState((prev) => {
        const b = prev.buildings.find((bd) => bd.id === cmd.buildingId);
        if (!b || b.type === 'town_center') return prev;
        const def = BUILDING_CATALOG[b.type];
        const pRes = prev.playerResources[b.owner];
        if (!def || !pRes) return prev;
        return {
          ...prev,
          buildings: prev.buildings.filter((bd) => bd.id !== cmd.buildingId),
          playerResources: {
            ...prev.playerResources,
            [b.owner]: refundCost(pRes, halfCost(def.cost)),
          },
        };
      });
      triggerNotification('Edifício demolido: metade dos recursos devolvida.', 'success');
    } else if (cmd.type === 'set_resource_mode') {
      setGameState((prev) => ({
        ...prev,
        resourceNodes: prev.resourceNodes.map((n) =>
          n.id === cmd.resourceId ? { ...n, harvestMode: cmd.mode } : n
        ),
      }));
    } else if (cmd.type === 'set_grove_mode') {
      setGameState((prev) => ({
        ...prev,
        resourceNodes: prev.resourceNodes.map((n) =>
          (cmd.clusterId && n.clusterId === cmd.clusterId) || cmd.treeIds?.includes(n.id)
            ? { ...n, harvestMode: cmd.mode }
            : n
        ),
      }));
    } else if (cmd.type === 'set_colony_forestry') {
      setIsColonySustainableForestry(cmd.enabled);
      setGameState((prev) => ({
        ...prev,
        resourceNodes: prev.resourceNodes.map((n) =>
          n.type === 'tree' ? { ...n, harvestMode: cmd.enabled ? 'sustainable' : n.harvestMode } : n
        ),
      }));
    } else if (cmd.type === 'remove_resource') {
      setGameState((prev) => ({
        ...prev,
        resourceNodes: prev.resourceNodes.filter((n) => n.id !== cmd.resourceId),
        units: prev.units.map((u) =>
          u.targetEntityId === cmd.resourceId ? { ...u, state: 'idle' as const, targetEntityId: null } : u
        ),
      }));
    }
  };

  // Prune any selected units that were destroyed
  useEffect(() => {
    if (selectedUnitIds.length > 0) {
      const aliveIds = new Set(gameState.units.map((u) => u.id));
      const remaining = selectedUnitIds.filter((id) => aliveIds.has(id));
      if (remaining.length !== selectedUnitIds.length) {
        setSelectedUnitIds(remaining);
        if (remaining.length === 0 && selectedEntity?.kind === 'unit') {
          setSelectedEntity(null);
        }
      }
    }
  }, [gameState.units]);

  // Keyboard hotkeys: HUD toggle (H), Base focus (Space), Cancel/Clear (Escape), Build hotkeys (Q, W, E)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not trigger game hotkeys if focused on text input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        if (buildMode) {
          setBuildMode(null);
        } else {
          setSelectedUnitIds([]);
          setSelectedEntity(null);
        }
      } else if (e.key === 'l' || e.key === 'L') {
        toggleCameraLock();
      } else if (e.key === 'c' || e.key === 'C') {
        setHudMode((prev) => {
          const next = prev === 'compact' ? 'full' : 'compact';
          soundManager.playClickSound();
          triggerNotification(next === 'compact' ? 'Modo Tático Compacto ativado.' : 'Modo HUD Completo ativado.', 'info');
          return next;
        });
      } else if (e.key === 'm' || e.key === 'M') {
        setIsMinimapCollapsed((prev) => {
          const next = !prev;
          soundManager.playClickSound();
          triggerNotification(next ? 'Mini-mapa recolhido.' : 'Mini-mapa expandido.', 'info');
          return next;
        });
      } else if (e.key === 'k' || e.key === 'K') {
        setIsEmpireCatalogOpen((prev) => {
          const next = !prev;
          soundManager.playClickSound();
          return next;
        });
      } else if (e.key === 'z' || e.key === 'Z') {
        setIsWorkZoneModalOpen((prev) => {
          const next = !prev;
          soundManager.playClickSound();
          return next;
        });
      } else if (e.key === 'h' || e.key === 'H') {
        setHudMode((prev) => {
          const next = prev === 'hidden' ? 'full' : 'hidden';
          triggerNotification(
            next === 'full' ? 'Interface HUD exibida.' : 'Interface HUD ocultada (Modo Cinemático). Pressione H para restaurar.',
            'info'
          );
          return next;
        });
        soundManager.playClickSound();
      } else if (e.key === '1') {
        setSquadFormation('box');
        soundManager.playClickSound();
        triggerNotification('Formação em Caixa selecionada (Marcha em Bloco)', 'info');
      } else if (e.key === '2') {
        setSquadFormation('line');
        soundManager.playClickSound();
        triggerNotification('Formação em Linha de Batalha selecionada (Fuzilaria Frontal)', 'info');
      } else if (e.key === '3') {
        setSquadFormation('spread');
        soundManager.playClickSound();
        triggerNotification('Formação Dispersa selecionada (Anti-Área)', 'info');
      } else if (e.key === ' ') {
        e.preventDefault();
        // Spacebar: Center camera on selected squad, or player's Town Center
        if (selectedUnitIdsRef.current.length > 0) {
          const firstU = gameStateRef.current.units.find((u) => u.id === selectedUnitIdsRef.current[0]);
          if (firstU && engineRef.current) {
            engineRef.current.setCameraTarget(firstU.position.x, firstU.position.z);
            triggerNotification('Câmera centralizada no pelotão selecionado', 'info');
          }
        } else {
          const myTc = gameStateRef.current.buildings.find(
            (b) => b.owner === playerSlot && b.type === 'town_center'
          );
          if (myTc && engineRef.current) {
            engineRef.current.setCameraTarget(myTc.position.x, myTc.position.z);
            triggerNotification('Câmera centralizada no Centro da Vila', 'info');
          }
        }
      } else {
        // Check if any villager is selected for quick build hotkeys
        const hasVillagerSelected =
          gameStateRef.current.units.some(
            (u) => selectedUnitIdsRef.current.includes(u.id) && u.owner === playerSlot && u.type === 'villager'
          ) ||
          (selectedEntity?.kind === 'unit' &&
            gameStateRef.current.units.find((u) => u.id === selectedEntity.id)?.type === 'villager' &&
            gameStateRef.current.units.find((u) => u.id === selectedEntity.id)?.owner === playerSlot);

        if (hasVillagerSelected && !buildMode) {
          const key = e.key.toLowerCase();
          if (key === 'q') {
            setBuildMode('house');
            soundManager.playClickSound();
            triggerNotification('Modo de Construção: Casa Colonial [Q]. Clique no chão para posicionar.', 'info');
          } else if (key === 'w') {
            setBuildMode('barracks');
            soundManager.playClickSound();
            triggerNotification('Modo de Construção: Quartel Militar [W]. Clique no chão para posicionar.', 'info');
          } else if (key === 'e') {
            setBuildMode('tower');
            soundManager.playClickSound();
            triggerNotification('Modo de Construção: Torre de Vigia [E]. Clique no chão para posicionar.', 'info');
          } else if (key === 'r') {
            setBuildMode('sawmill');
            soundManager.playClickSound();
            triggerNotification('Modo de Construção: Serralheria & Madeireira [R]. Clique no chão para posicionar.', 'info');
          } else if (key === 't') {
            setBuildMode('mine');
            soundManager.playClickSound();
            triggerNotification('Modo de Construção: Mineradora & Pedreira [T]. Clique no chão para posicionar.', 'info');
          } else if (key === 'y') {
            setBuildMode('market');
            soundManager.playClickSound();
            triggerNotification('Modo de Construção: Mercadão do Império [Y]. Clique no chão para posicionar.', 'info');
          } else if (key === 'f') {
            setBuildMode('farm');
            soundManager.playClickSound();
            triggerNotification('Modo de Construção: Fazenda & Granja [F]. Clique no chão para posicionar.', 'info');
          } else if (key === 'b') {
            setBuildMode('dock');
            soundManager.playClickSound();
            triggerNotification('Modo de Construção: Cais Naval [B]. Posicione na margem do rio.', 'info');
          }
        }

        // Training hotkeys for selected building
        if (selectedEntity?.kind === 'building') {
          const b = gameStateRef.current.buildings.find((bd) => bd.id === selectedEntity.id);
          if (b && b.owner === playerSlot && b.isComplete) {
            const key = e.key.toLowerCase();
            if (b.type === 'town_center' && key === 'v') {
              handleTrainUnit('villager', 1);
            } else if (b.type === 'barracks' && key === 's') {
              handleTrainUnit('soldier', 1);
            } else if (b.type === 'barracks' && key === 'g') {
              handleTrainUnit('cavalry', 1);
            } else if (b.type === 'dock' && key === 'p') {
              handleTrainUnit('fishing_boat', 1);
            } else if (b.type === 'dock' && key === 'm') {
              handleTrainUnit('trade_boat', 1);
            } else if (b.type === 'dock' && key === 'g') {
              handleTrainUnit('warship', 1);
            }
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [buildMode, playerSlot, selectedEntity]);

  // Manage 3D Building Ghost in the scene during build mode
  useEffect(() => {
    if (!engineRef.current) return;
    const scene = engineRef.current.scene;

    // Clean up existing ghost if any
    if (ghostBuildingMesh.current) {
      scene.remove(ghostBuildingMesh.current);
      ghostBuildingMesh.current = null;
      setBuildPreviewInfo(null);
    }

    if (buildMode) {
      const ghost = createBuildingGhost(buildMode);
      ghost.position.set(MAP_SIZE / 2, 0, MAP_SIZE / 2);
      scene.add(ghost);
      ghostBuildingMesh.current = ghost;
    }

    return () => {
      if (ghostBuildingMesh.current && engineRef.current) {
        engineRef.current.scene.remove(ghostBuildingMesh.current);
        ghostBuildingMesh.current = null;
      }
    };
  }, [buildMode]);

  // Execute building placement at specific screen coordinates
  const handleBuildingPlacementAt = (clientX: number, clientY: number) => {
    if (!buildMode || !engineRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, engineRef.current.camera);

    const groundIntersects = raycaster.intersectObject(engineRef.current.groundMesh);
    if (groundIntersects.length > 0) {
      const point = groundIntersects[0].point;
      const snappedX = Math.round(point.x);
      const snappedZ = Math.round(point.z);

      const check = checkBuildingPlacementValid(
        buildMode,
        snappedX,
        snappedZ,
        gameStateRef.current.buildings,
        gameStateRef.current.resourceNodes,
        MAP_SIZE,
        proceduralMapRef.current ? proceduralMapRef.current.isWaterAt : undefined,
        proceduralMapRef.current ? proceduralMapRef.current.isCliffAt : undefined,
        proceduralMapRef.current ? proceduralMapRef.current.getHeightAt : undefined
      );

      if (!check.isValid) {
        soundManager.playClickSound();
        triggerNotification(`Não é possível construir aqui: ${check.reason || 'Local inválido'}`, 'warning');
        return;
      }

      const def = BUILDING_CATALOG[buildMode];
      const myRes = gameStateRef.current.playerResources[playerSlot];
      const buildingCost = def ? def.cost : { wood: 60 };

      if (canAfford(myRes, buildingCost)) {
        // Collect selected villager ids so they automatically move to build
        let builderVillagers = gameStateRef.current.units.filter(
          (u) => selectedUnitIdsRef.current.includes(u.id) && u.owner === playerSlot && u.type === 'villager'
        );
        // If no villagers were explicitly selected in the squad, find the nearest friendly villager
        if (builderVillagers.length === 0) {
          const friendlyVillagers = gameStateRef.current.units.filter(
            (u) => u.owner === playerSlot && u.type === 'villager'
          );
          if (friendlyVillagers.length > 0) {
            friendlyVillagers.sort((a, b) => {
              const distA = Math.hypot(a.position.x - snappedX, a.position.z - snappedZ);
              const distB = Math.hypot(b.position.x - snappedX, b.position.z - snappedZ);
              return distA - distB;
            });
            builderVillagers = [friendlyVillagers[0]];
          }
        }
        const builderIds = builderVillagers.length > 0 ? builderVillagers.map((v) => v.id) : undefined;

        const cmd = {
          type: 'build',
          buildingType: buildMode,
          owner: playerSlot,
          position: { x: snappedX, z: snappedZ },
          builderIds,
        };

        if (role === 'host' || role === 'single') {
          handleIncomingCommand(cmd);
        } else {
          soundManager.playBuildingConstructStartedSound(buildMode);
          multiRef.current?.sendToHost(cmd);
        }
        triggerNotification(`Fundação iniciada: ${def ? def.name : 'Edifício'}!`, 'info');
        setBuildMode(null);
      } else {
        soundManager.playClickSound();
        triggerNotification(
          `Recursos insuficientes para ${def ? def.name : 'Edifício'}! ${missingCost(myRes, buildingCost) || ''}`,
          'warning'
        );
      }
    }
  };

  // Single click raycast selection (when not dragging marquee box)
  const handleSingleEntityClick = (clientX: number, clientY: number, shiftKey: boolean) => {
    if (!engineRef.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, engineRef.current.camera);

    // If player is interactively setting a Work Zone center with click:
    if (isSettingZoneCenter) {
      let targetPos: { x: number; z: number } | null = null;
      for (const [id, group] of resourceMeshes.current.entries()) {
        const hits = raycaster.intersectObjects(group.children, true);
        if (hits.length > 0) {
          const res = gameStateRef.current.resourceNodes.find((n) => n.id === id);
          if (res) targetPos = { x: res.position.x, z: res.position.z };
          break;
        }
      }
      if (!targetPos) {
        const groundHits = raycaster.intersectObject(engineRef.current.groundMesh);
        if (groundHits.length > 0) {
          targetPos = { x: groundHits[0].point.x, z: groundHits[0].point.z };
        }
      }

      if (targetPos) {
        setIsSettingZoneCenter(false);
        soundManager.playClickSound();
        const selectedVillagers = gameStateRef.current.units.filter(
          (u) => selectedUnitIdsRef.current.includes(u.id) && u.owner === playerSlot && u.type === 'villager'
        );
        const radius = gatherRadiusLimitRef.current || 14;
        if (selectedVillagers.length > 0) {
          const cmd = {
            type: 'set_work_zone',
            unitIds: selectedVillagers.map((u) => u.id),
            radiusLimit: radius,
            origin: targetPos,
          };
          if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
          else multiRef.current?.sendToHost(cmd);
          triggerNotification(
            `Novo centro da Zona de Trabalho definido em X:${Math.round(targetPos.x)} Z:${Math.round(targetPos.z)} (Raio: ${radius}m)!`,
            'success'
          );
        } else {
          triggerNotification(
            `Centro da Zona configurado em X:${Math.round(targetPos.x)} Z:${Math.round(targetPos.z)}. Envie aldeões para colher aqui!`,
            'info'
          );
        }
        return;
      }
    }

    interface ClickCandidate {
      kind: 'unit' | 'building' | 'resource';
      id: string;
      distance: number;
    }
    const candidates: ClickCandidate[] = [];

    // 1. Raycast Units
    for (const [id, group] of unitMeshes.current.entries()) {
      const hits = raycaster.intersectObjects(group.children, true);
      if (hits.length > 0) {
        candidates.push({ kind: 'unit', id, distance: hits[0].distance });
      }
    }

    // 2. Raycast Buildings
    for (const [id, group] of buildingMeshes.current.entries()) {
      const hits = raycaster.intersectObjects(group.children, true);
      if (hits.length > 0) {
        candidates.push({ kind: 'building', id, distance: hits[0].distance });
      }
    }

    // 3. Raycast Resource Nodes (trees, groves, gold, berries)
    for (const [id, group] of resourceMeshes.current.entries()) {
      const hits = raycaster.intersectObjects(group.children, true);
      if (hits.length > 0) {
        candidates.push({ kind: 'resource', id, distance: hits[0].distance });
      }
    }

    // If direct 3D hits found, select the entity with the shortest distance to camera (front-most object)!
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.distance - b.distance);
      const best = candidates[0];

      if (best.kind === 'unit') {
        const clickedUnit = gameStateRef.current.units.find((u) => u.id === best.id);
        if (shiftKey) {
          setSelectedUnitIds((prev) => {
            const next = prev.includes(best.id) ? prev.filter((uid) => uid !== best.id) : [...prev, best.id];
            setSelectedEntity(next.length > 0 ? { id: next[0], kind: 'unit' } : null);
            if (next.length > 0) {
              soundManager.playUnitResponseSound(next.length > 1 ? 'group' : clickedUnit?.type || 'soldier', next.length);
            }
            return next;
          });
        } else {
          setSelectedUnitIds([best.id]);
          setSelectedEntity({ id: best.id, kind: 'unit' });
          soundManager.playUnitResponseSound(clickedUnit?.type || 'soldier', 1);
        }
        return;
      } else if (best.kind === 'building') {
        setSelectedUnitIds([]);
        setSelectedEntity({ id: best.id, kind: 'building' });
        soundManager.playClickSound();
        return;
      } else {
        setSelectedUnitIds([]);
        setSelectedEntity({ id: best.id, kind: 'resource' });
        soundManager.playClickSound();
        return;
      }
    }

    // 4. Ground proximity fallback for resources and structures (if clicked slightly beside a tree in a grove)
    const groundHits = raycaster.intersectObject(engineRef.current.groundMesh);
    if (groundHits.length > 0) {
      const pt = groundHits[0].point;
      let closestNode: ResourceNode | null = null;
      let closestDist = 2.4;

      gameStateRef.current.resourceNodes.forEach((node) => {
        const d = Math.hypot(node.position.x - pt.x, node.position.z - pt.z);
        if (d < closestDist) {
          closestDist = d;
          closestNode = node;
        }
      });

      if (closestNode) {
        setSelectedUnitIds([]);
        setSelectedEntity({ id: (closestNode as ResourceNode).id, kind: 'resource' });
        soundManager.playClickSound();
        return;
      }
    }

    // 5. Clicked empty ground -> clear selection unless Shift is held
    if (!shiftKey) {
      setSelectedUnitIds([]);
      setSelectedEntity(null);
    }
  };

  // Viewport mouse down: initiates marquee drag or placement
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (buildMode) return; // Build mode placement handled on click

    isMouseDownRef.current = true;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    isDraggingMarqueeRef.current = false;
  };

  // Global window listeners for smooth marquee drag, ghost placement preview, & release
  useEffect(() => {
    const onWindowMouseMove = (e: MouseEvent) => {
      // Real-time 3D building ghost preview & space footprint overlay
      if (buildMode && engineRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, engineRef.current.camera);
        const groundHits = raycaster.intersectObject(engineRef.current.groundMesh);
        if (groundHits.length > 0) {
          const pt = groundHits[0].point;
          const snappedX = Math.round(pt.x);
          const snappedZ = Math.round(pt.z);
          const check = checkBuildingPlacementValid(
            buildMode,
            snappedX,
            snappedZ,
            gameStateRef.current.buildings,
            gameStateRef.current.resourceNodes,
            MAP_SIZE,
            proceduralMapRef.current ? proceduralMapRef.current.isWaterAt : undefined,
            proceduralMapRef.current ? proceduralMapRef.current.isCliffAt : undefined,
            proceduralMapRef.current ? proceduralMapRef.current.getHeightAt : undefined
          );
          if (ghostBuildingMesh.current) {
            const ghostY = proceduralMapRef.current ? proceduralMapRef.current.getHeightAt(snappedX, snappedZ) : pt.y;
            updateBuildingGhost(ghostBuildingMesh.current, { x: snappedX, y: ghostY, z: snappedZ }, check.isValid);
          }
          setBuildPreviewInfo({
            x: snappedX,
            z: snappedZ,
            isValid: check.isValid,
            reason: check.reason,
            width: check.footprintWidth,
            depth: check.footprintDepth,
          });
        }
      }

      // Marquee selection drag tracking (generous threshold to avoid accidental drags on quick clicks)
      if (!isMouseDownRef.current || !dragStartPosRef.current) return;
      const dx = e.clientX - dragStartPosRef.current.x;
      const dy = e.clientY - dragStartPosRef.current.y;
      if (Math.hypot(dx, dy) > 9) {
        isDraggingMarqueeRef.current = true;
        setMarqueeBox({
          startX: dragStartPosRef.current.x,
          startY: dragStartPosRef.current.y,
          currentX: e.clientX,
          currentY: e.clientY,
        });
      }
    };

    const onWindowMouseUp = (e: MouseEvent) => {
      if (!isMouseDownRef.current && !buildMode) return;
      const wasDragging = isDraggingMarqueeRef.current;
      const startPos = dragStartPosRef.current;
      const dragDist = startPos ? Math.hypot(e.clientX - startPos.x, e.clientY - startPos.y) : 0;

      isMouseDownRef.current = false;
      dragStartPosRef.current = null;
      isDraggingMarqueeRef.current = false;
      setMarqueeBox(null);

      if (buildMode) {
        handleBuildingPlacementAt(e.clientX, e.clientY);
        return;
      }

      if (wasDragging && dragDist >= 9 && startPos && engineRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const minX = Math.min(startPos.x, e.clientX);
        const maxX = Math.max(startPos.x, e.clientX);
        const minY = Math.min(startPos.y, e.clientY);
        const maxY = Math.max(startPos.y, e.clientY);

        const camera = engineRef.current.camera;
        const unitsInBox: Unit[] = [];

        gameStateRef.current.units.forEach((unit) => {
          const p = new THREE.Vector3(unit.position.x, 0.5, unit.position.z);
          p.project(camera);
          if (p.z >= -1 && p.z <= 1) {
            const sx = ((p.x + 1) / 2) * rect.width + rect.left;
            const sy = ((-p.y + 1) / 2) * rect.height + rect.top;
            if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
              unitsInBox.push(unit);
            }
          }
        });

        if (unitsInBox.length > 0) {
          // Prioritize player's own units in RTS selection
          const myUnits = unitsInBox.filter((u) => u.owner === playerSlot);
          const finalUnits = myUnits.length > 0 ? myUnits : unitsInBox;
          const newIds = finalUnits.map((u) => u.id);

          if (e.shiftKey) {
            const merged = Array.from(new Set([...selectedUnitIdsRef.current, ...newIds]));
            setSelectedUnitIds(merged);
            setSelectedEntity({ id: merged[0], kind: 'unit' });
            soundManager.playUnitResponseSound(merged.length > 1 ? 'group' : finalUnits[0]?.type || 'soldier', merged.length);
          } else {
            setSelectedUnitIds(newIds);
            setSelectedEntity({ id: newIds[0], kind: 'unit' });
            soundManager.playUnitResponseSound(newIds.length > 1 ? 'group' : finalUnits[0]?.type || 'soldier', newIds.length);
          }
        } else {
          // If drag box contained no units, fallback to single entity raycast click at release position
          handleSingleEntityClick(e.clientX, e.clientY, e.shiftKey);
        }
      } else {
        handleSingleEntityClick(e.clientX, e.clientY, e.shiftKey);
      }
    };

    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, [playerSlot, buildMode, role]);

  // Issue coordinated squad formation movement ('box' | 'line' | 'spread')
  const issueGroupMove = (units: Unit[], targetX: number, targetZ: number) => {
    const count = units.length;
    if (count === 0) return;

    if (count === 1) {
      const cmd = {
        type: 'move',
        unitId: units[0].id,
        target: { x: targetX, z: targetZ },
      };
      if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
      else multiRef.current?.sendToHost(cmd);
      return;
    }

    // Direction vector of march from current squad center to target
    const avgX = units.reduce((sum, u) => sum + u.position.x, 0) / count;
    const avgZ = units.reduce((sum, u) => sum + u.position.z, 0) / count;

    const dirX = targetX - avgX;
    const dirZ = targetZ - avgZ;
    const len = Math.hypot(dirX, dirZ);

    let fwdX = 0;
    let fwdZ = 1;
    let perpX = 1;
    let perpZ = 0;

    if (len > 0.01) {
      fwdX = dirX / len;
      fwdZ = dirZ / len;
      // Perpendicular vector to forward (flank left-to-right vector)
      perpX = -fwdZ;
      perpZ = fwdX;
    }

    const formation = squadFormationRef.current;

    units.forEach((unit, idx) => {
      let finalX = targetX;
      let finalZ = targetZ;

      if (formation === 'line') {
        // Line formation (Linha de Batalha): Frontal ranks abreast perpendicular to march vector
        const maxRank = count > 8 ? Math.ceil(count / 2) : count;
        const rankIndex = idx % maxRank;
        const rankRow = Math.floor(idx / maxRank);
        const colOffset = (rankIndex - (maxRank - 1) / 2) * 1.6;
        const rowOffset = -rankRow * 1.8;

        finalX = targetX + perpX * colOffset + fwdX * rowOffset;
        finalZ = targetZ + perpZ * colOffset + fwdZ * rowOffset;
      } else if (formation === 'spread') {
        // Spread formation (Dispersa): Staggered circular loose spacing
        const angle = (idx / count) * Math.PI * 2;
        const radius = 1.8 + (idx % 2) * 1.4;
        finalX = targetX + Math.cos(angle) * radius;
        finalZ = targetZ + Math.sin(angle) * radius;
      } else {
        // Box formation (Caixa / Bloco): Compact tactical marching grid
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        const spacing = 1.4;
        const col = idx % cols;
        const row = Math.floor(idx / cols);

        const colOffset = (col - (cols - 1) / 2) * spacing;
        const rowOffset = -(row - (rows - 1) / 2) * spacing;

        finalX = targetX + perpX * colOffset + fwdX * rowOffset;
        finalZ = targetZ + perpZ * colOffset + fwdZ * rowOffset;
      }

      const clampedX = Math.max(2, Math.min(MAP_SIZE - 2, finalX));
      const clampedZ = Math.max(2, Math.min(MAP_SIZE - 2, finalZ));

      // Visual ground waypoint pip for each unit's slot in the formation at correct elevation
      const waypointY = proceduralMapRef.current ? proceduralMapRef.current.getHeightAt(clampedX, clampedZ) : 0;
      engineRef.current?.spawnClickMarker(clampedX, clampedZ, 'move', waypointY);

      const cmd = {
        type: 'move',
        unitId: unit.id,
        target: {
          x: clampedX,
          z: clampedZ,
        },
      };

      if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
      else multiRef.current?.sendToHost(cmd);
    });
  };

  // Right-click action (Command Move, Gather, Attack, or Build/Repair)
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!engineRef.current || !containerRef.current) return;

    // Collect all units in current selection owned by player
    let myUnits = gameState.units.filter(
      (u) => selectedUnitIdsRef.current.includes(u.id) && u.owner === playerSlot
    );
    if (myUnits.length === 0 && selectedEntity?.kind === 'unit') {
      const single = gameState.units.find((u) => u.id === selectedEntity.id && u.owner === playerSlot);
      if (single) myUnits = [single];
    }
    if (myUnits.length === 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, engineRef.current.camera);

    // 1. Check if clicked an Enemy Unit (Group Attack Order)
    for (const [id, group] of unitMeshes.current.entries()) {
      const hits = raycaster.intersectObjects(group.children, true);
      if (hits.length > 0) {
        const target = gameState.units.find((u) => u.id === id);
        if (target && target.owner !== playerSlot) {
          let navalSkipped = false;
          myUnits.forEach((u) => {
            // Barcos so enfrentam embarcacoes: nunca saem da agua atras de terra firme
            if (isBoatUnit(u.type) && !isBoatUnit(target.type)) {
              navalSkipped = true;
              return;
            }
            const cmd = { type: 'attack', unitId: u.id, targetId: id };
            if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
            else multiRef.current?.sendToHost(cmd);
          });
          if (navalSkipped) {
            triggerNotification('Barcos só enfrentam embarcações inimigas!', 'warning');
          }
          engineRef.current.spawnClickMarker(target.position.x, target.position.z, 'attack');
          soundManager.playClickSound();
          return;
        }
      }
    }

    // 2. Check if clicked a Building (Attack Enemy OR Build/Repair Friendly Incomplete Site)
    for (const [id, group] of buildingMeshes.current.entries()) {
      const hits = raycaster.intersectObjects(group.children, true);
      if (hits.length > 0) {
        const targetB = gameState.buildings.find((b) => b.id === id);
        if (targetB) {
          if (targetB.owner !== playerSlot) {
            // Attack enemy building (barcos ficam na agua)
            let navalSkipped = false;
            myUnits.forEach((u) => {
              if (isBoatUnit(u.type)) {
                navalSkipped = true;
                return;
              }
              const cmd = { type: 'attack', unitId: u.id, targetId: id };
              if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
              else multiRef.current?.sendToHost(cmd);
            });
            if (navalSkipped) {
              triggerNotification('Barcos só enfrentam embarcações inimigas!', 'warning');
            }
            engineRef.current.spawnClickMarker(targetB.position.x, targetB.position.z, 'attack');
            soundManager.playClickSound();
            return;
          } else if (!targetB.isComplete) {
            // Friendly building under construction -> send villagers to build/repair
            myUnits.forEach((u) => {
              if (u.type === 'villager') {
                const cmd = { type: 'build_order', unitId: u.id, targetId: id };
                if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
                else multiRef.current?.sendToHost(cmd);
              }
            });
            engineRef.current.spawnClickMarker(targetB.position.x, targetB.position.z, 'build');
            soundManager.playClickSound();
            return;
          }
        }
      }
    }

    // 3. Check if clicked a Resource Node (Villagers gather, soldiers guard nearby)
    let targetedResourceId: string | null = null;
    for (const [id, group] of resourceMeshes.current.entries()) {
      const hits = raycaster.intersectObjects(group.children, true);
      if (hits.length > 0) {
        targetedResourceId = id;
        break;
      }
    }

    // Proximity fallback for right-click: if clicked slightly beside a tree or gold mine
    if (!targetedResourceId) {
      const groundHits = raycaster.intersectObject(engineRef.current.groundMesh);
      if (groundHits.length > 0) {
        const pt = groundHits[0].point;
        let closestDist = 2.4;
        gameState.resourceNodes.forEach((node) => {
          const d = Math.hypot(node.position.x - pt.x, node.position.z - pt.z);
          if (d < closestDist) {
            closestDist = d;
            targetedResourceId = node.id;
          }
        });
      }
    }

    if (targetedResourceId) {
      const node = gameState.resourceNodes.find((n) => n.id === targetedResourceId);
      const radius = gatherRadiusLimitRef.current || 14;
      const timeLimit = gatherShiftDurationRef.current || 0;
      const origin = node ? { x: node.position.x, z: node.position.z } : undefined;

      let sentCount = 0;
      myUnits.forEach((u) => {
        if (u.type === 'villager') {
          sentCount++;
          const cmd = {
            type: 'gather',
            unitId: u.id,
            targetId: targetedResourceId,
            radiusLimit: radius,
            timeLimitSeconds: timeLimit,
            origin,
          };
          if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
          else multiRef.current?.sendToHost(cmd);
        } else {
          if (node) {
            const cmd = {
              type: 'move',
              unitId: u.id,
              target: { x: node.position.x + (Math.random() * 2 - 1), z: node.position.z + (Math.random() * 2 - 1) },
            };
            if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
            else multiRef.current?.sendToHost(cmd);
          }
        }
      });
      if (node) {
        engineRef.current.spawnClickMarker(node.position.x, node.position.z, 'gather');
      }
      soundManager.playClickSound();
      if (sentCount > 0) {
        triggerNotification(
          `Zona de Trabalho estabelecida! ${sentCount} aldeão(ões) vinculados a este local (raio: ${radius >= 999 ? 'busca livre' : `${radius}m`}).`,
          'info'
        );
      }
      return;
    }

    // 4. Move to ground location with squad formation
    const groundHits = raycaster.intersectObject(engineRef.current.groundMesh);
    if (groundHits.length > 0) {
      const point = groundHits[0].point;

      // Check if clicked location is an impassable Skyrim rocky cliff
      const isLandUnit = myUnits.some((u) => !isBoatUnit(u.type));
      if (isLandUnit && proceduralMapRef.current?.isCliffAt(point.x, point.z)) {
        triggerNotification('Pico rochoso íngreme intransitável (Estilo Skyrim)! As tropas não podem subir.', 'warning');
        soundManager.playClickSound();
        return;
      }

      const markerY = proceduralMapRef.current ? proceduralMapRef.current.getHeightAt(point.x, point.z) : point.y;
      issueGroupMove(myUnits, point.x, point.z);
      engineRef.current.spawnClickMarker(point.x, point.z, 'move', markerY);
      soundManager.playClickSound();
    }
  };

  // Order move from Minimap right-click
  const handleMinimapOrderMove = (target: { x: number; z: number }) => {
    let myUnits = gameState.units.filter(
      (u) => selectedUnitIdsRef.current.includes(u.id) && u.owner === playerSlot
    );
    if (myUnits.length === 0 && selectedEntity?.kind === 'unit') {
      const single = gameState.units.find((u) => u.id === selectedEntity.id && u.owner === playerSlot);
      if (single) myUnits = [single];
    }
    if (myUnits.length === 0) return;
    issueGroupMove(myUnits, target.x, target.z);
    soundManager.playClickSound();
  };

  // Train unit in building with multi-queue support (up to 5 slots)
  const handleTrainUnit = (unitType: UnitType, count: number = 1) => {
    if (!selectedEntity || selectedEntity.kind !== 'building') return;

    const b = gameState.buildings.find((bd) => bd.id === selectedEntity.id);
    if (!b || b.owner !== playerSlot) return;

    const unitCost = UNIT_COSTS[unitType];

    const myRes = gameState.playerResources[playerSlot];

    const maxQueue = 5;
    const availableSlots = maxQueue - b.trainingQueue.length;
    if (availableSlots <= 0) {
      soundManager.playClickSound();
      triggerNotification('Fila de produção cheia! Máximo de 5 unidades na fila.', 'warning');
      return;
    }

    const totalQueuedForPlayer = gameState.buildings
      .filter((bd) => bd.owner === playerSlot)
      .reduce((sum, bd) => sum + bd.trainingQueue.length, 0);

    const unitsToQueue = Math.min(count, availableSlots);
    let successfullyQueued = 0;
    let currentRes = myRes;

    for (let i = 0; i < unitsToQueue; i++) {
      if (myRes.pop + totalQueuedForPlayer + successfullyQueued >= myRes.maxPop) {
        triggerNotification('Limite de população atingido! Construa Casas Coloniais [Q] (+5 pop).', 'warning');
        break;
      }
      if (!canAfford(currentRes, unitCost)) {
        const unitName =
          unitType === 'villager'
            ? 'Aldeão'
            : unitType === 'soldier'
            ? 'Mosqueteiro'
            : unitType === 'cavalry'
            ? 'Cavalaria'
            : unitType === 'fishing_boat'
            ? 'Barco de Pesca'
            : unitType === 'warship'
            ? 'Barco de Guerra'
            : 'Barco Mercante';
        triggerNotification(
          `Recursos insuficientes para ${unitName}! ${missingCost(currentRes, unitCost) || ''}`,
          'warning'
        );
        break;
      }
      currentRes = applyCost(currentRes, unitCost);
      successfullyQueued++;

      const cmd = { type: 'train', buildingId: b.id, unitType };
      if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
      else multiRef.current?.sendToHost(cmd);
    }

    if (successfullyQueued > 0) {
      soundManager.playClickSound();
      setGameState((prev) => ({
        ...prev,
        playerResources: {
          ...prev.playerResources,
          [playerSlot]: currentRes,
        },
      }));
      const unitName =
        unitType === 'villager'
          ? 'Aldeão'
          : unitType === 'soldier'
          ? 'Mosqueteiro'
          : unitType === 'cavalry'
          ? 'Cavalaria'
          : unitType === 'fishing_boat'
          ? 'Barco de Pesca'
          : unitType === 'warship'
          ? 'Barco de Guerra'
          : 'Barco Mercante';
      triggerNotification(
        `+${successfullyQueued} ${unitName}(s) adicionado(s) à fila de construção!`,
        'success'
      );
    }
  };

  // Cancel unit from building training queue with full resource refund
  const handleCancelTrain = (buildingId: string, index: number) => {
    const b = gameState.buildings.find((bd) => bd.id === buildingId);
    if (!b || b.owner !== playerSlot || b.trainingQueue.length <= index) return;

    const cmd = { type: 'cancel_train', buildingId, index };
    if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
    else multiRef.current?.sendToHost(cmd);

    soundManager.playClickSound();
    triggerNotification('Recrutamento cancelado e recursos reembolsados!', 'info');
  };

  // Toggle individual tree harvest mode: clear_cut vs sustainable
  const handleToggleResourceHarvestMode = (resourceId: string, mode: 'clear_cut' | 'sustainable') => {
    soundManager.playClickSound();
    const cmd = { type: 'set_resource_mode', resourceId, mode };
    if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
    else multiRef.current?.sendToHost(cmd);

    triggerNotification(
      mode === 'sustainable'
        ? 'Manejo Florestal Sustentável: A árvore renascerá automaticamente com nova muda após colheita!'
        : 'Desmatamento Permanente: A árvore será removida para desobstruir e limpar o terreno.',
      'info'
    );
  };

  // Configure entire forest grove / cluster to sustainable reforestation or clear cut
  const handleSetGroveHarvestMode = (targetClusterIdOrTreeId: string, mode: 'sustainable' | 'clear_cut') => {
    soundManager.playClickSound();
    const centerNode = gameStateRef.current.resourceNodes.find(
      (n) => n.id === targetClusterIdOrTreeId || n.clusterId === targetClusterIdOrTreeId
    );
    if (!centerNode) return;

    const clusterId = centerNode.clusterId;
    const targetTrees = gameStateRef.current.resourceNodes.filter(
      (n) =>
        n.type === 'tree' &&
        ((clusterId && n.clusterId === clusterId) ||
          Math.hypot(n.position.x - centerNode.position.x, n.position.z - centerNode.position.z) <= 12)
    );

    const treeIds = targetTrees.map((t) => t.id);
    const cmd = {
      type: 'set_grove_mode',
      clusterId,
      treeIds,
      mode,
    };

    if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
    else multiRef.current?.sendToHost(cmd);

    triggerNotification(
      mode === 'sustainable'
        ? `Bosque "${centerNode.clusterName || 'Local'}" (${targetTrees.length} árvores) configurado para Reflorestamento Sustentável! Todas as árvores replantarão mudas automaticamente.`
        : `Bosque "${centerNode.clusterName || 'Local'}" (${targetTrees.length} árvores) configurado para Desmatamento Permanente!`,
      'info'
    );
  };

  // Colony-wide sustainable forestry policy toggle
  const handleToggleColonySustainableForestry = () => {
    const nextState = !isColonySustainableForestry;
    setIsColonySustainableForestry(nextState);
    soundManager.playClickSound();

    const cmd = {
      type: 'set_colony_forestry',
      enabled: nextState,
    };
    if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
    else multiRef.current?.sendToHost(cmd);

    triggerNotification(
      nextState
        ? 'Política Colonial de Reflorestamento ATIVADA! Toda árvore colhida no mapa renascerá automaticamente com nova muda.'
        : 'Política Colonial de Reflorestamento DESATIVADA. O manejo volta às configurações individuais de cada bosque.',
      nextState ? 'success' : 'info'
    );
  };

  // Remove tree immediately from map (e.g. clear path or foundation)
  const handleRemoveResourceImmediately = (resourceId: string) => {
    const node = gameStateRef.current.resourceNodes.find((n) => n.id === resourceId);
    if (!node) return;
    soundManager.playClickSound();
    engineRef.current?.spawnHitEffect(node.position.x, 0.5, node.position.z, false);
    const cmd = { type: 'remove_resource', resourceId };
    if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
    else multiRef.current?.sendToHost(cmd);
    setSelectedEntity(null);
    triggerNotification('Árvore removida do terreno.', 'info');
  };

  // Assign idle villagers to a specific resource with proximity leash and work shift timer
  const handleAssignVillagersToResource = (resourceId: string, count: number) => {
    const node = gameStateRef.current.resourceNodes.find((n) => n.id === resourceId);
    if (!node) return;

    let available = gameStateRef.current.units.filter(
      (u) => u.owner === playerSlot && u.type === 'villager' && u.targetEntityId !== resourceId
    );
    available.sort((a, b) => {
      if (a.state === 'idle' && b.state !== 'idle') return -1;
      if (a.state !== 'idle' && b.state === 'idle') return 1;
      const dA = Math.hypot(a.position.x - node.position.x, a.position.z - node.position.z);
      const dB = Math.hypot(b.position.x - node.position.x, b.position.z - node.position.z);
      return dA - dB;
    });

    const chosen = available.slice(0, count);
    if (chosen.length === 0) {
      triggerNotification('Nenhum aldeão disponível. Recrute novos aldeões no Centro da Vila!', 'warning');
      return;
    }

    const radius = gatherRadiusLimitRef.current || 14;
    const timeLimit = gatherShiftDurationRef.current || 0;
    const origin = { x: node.position.x, z: node.position.z };

    chosen.forEach((v) => {
      const cmd = {
        type: 'gather',
        unitId: v.id,
        targetId: resourceId,
        radiusLimit: radius,
        timeLimitSeconds: timeLimit,
        origin,
      };
      if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
      else multiRef.current?.sendToHost(cmd);
    });

    engineRef.current?.spawnClickMarker(node.position.x, node.position.z, 'gather');
    soundManager.playClickSound();
    triggerNotification(
      `${chosen.length} aldeão(ões) enviado(s) para coleta (${radius >= 999 ? 'sem limite de raio' : `raio de ${radius}m`}${timeLimit > 0 ? `, turno ${timeLimit}s` : ''})!`,
      'success'
    );
  };

  // Quick-select an idle friendly villager and focus camera
  const handleSelectIdleVillager = () => {
    const idleVillager = gameState.units.find(
      (u) => u.owner === playerSlot && u.type === 'villager' && u.state === 'idle'
    );
    if (idleVillager) {
      setSelectedUnitIds([idleVillager.id]);
      setSelectedEntity({ id: idleVillager.id, kind: 'unit' });
      if (engineRef.current) {
        engineRef.current.setCameraTarget(idleVillager.position.x, idleVillager.position.z);
      }
      soundManager.playUnitResponseSound('villager', 1);
      triggerNotification('Aldeão ocioso selecionado!', 'info');
    } else {
      triggerNotification('Nenhum aldeão ocioso no momento.', 'info');
    }
  };

  // Jump camera directly to the nearest resource of a given type
  const handleJumpToResource = (type: 'tree' | 'gold_mine' | 'food_bush' | 'fish_school' | 'stone') => {
    if (!engineRef.current) return;
    const myTc = gameState.buildings.find((b) => b.owner === playerSlot && b.type === 'town_center');
    const refX = myTc ? myTc.position.x : MAP_SIZE / 2;
    const refZ = myTc ? myTc.position.z : MAP_SIZE / 2;

    const available = gameState.resourceNodes.filter((n) => n.type === type && n.remaining > 0);
    if (available.length === 0) {
      const typeLabel =
        type === 'tree'
          ? 'Madeira'
          : type === 'gold_mine'
          ? 'Ouro'
          : type === 'fish_school'
          ? 'Peixes'
          : type === 'stone'
          ? 'Pedra'
          : 'Alimento';
      triggerNotification(`Nenhum depósito de ${typeLabel} restante no mapa!`, 'warning');
      return;
    }

    available.sort((a, b) => {
      const distA = Math.hypot(a.position.x - refX, a.position.z - refZ);
      const distB = Math.hypot(b.position.x - refX, b.position.z - refZ);
      return distA - distB;
    });

    const targetNode = available[0];
    engineRef.current.setCameraTarget(targetNode.position.x, targetNode.position.z);
    setSelectedEntity({ id: targetNode.id, kind: 'resource' });
    soundManager.playClickSound();
    triggerNotification(`Câmera focada em: ${targetNode.name || 'Recurso'} mais próximo!`, 'info');
  };

  // Trade resource at the Grand Market (Ikariam / AoE market exchange)
  const handleTradeResource = (type: MarketResourceType, action: 'buy' | 'sell', amount: number) => {
    const myRes = gameState.playerResources[playerSlot];
    if (!myRes) return;

    const outcome = tradeResource(myRes, type, action, amount);
    if (!outcome.ok || !outcome.next) {
      triggerNotification(outcome.reason || 'Operação de comércio inválida.', 'warning');
      return;
    }

    setGameState((prev) => {
      const applied = tradeResource(prev.playerResources[playerSlot], type, action, amount);
      if (!applied.ok || !applied.next) return prev;
      return {
        ...prev,
        playerResources: {
          ...prev.playerResources,
          [playerSlot]: applied.next,
        },
      };
    });
    soundManager.playClickSound();

    const nextRes = outcome.next;
    const label = MARKET_LABELS[type];
    if (action === 'buy') {
      const goldSpent = myRes.gold - nextRes.gold;
      triggerNotification(`Mercadão: Comprado ${amount} de ${label} por ${goldSpent} ouro!`, 'success');
    } else {
      const goldGained = nextRes.gold - myRes.gold;
      triggerNotification(`Mercadão: Vendido ${amount} de ${label} por ${goldGained} ouro!`, 'success');
    }
  };

  // Assign currently selected squad (or part of it) to a resource
  const handleAssignSelectedSquadToResource = (resourceId: string) => {
    const node = gameStateRef.current.resourceNodes.find((n) => n.id === resourceId);
    if (!node) return;

    const myVillagers = gameStateRef.current.units.filter(
      (u) => selectedUnitIdsRef.current.includes(u.id) && u.owner === playerSlot && u.type === 'villager'
    );
    if (myVillagers.length === 0) {
      handleAssignVillagersToResource(resourceId, 1);
      return;
    }

    const radius = gatherRadiusLimitRef.current || 14;
    const timeLimit = gatherShiftDurationRef.current || 0;
    const origin = { x: node.position.x, z: node.position.z };

    myVillagers.forEach((v) => {
      const cmd = {
        type: 'gather',
        unitId: v.id,
        targetId: resourceId,
        radiusLimit: radius,
        timeLimitSeconds: timeLimit,
        origin,
      };
      if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
      else multiRef.current?.sendToHost(cmd);
    });

    engineRef.current?.spawnClickMarker(node.position.x, node.position.z, 'gather');
    soundManager.playClickSound();
    triggerNotification(
      `${myVillagers.length} aldeão(ões) do pelotão enviado(s) para coleta (${radius >= 999 ? 'sem limite' : `raio ${radius}m`}${timeLimit > 0 ? `, turno ${timeLimit}s` : ''})!`,
      'success'
    );
  };

  // Dynamically change work zone radius for specific units
  const handleSetUnitWorkZoneRadius = (unitIds: string[], newRadius: number) => {
    setGatherRadiusLimit(newRadius);
    soundManager.playClickSound();

    if (unitIds.length > 0) {
      const cmd = {
        type: 'set_work_zone',
        unitIds,
        radiusLimit: newRadius,
      };
      if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
      else multiRef.current?.sendToHost(cmd);

      triggerNotification(
        `Raio da Zona ajustado para ${newRadius >= 999 ? 'Sem Limite (Livre)' : `${newRadius}m`} (${unitIds.length} aldeão[ões])!`,
        'success'
      );
    }
  };

  // Apply a configured radius to all currently active working villagers in colony
  const handleApplyRadiusToAllWorkingVillagers = (newRadius: number) => {
    setGatherRadiusLimit(newRadius);
    soundManager.playClickSound();

    const activeVillagers = gameStateRef.current.units.filter(
      (u) => u.owner === playerSlot && u.type === 'villager' && (u.state === 'gathering' || u.gatherOrigin)
    );

    if (activeVillagers.length > 0) {
      const cmd = {
        type: 'set_work_zone',
        unitIds: activeVillagers.map((v) => v.id),
        radiusLimit: newRadius,
      };
      if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
      else multiRef.current?.sendToHost(cmd);

      triggerNotification(
        `Raio de ${newRadius >= 999 ? 'Sem Limite' : `${newRadius}m`} aplicado a todos os ${activeVillagers.length} aldeões em trabalho!`,
        'success'
      );
    } else {
      triggerNotification(
        `Raio padrão configurado para ${newRadius >= 999 ? 'Sem Limite' : `${newRadius}m`}. Envie aldeões para colher.`,
        'info'
      );
    }
  };

  // Clear an entire forest cluster: marks nearby trees for clear_cut and assigns villagers
  const handleClearForestCluster = (treeId: string) => {
    const centerNode = gameStateRef.current.resourceNodes.find((n) => n.id === treeId);
    if (!centerNode) return;

    const nearbyTrees = gameStateRef.current.resourceNodes.filter(
      (n) => n.type === 'tree' && Math.hypot(n.position.x - centerNode.position.x, n.position.z - centerNode.position.z) <= 12
    );

    nearbyTrees.forEach((t) => {
      const cmd = { type: 'set_resource_mode', resourceId: t.id, mode: 'clear_cut' };
      if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
      else multiRef.current?.sendToHost(cmd);
    });

    handleAssignVillagersToResource(treeId, 3);
    triggerNotification(
      `Operação "Limpar Floresta": ${nearbyTrees.length} árvores no bosque marcadas para remoção total!`,
      'info'
    );
  };

  // Order all available friendly idle villagers to help construct an unfinished building
  const handleSendAllIdleVillagersToBuild = (buildingId: string) => {
    const villagers = gameState.units.filter(
      (u) => u.owner === playerSlot && u.type === 'villager' && u.state !== 'building'
    );
    if (villagers.length === 0) {
      triggerNotification('Nenhum aldeão livre disponível. Recrute novos aldeões no Centro da Vila!', 'warning');
      return;
    }
    villagers.forEach((v) => {
      const cmd = { type: 'build_order', unitId: v.id, targetId: buildingId };
      if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
      else multiRef.current?.sendToHost(cmd);
    });
    soundManager.playClickSound();
    triggerNotification(`${villagers.length} aldeão(ões) enviados para a construção!`, 'success');
  };

  // Send Chat message
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentChatInput.trim()) return;

    multiRef.current?.sendChat(currentChatInput);
    if (role === 'single') {
      setChatMessages((prev) => [
        ...prev,
        { sender: playerName, message: currentChatInput, timestamp: Date.now() },
      ]);
    }
    setCurrentChatInput('');
  };

  const copyLanUrl = () => {
    const ip = lanIps[0] || window.location.hostname;
    const url = `http://${ip}:3000`;
    navigator.clipboard.writeText(url);
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 2500);
  };

  // Tutorial de primeira partida: abre uma unica vez por navegador e pode ser
  // revisto pelo botao "Controles" no HUD.
  useEffect(() => {
    if (!isGameStarted || tutorialSeenCheckedRef.current) return;
    tutorialSeenCheckedRef.current = true;
    if (isHudPreviewMode) return;
    try {
      if (window.localStorage.getItem(TUTORIAL_SEEN_KEY) !== '1') {
        setShowTutorial(true);
      }
    } catch {
      setShowTutorial(true);
    }
  }, [isGameStarted, isHudPreviewMode]);

  // Ponte da Poc de HUD: existe apenas na rota de preview. So LE o que o HUD precisa
  // (mapa, camera, recursos e entidades) e permite centralizar a camera, que e
  // navegacao. Nao envia ordens, nao toca economia e nao expoe rede.
  useEffect(() => {
    if (!isHudPreviewMode) return;
    type Canto = { x: number; z: number };
    const ponte = {
      mapSize: MAP_SIZE,
      map: () => proceduralMapRef.current,
      islands: () => proceduralMapRef.current?.islands ?? [],
      resources: () =>
        gameStateRef.current.resourceNodes.map((r) => ({ x: r.position.x, z: r.position.z, type: r.type })),
      entities: () => ({
        units: gameStateRef.current.units.map((u) => ({ x: u.position.x, z: u.position.z, owner: u.owner, kind: 'unit' as const, type: u.type })),
        buildings: gameStateRef.current.buildings.map((b) => ({ x: b.position.x, z: b.position.z, owner: b.owner, kind: 'building' as const, type: b.type })),
      }),
      playerSlot,
      camera: () => {
        const e = engineRef.current;
        return e ? { x: e.cameraTarget.x, z: e.cameraTarget.z } : null;
      },
      // Pegada da camera no chao: projeta os quatro cantos da tela no plano y=0.
      viewport: (): Canto[] | null => {
        const e = engineRef.current;
        if (!e) return null;
        const cam = e.camera;
        const cantos: Canto[] = [];
        for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
          const v = new THREE.Vector3(nx, ny, 0.5).unproject(cam);
          const dir = v.sub(cam.position).normalize();
          if (Math.abs(dir.y) < 1e-4) return null;
          const t = -cam.position.y / dir.y;
          cantos.push({ x: cam.position.x + dir.x * t, z: cam.position.z + dir.z * t });
        }
        return cantos;
      },
      centerOn: (x: number, z: number) => {
        const e = engineRef.current;
        if (!e) return false;
        e.setCameraTarget(x, z);
        return true;
      },
    };
    const alvo = window as unknown as { __terrinhaPreview?: typeof ponte };
    alvo.__terrinhaPreview = ponte;
    return () => {
      delete alvo.__terrinhaPreview;
    };
  }, [isHudPreviewMode, playerSlot]);

  const closeTutorial = () => {
    setShowTutorial(false);
    try {
      window.localStorage.setItem(TUTORIAL_SEEN_KEY, '1');
    } catch {
      // armazenamento indisponivel: o tutorial podera abrir de novo
    }
  };

  if (!isGameStarted) {
    return (
      <LobbyScreen
        lanIps={lanIps}
        copiedIp={copiedIp}
        copyLanUrl={copyLanUrl}
        playerName={playerName}
        setPlayerName={setPlayerName}
        roomId={roomId}
        setRoomId={setRoomId}
        playerSlot={playerSlot}
        setPlayerSlot={setPlayerSlot}
        lobbyError={lobbyError}
        matchSize={matchSize}
        setMatchSize={setMatchSize}
        onStartGame={(nextRole) => {
          setLobbyError(null);
          setRole(nextRole);
          setIsGameStarted(true);
        }}
      />
    );
  }

  // Reparo e demolicao de edificios proprios (validados no host)
  const handleResearch = (id: string) => {
    const cmd = { type: 'research', id };
    if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
    else multiRef.current?.sendToHost(cmd);
  };

  const handleRepairBuilding = (unitId: string, buildingId: string) => {
    const cmd = { type: 'repair', unitId, buildingId };
    if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
    else multiRef.current?.sendToHost(cmd);
    soundManager.playClickSound();
  };

  const handleDemolishBuilding = (buildingId: string) => {
    const cmd = { type: 'demolish', buildingId };
    if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
    else multiRef.current?.sendToHost(cmd);
    soundManager.playClickSound();
  };

  // ==========================================
  // RENDER: IN-GAME RTS INTERFACE
  // ==========================================
  const myResources = gameState.playerResources[playerSlot] || { wood: 0, food: 0, gold: 0, pop: 0, maxPop: 10 };

  // Match outcome: o host publica gameState.match, o jogador local deriva seu resultado
  const matchStatus = gameState.match;
  const matchFinished = matchStatus?.status === 'finished';
  const contenders = matchStatus?.players ?? activeSlots;
  const isMatchContender = contenders.includes(playerSlot);
  const outcome: LocalOutcome = isMatchContender
    ? localOutcome(playerSlot, gameState.buildings, contenders)
    : 'running';
  const showResultScreen = isMatchContender && (matchFinished || outcome !== 'running');
  const isDraw = matchStatus?.status === 'finished' && matchStatus.winner === null;
  const resultLabel = isDraw ? 'EMPATE' : outcome === 'victory' ? 'VITÓRIA' : 'DERROTA';
  const resultToneClass = isDraw
    ? 'text-slate-100'
    : outcome === 'victory'
      ? 'text-amber-300'
      : 'text-red-400';
  const resultDetail = isDraw
    ? 'Nenhum Centro da Vila sobreviveu ao confronto.'
    : outcome === 'victory'
      ? 'Todos os oponentes perderam o Centro da Vila.'
      : 'Seu Centro da Vila foi destruído.';

  const selectedUnitsList = gameState.units.filter((u) => selectedUnitIds.includes(u.id));
  const soldierCount = selectedUnitsList.filter((u) => u.type === 'soldier').length;
  const villagerCount = selectedUnitsList.filter((u) => u.type === 'villager').length;
  const totalSquadHealth = selectedUnitsList.reduce((sum, u) => sum + u.health, 0);
  const totalSquadMaxHealth = selectedUnitsList.reduce((sum, u) => sum + u.maxHealth, 0);
  const selectedUnit = selectedEntity?.kind === 'unit' ? gameState.units.find((u) => u.id === selectedEntity.id) : null;
  const selectedBuilding = selectedEntity?.kind === 'building' ? gameState.buildings.find((b) => b.id === selectedEntity.id) : null;
  const selectedResource = selectedEntity?.kind === 'resource' ? gameState.resourceNodes.find((r) => r.id === selectedEntity.id) : null;

  // Active builders working on selected building if any
  const activeBuildersOnSelectedBuilding = selectedBuilding
    ? gameState.units.filter((u) => u.state === 'building' && u.targetEntityId === selectedBuilding.id).length
    : 0;

  // Aldeao proprio mais proximo do edificio selecionado (destino do reparo)
  let nearestVillagerToSelectedBuilding: Unit | null = null;
  if (selectedBuilding) {
    const buildingX = selectedBuilding.position.x;
    const buildingZ = selectedBuilding.position.z;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of gameState.units) {
      if (candidate.owner !== playerSlot || candidate.type !== 'villager' || candidate.health <= 0) continue;
      const distance = Math.hypot(candidate.position.x - buildingX, candidate.position.z - buildingZ);
      if (distance < closestDistance) {
        closestDistance = distance;
        nearestVillagerToSelectedBuilding = candidate;
      }
    }
  }

  // Active gatherers working on selected resource if any
  const activeGatherersOnSelectedResource = selectedResource
    ? gameState.units.filter((u) => u.state === 'gathering' && u.targetEntityId === selectedResource.id).length
    : 0;

  // Grove cluster calculation for selected resource
  const groveTrees = selectedResource && selectedResource.type === 'tree'
    ? gameState.resourceNodes.filter(
        (n) =>
          n.type === 'tree' &&
          ((selectedResource.clusterId && n.clusterId === selectedResource.clusterId) ||
            Math.hypot(n.position.x - selectedResource.position.x, n.position.z - selectedResource.position.z) <= 12)
      )
    : [];
  const matureGroveCount = groveTrees.filter((n) => n.remaining > 0 && !n.isRegrowing).length;
  const regrowingGroveCount = groveTrees.filter((n) => n.isRegrowing).length;
  const isGroveAllSustainable = groveTrees.length > 0 && groveTrees.every((n) => n.harvestMode === 'sustainable');

  // Total idle friendly villagers ready for dispatch
  const idleFriendlyVillagersCount = gameState.units.filter(
    (u) => u.owner === playerSlot && u.type === 'villager' && u.state === 'idle'
  ).length;

  // Total units queued in production across player's buildings
  const totalQueuedForPlayer = gameState.buildings
    .filter((b) => b.owner === playerSlot)
    .reduce((sum, b) => sum + b.trainingQueue.length, 0);

  // Render comprehensive, rich construction menu for villagers
  const renderVillagerBuildCatalog = () => {
    const buildings: BuildingType[] = [
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
      <div className="mt-3 pt-3 border-t border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
          <span className="flex items-center gap-1.5 text-amber-400">
            <Hammer className="w-3.5 h-3.5" /> Edificações do Aldeão & Império:
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEmpireCatalogOpen(true)}
              className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold underline flex items-center gap-1"
            >
              <span>Matriz Tecnológica & Mercadão</span>
            </button>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">Q, W, E, R, T, Y, F, B</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-56 sm:max-h-none overflow-y-auto pr-0.5">
          {buildings.map((type) => {
            const def = BUILDING_CATALOG[type];
            const affordable = canAfford(myResources, def.cost);

            const icon =
              type === 'house' ? (
                <Home className="w-3.5 h-3.5 text-amber-400" />
              ) : type === 'barracks' ? (
                <Shield className="w-3.5 h-3.5 text-red-400" />
              ) : type === 'tower' ? (
                <Castle className="w-3.5 h-3.5 text-cyan-400" />
              ) : type === 'sawmill' ? (
                <TreePine className="w-3.5 h-3.5 text-emerald-400" />
              ) : type === 'mine' ? (
                <Coins className="w-3.5 h-3.5 text-yellow-400" />
              ) : type === 'market' ? (
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              ) : type === 'farm' ? (
                <Sprout className="w-3.5 h-3.5 text-lime-400" />
              ) : (
                <Compass className="w-3.5 h-3.5 text-blue-400" />
              );

            return (
              <button
                key={type}
                type="button"
                disabled={!affordable}
                onClick={() => {
                  setBuildMode(type);
                  soundManager.playClickSound();
                  triggerNotification(`Modo de Construção: ${def.name}. Clique no terreno para erguer.`, 'info');
                }}
                className={`p-2 rounded-xl border text-left flex flex-col justify-between transition-all group relative overflow-hidden ${
                  affordable
                    ? 'bg-slate-900/90 hover:bg-slate-800/95 border-slate-700/80 hover:border-amber-500/60 text-white shadow-sm hover:shadow-amber-500/10 hover:scale-[1.02]'
                    : 'bg-slate-950/70 border-slate-800/60 text-slate-600 cursor-not-allowed opacity-60'
                }`}
              >
                <div className="flex items-start justify-between w-full mb-1">
                  <div className="p-1 rounded-lg bg-slate-800/90 border border-slate-700/50 group-hover:scale-105 transition-transform">
                    {icon}
                  </div>
                  <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-800 border border-slate-700 text-slate-300">
                    [{def.hotkey}]
                  </span>
                </div>

                <div>
                  <div className="font-bold text-[11px] text-slate-100 group-hover:text-amber-300 transition-colors truncate">
                    {def.name}
                  </div>
                  <div className="text-[9px] text-slate-400 line-clamp-1 mt-0.5">
                    {def.benefit}
                  </div>
                </div>

                <div className="mt-1.5 pt-1 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
                  <div className="flex items-center gap-1">
                    {(['wood', 'food', 'gold', 'stone', 'planks'] as const)
                      .filter((key) => (def.cost[key] || 0) > 0)
                      .map((key) => {
                        const owned = (myResources[key] || 0) >= (def.cost[key] || 0);
                        return (
                          <span key={key} className={owned ? COST_CHIP_CLASS[key] : 'text-red-400 font-bold'}>
                            {COST_SHORT[key]} {def.cost[key]}
                          </span>
                        );
                      })}
                  </div>
                  <span className="text-slate-500 text-[9px]">{def.buildTimeSeconds}s</span>
                </div>

                {!affordable && (
                  <div className="text-[9px] text-red-400 font-medium mt-0.5 truncate">
                    {missingCost(myResources, def.cost, 'short')}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none font-sans text-white">
      {/* 3D WebGL Canvas Viewport */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-crosshair"
        onMouseDown={handleCanvasMouseDown}
        onContextMenu={handleContextMenu}
      />

      {/* MARQUEE DRAG-SELECTION BOX */}
      {marqueeBox && Math.hypot(marqueeBox.currentX - marqueeBox.startX, marqueeBox.currentY - marqueeBox.startY) > 5 && (
        <div
          className="fixed pointer-events-none z-30 border border-emerald-400/90 bg-emerald-500/15 shadow-[0_0_12px_rgba(52,211,153,0.25)] rounded-[2px]"
          style={{
            left: Math.min(marqueeBox.startX, marqueeBox.currentX),
            top: Math.min(marqueeBox.startY, marqueeBox.currentY),
            width: Math.abs(marqueeBox.currentX - marqueeBox.startX),
            height: Math.abs(marqueeBox.currentY - marqueeBox.startY),
          }}
        >
          {/* Authentic RTS Corner Accents */}
          <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t-2 border-l-2 border-emerald-300" />
          <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t-2 border-r-2 border-emerald-300" />
          <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b-2 border-l-2 border-emerald-300" />
          <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b-2 border-r-2 border-emerald-300" />
        </div>
      )}

      {/* TOP HOVER TRIGGER ZONE FOR PEEKING WHEN HUD IS HIDDEN */}
      <div
        className="absolute top-0 left-0 right-0 h-4 z-30 pointer-events-auto"
        onMouseEnter={() => { if (!isHudPreviewMode) setIsHoverPeeking(true); }}
      />

      <GameHeader
        hudMode={hudMode}
        setHudMode={setHudMode}
        isHoverPeeking={isHoverPeeking}
        setIsHoverPeeking={setIsHoverPeeking}
        isCameraAutoMoveLocked={isCameraAutoMoveLocked}
        toggleCameraLock={toggleCameraLock}
        toggleHudMode={toggleHudMode}
        myResources={myResources}
        activeGatherers={activeGatherers}
        idleFriendlyVillagersCount={idleFriendlyVillagersCount}
        handleSelectIdleVillager={handleSelectIdleVillager}
        setIsEmpireCatalogOpen={setIsEmpireCatalogOpen}
        handleJumpToResource={handleJumpToResource}
        setBuildMode={setBuildMode}
        triggerNotification={triggerNotification}
        role={role}
        handleRegenerateProceduralMap={handleRegenerateProceduralMap}
        isColonySustainableForestry={isColonySustainableForestry}
        handleToggleColonySustainableForestry={handleToggleColonySustainableForestry}
        activeWorkZones={activeWorkZones}
        isWorkZoneModalOpen={isWorkZoneModalOpen}
        setIsWorkZoneModalOpen={setIsWorkZoneModalOpen}
        gatherRadiusLimit={gatherRadiusLimit}
        setShowControlsModal={setShowControlsModal}
        isAudioMuted={isAudioMuted}
        setIsAudioMuted={setIsAudioMuted}
        isChatOpen={isChatOpen}
        setIsChatOpen={setIsChatOpen}
        chatMessages={chatMessages}
        onPointerEnterUI={() => engineRef.current?.setIsPointerOverUI(true)}
        onPointerLeaveUI={() => engineRef.current?.setIsPointerOverUI(false)}
        isHudPreviewMode={isHudPreviewMode}
        isTechPanelOpen={isTechPanelOpen}
        setIsTechPanelOpen={setIsTechPanelOpen}
        currentEra={gameState.techs?.[playerSlot]?.era}
      />

      {/* BUILDING PLACEMENT BANNER & REAL-TIME FOOTPRINT HUD */}
      {isHudVisible && buildMode && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-slate-950/90 backdrop-blur-md border border-slate-700/80 px-5 py-3 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-center gap-3.5 pointer-events-auto z-20">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${buildPreviewInfo?.isValid !== false ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
              <Hammer className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>Construindo: <span className="text-amber-400">{BUILDING_CATALOG[buildMode]?.name || 'Edifício'}</span></span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                  {buildPreviewInfo ? `${buildPreviewInfo.width}m × ${buildPreviewInfo.depth}m` : `${BUILDING_CATALOG[buildMode]?.footprintWidth}m × ${BUILDING_CATALOG[buildMode]?.footprintDepth}m`}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                <span>Custo: <span className="text-amber-400 font-semibold">{describeCost(BUILDING_CATALOG[buildMode]?.cost ?? {})}</span></span>
                {buildPreviewInfo && (
                  <>
                    <span>•</span>
                    <span className="font-mono text-slate-400">Posição: X:{buildPreviewInfo.x} Z:{buildPreviewInfo.z}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {buildPreviewInfo ? (
              buildPreviewInfo.isValid ? (
                <div className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 shadow-inner">
                  <Check className="w-3.5 h-3.5" /> Local Livre
                </div>
              ) : (
                <div className="px-3 py-1.5 rounded-xl bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-bold flex items-center gap-1.5 shadow-inner">
                  <AlertCircle className="w-3.5 h-3.5" /> {buildPreviewInfo.reason || 'Obstruído'}
                </div>
              )
            ) : (
              <div className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 text-xs font-medium">
                Posicione no mapa
              </div>
            )}

            <button
              type="button"
              onClick={() => setBuildMode(null)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium border border-slate-700 transition-colors"
            >
              Cancelar (ESC)
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM COMMAND DOCK / SELECTION PANEL */}
      {isHudVisible && (
      <footer
        onMouseEnter={() => engineRef.current?.setIsPointerOverUI(true)}
        onMouseLeave={() => engineRef.current?.setIsPointerOverUI(false)}
        className="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 right-2 sm:right-4 flex flex-col sm:flex-row items-end justify-between gap-3 pointer-events-none z-20"
      >
        {/* Interactive Mini-Map with Fog of War */}
        <div className="pointer-events-auto">
          <Minimap
            engine={engineRef.current}
            gameState={gameState}
            playerSlot={playerSlot}
            selectedEntityId={selectedEntity?.id ?? null}
            workZones={activeWorkZones}
            onOrderMove={handleMinimapOrderMove}
            isCameraLocked={isCameraAutoMoveLocked}
            onToggleCameraLock={toggleCameraLock}
            isCollapsed={isMinimapCollapsed}
            onToggleCollapse={() => setIsMinimapCollapsed((prev) => !prev)}
          />
        </div>

        <SelectionPanel
          gameState={gameState}
          playerSlot={playerSlot}
          role={role}
          selectedEntity={selectedEntity}
          selectedUnitsList={selectedUnitsList}
          selectedUnitIds={selectedUnitIds}
          selectedUnit={selectedUnit}
          selectedBuilding={selectedBuilding}
          selectedResource={selectedResource}
          soldierCount={soldierCount}
          villagerCount={villagerCount}
          totalSquadHealth={totalSquadHealth}
          totalSquadMaxHealth={totalSquadMaxHealth}
          activeBuildersOnSelectedBuilding={activeBuildersOnSelectedBuilding}
          activeGatherersOnSelectedResource={activeGatherersOnSelectedResource}
          idleFriendlyVillagersCount={idleFriendlyVillagersCount}
          totalQueuedForPlayer={totalQueuedForPlayer}
          myResources={myResources}
          groveTrees={groveTrees}
          matureGroveCount={matureGroveCount}
          regrowingGroveCount={regrowingGroveCount}
          isGroveAllSustainable={isGroveAllSustainable}
          activeWorkZones={activeWorkZones}
          previewZone={previewZone}
          isBottomCardCollapsed={isBottomCardCollapsed}
          setIsBottomCardCollapsed={setIsBottomCardCollapsed}
          setSelectedEntity={setSelectedEntity}
          setSelectedUnitIds={setSelectedUnitIds}
          squadFormation={squadFormation}
          setSquadFormation={setSquadFormation}
          gatherRadiusLimit={gatherRadiusLimit}
          setGatherRadiusLimit={setGatherRadiusLimit}
          gatherShiftDuration={gatherShiftDuration}
          setGatherShiftDuration={setGatherShiftDuration}
          isSettingZoneCenter={isSettingZoneCenter}
          setIsSettingZoneCenter={setIsSettingZoneCenter}
          setIsEmpireCatalogOpen={setIsEmpireCatalogOpen}
          setIsPointerOverUI={(value) => engineRef.current?.setIsPointerOverUI(value)}
          handleIncomingCommand={handleIncomingCommand}
          handleSetUnitWorkZoneRadius={handleSetUnitWorkZoneRadius}
          handleSendAllIdleVillagersToBuild={handleSendAllIdleVillagersToBuild}
          handleTrainUnit={handleTrainUnit}
          handleCancelTrain={handleCancelTrain}
          handleTradeResource={handleTradeResource}
          handleSetGroveHarvestMode={handleSetGroveHarvestMode}
          handleToggleResourceHarvestMode={handleToggleResourceHarvestMode}
          handleClearForestCluster={handleClearForestCluster}
          handleAssignVillagersToResource={handleAssignVillagersToResource}
          handleAssignSelectedSquadToResource={handleAssignSelectedSquadToResource}
          handleRemoveResourceImmediately={handleRemoveResourceImmediately}
          renderVillagerBuildCatalog={renderVillagerBuildCatalog}
          nearestVillagerToSelectedBuilding={nearestVillagerToSelectedBuilding}
          handleRepairBuilding={handleRepairBuilding}
          handleDemolishBuilding={handleDemolishBuilding}
          triggerNotification={triggerNotification}
          multiRef={multiRef}
          onPointerEnterUI={() => engineRef.current?.setIsPointerOverUI(true)}
          onPointerLeaveUI={() => engineRef.current?.setIsPointerOverUI(false)}
        />
      </footer>
      )}

      <GameDialogs
        isHudVisible={isHudVisible}
        isChatOpen={isChatOpen}
        setIsChatOpen={setIsChatOpen}
        chatMessages={chatMessages}
        currentChatInput={currentChatInput}
        setCurrentChatInput={setCurrentChatInput}
        onSendChat={handleSendChat}
        onOpenTutorial={() => setShowTutorial(true)}
        showControlsModal={showControlsModal}
        setShowControlsModal={setShowControlsModal}
        isWorkZoneModalOpen={isWorkZoneModalOpen}
        setIsWorkZoneModalOpen={setIsWorkZoneModalOpen}
        gatherRadiusLimit={gatherRadiusLimit}
        setGatherRadiusLimit={setGatherRadiusLimit}
        showWorkZones3D={showWorkZones3D}
        setShowWorkZones3D={setShowWorkZones3D}
        isStrictZoneLeash={isStrictZoneLeash}
        setIsStrictZoneLeash={setIsStrictZoneLeash}
        onApplyRadiusToAllWorkingVillagers={handleApplyRadiusToAllWorkingVillagers}
        activeWorkZones={activeWorkZones}
        onFocusZone={(x, z) => engineRef.current?.setCameraTarget(x, z)}
        onPointerEnterUI={() => engineRef.current?.setIsPointerOverUI(true)}
        onPointerLeaveUI={() => engineRef.current?.setIsPointerOverUI(false)}
        notification={notification}
      />

      {/* TUTORIAL DE PRIMEIRA PARTICIDA */}
      {showTutorial && <Tutorial onClose={closeTutorial} />}

      {/* TECH PANEL MODAL */}
      {isTechPanelOpen && (
        <TechPanel
          techState={gameState.techs?.[playerSlot] ?? createTechState()}
          resources={myResources}
          onResearch={handleResearch}
          onClose={() => {
            setIsTechPanelOpen(false);
            soundManager.playClickSound();
          }}
        />
      )}

      {/* EMPIRE CATALOG & PRODUCTION MATRIX MODAL (Ikariam & AoE style) */}
      <EmpireCatalogModal
        isOpen={isEmpireCatalogOpen}
        onClose={() => setIsEmpireCatalogOpen(false)}
        playerResources={myResources}
        onTradeResource={handleTradeResource}
        onSelectBuildingToBuild={(type) => {
          setIsEmpireCatalogOpen(false);
          setBuildMode(type);
          soundManager.playClickSound();
          triggerNotification(`Modo de Construção: ${BUILDING_CATALOG[type]?.name || type}. Posicione no mapa.`, 'info');
        }}
        activeGatherersCount={activeGatherers}
      />

      {/* MATCH RESULT SCREEN (vitoria / derrota / empate) */}
      {showResultScreen && !isHudPreviewMode && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto">
          <div className="bg-slate-900/95 border border-slate-700/80 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-5 text-center">
            <div className={`text-4xl font-black tracking-wide ${resultToneClass}`}>{resultLabel}</div>
            <p className="text-sm text-slate-400">{resultDetail}</p>
            <div className="flex flex-col gap-2 pt-1">
              {(role === 'host' || role === 'single') && (
                <button
                  type="button"
                  onClick={() => {
                    setupInitialMap();
                    soundManager.playClickSound();
                  }}
                  className="p-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors"
                >
                  Jogar Novamente
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsGameStarted(false)}
                className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition-colors"
              >
                Voltar ao Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
