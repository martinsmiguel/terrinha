/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GameEngine, GameState, PlayerResources, Unit, Building, ResourceNode, MAP_SIZE, UnitType } from './game/engine';
import { findPath, nextWaypoint } from './game/movement/pathfinding';
import { resolveSeparation } from './game/movement/separation';
import { createVisionGrid, expireVision, revealVision, visionRadiusFor, isVisibleAt } from './game/visibility';
import { MultiplayerManager, ChatMessage } from './game/multiplayer';
import { Minimap } from './components/Minimap';
import { TechPanel } from './components/TechPanel';
import { soundManager } from './game/audio';
import { create3DHealthBar, update3DHealthBar, align3DHealthBarToCamera } from './game/healthBar';
import { createBuildingGhost, updateBuildingGhost, checkBuildingPlacementValid } from './game/buildingGhost';
import { BUILDING_CATALOG, BuildingType, createConstructionScaffold } from './game/buildingDefs';
import { generateProceduralTerrain, ProceduralMapResult } from './game/proceduralMap';
import { EmpireCatalogModal } from './components/EmpireCatalogModal';
import { ResourceNavMenu } from './components/ResourceNavMenu';
import {
  Users,
  Hammer,
  Sword,
  Play,
  Shield,
  Copy,
  Check,
  Wifi,
  MessageSquare,
  Send,
  Home,
  Target,
  Sparkles,
  Info,
  Maximize2,
  Volume2,
  VolumeX,
  LayoutGrid,
  AlignJustify,
  AlertCircle,
  Eye,
  EyeOff,
  Castle,
  Compass,
  TreePine,
  Sprout,
  Pickaxe,
  Trash2,
  Wrench,
  X,
  Coins,
  Apple,
  Plus,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
  Layers,
  PawPrint,
} from 'lucide-react';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import { createWorkZoneMesh, updateWorkZoneMesh } from './game/workZone';
import { applyPopDelta, countDeathsByOwner } from './game/population';
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
  refinePlanks,
  tradeResource,
  UNIT_COSTS,
  halfCost,
} from './game/economy';
import { PLAYER_SLOTS, isAuthorizedPlayerCommand, isPlayerSlot, isValidNetworkCommand, soloMatchSlots, type PlayerSlot } from './game/networkCommands';
import { evaluateMatch, localOutcome, type LocalOutcome } from './game/victory';
import {
  TECH_DEFS,
  advanceResearch,
  createTechState,
  gatherMultiplier,
  researchTarget,
  startResearch,
  unitDamageMultiplier,
  type TechState,
} from './game/tech';

/** Reparo: HP por tick (50 ms) e madeira consumida por HP reparado. */
const REPAIR_HP_PER_TICK = 4;
const REPAIR_WOOD_PER_HP = 0.05;
/** Distancia maxima em que o aldeao consegue consertar o edificio. */
const REPAIR_REACH = 2.2;

const FACTION_COLORS: Record<string, { name: string; hex: number; colorClass: string; border: string }> = {
  player1: { name: 'Império Português (Azul)', hex: 0x2563eb, colorClass: 'bg-blue-600', border: 'border-blue-500' },
  player2: { name: 'Império Espanhol (Vermelho)', hex: 0xdc2626, colorClass: 'bg-red-600', border: 'border-red-500' },
  player3: { name: 'Império Britânico (Verde)', hex: 0x16a34a, colorClass: 'bg-green-600', border: 'border-green-500' },
  player4: { name: 'Império Francês (Amarelo)', hex: 0xca8a04, colorClass: 'bg-yellow-600', border: 'border-yellow-500' },
};

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const multiRef = useRef<MultiplayerManager | null>(null);

  // Menu / Lobby state
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [role, setRole] = useState<'host' | 'client' | 'single'>('host');
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
  const [hudMode, setHudMode] = useState<'full' | 'compact' | 'hidden'>('full');
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
        const isBoat = unit.type === 'fishing_boat' || unit.type === 'trade_boat';
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

  // Initial map setup with Procedural Terrain, River, Valleys, Town Centers, Resources & Villagers
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
    });
  };

  // Regenerate Procedural Map with a fresh seed (meandering river, valleys, fish shoals)
  const handleRegenerateProceduralMap = () => {
    const newSeed = Math.floor(Math.random() * 999999);
    const procMap = generateProceduralTerrain(MAP_SIZE, newSeed);
    proceduralMapRef.current = procMap;
    if (engineRef.current) {
      engineRef.current.setProceduralTerrainMesh(
        procMap.terrainMesh,
        procMap.waterMesh,
        procMap.riverBankDecorations
      );
    }
    setGameState((prev) => ({
      ...prev,
      resourceNodes: procMap.resourceNodes,
    }));
    soundManager.playClickSound();
    triggerNotification(`Novo mapa procedural gerado! Rio meandro, vales férteis e cardumes renovados (Semente: ${newSeed}).`, 'success');
  };

  // Synchronize 3D Scene Objects with Simulation State
  useEffect(() => {
    if (!engineRef.current) return;
    const { scene } = engineRef.current;

    // 1. Sync Resource Nodes
    const currentResourceIds = new Set(gameState.resourceNodes.map((n) => n.id));
    resourceMeshes.current.forEach((mesh, id) => {
      if (!currentResourceIds.has(id)) {
        scene.remove(mesh);
        resourceMeshes.current.delete(id);
      }
    });

    gameState.resourceNodes.forEach((node) => {
      let group = resourceMeshes.current.get(node.id);
      const isSelected = selectedEntity?.id === node.id;

      if (!group) {
        group = new THREE.Group();
        const nodeY =
          node.type === 'fish_school'
            ? 0.02
            : proceduralMapRef.current
            ? proceduralMapRef.current.getHeightAt(node.position.x, node.position.z)
            : 0;
        group.position.set(node.position.x, nodeY, node.position.z);

        // Accurate hit collider avoiding overlap between adjacent grove trees
        const isMineral = node.type === 'gold_mine' || node.type === 'stone';
        const hitRadius = node.type === 'tree' ? 1.25 : isMineral ? 1.5 : 1.1;
        const hitHeight = node.type === 'tree' ? 4.8 : isMineral ? 2.8 : 2.0;
        const hitGeo = new THREE.CylinderGeometry(hitRadius, hitRadius, hitHeight, 10);
        const hitMat = new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
        const hitMesh = new THREE.Mesh(hitGeo, hitMat);
        hitMesh.position.y = hitHeight / 2;
        hitMesh.name = 'hit_collider';
        group.add(hitMesh);

        // 3D Selection Ring on ground
        const ringGeo = new THREE.RingGeometry(1.3, 1.5, 24);
        const ringMat = new THREE.MeshBasicMaterial({
          color:
            node.type === 'tree'
              ? 0x22c55e
              : node.type === 'gold_mine'
              ? 0xfacc15
              : node.type === 'stone'
              ? 0x94a3b8
              : 0xf43f5e,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.04;
        ring.name = 'selection_ring';
        group.add(ring);

        if (node.type === 'tree') {
          // A. Mature Tree Model Group
          const matureGroup = new THREE.Group();
          matureGroup.name = 'mature_model';

          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.25, 1.2, 6),
            new THREE.MeshStandardMaterial({ color: 0x5c4033 })
          );
          trunk.position.y = 0.6;
          trunk.castShadow = true;
          matureGroup.add(trunk);

          const leaves1 = new THREE.Mesh(
            new THREE.ConeGeometry(1.1, 1.5, 6),
            new THREE.MeshStandardMaterial({ color: 0x2e6f40, roughness: 0.8 })
          );
          leaves1.position.y = 1.8;
          leaves1.castShadow = true;
          matureGroup.add(leaves1);

          const leaves2 = new THREE.ConeGeometry(0.8, 1.3, 6);
          const leavesMesh2 = new THREE.Mesh(leaves2, leaves1.material);
          leavesMesh2.position.y = 2.6;
          leavesMesh2.castShadow = true;
          matureGroup.add(leavesMesh2);

          group.add(matureGroup);

          // B. Young Sapling / Sprout Model Group (shown when regrowing after sustainable harvest)
          const saplingGroup = new THREE.Group();
          saplingGroup.name = 'sapling_model';

          const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.08, 0.45, 5),
            new THREE.MeshStandardMaterial({ color: 0x854d0e })
          );
          stem.position.y = 0.22;
          stem.castShadow = true;
          saplingGroup.add(stem);

          const foliage = new THREE.Mesh(
            new THREE.SphereGeometry(0.35, 6, 6),
            new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.65 })
          );
          foliage.position.y = 0.55;
          foliage.castShadow = true;
          saplingGroup.add(foliage);

          saplingGroup.visible = false;
          group.add(saplingGroup);
        } else if (node.type === 'gold_mine') {
          // Gold rock cluster
          const rockGeo = new THREE.DodecahedronGeometry(0.9, 1);
          const rockMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.65, roughness: 0.3 });
          const rock = new THREE.Mesh(rockGeo, rockMat);
          rock.position.y = 0.55;
          rock.castShadow = true;
          group.add(rock);

          const smallRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.48, 0), rockMat);
          smallRock.position.set(0.65, 0.3, 0.45);
          group.add(smallRock);

          const miniRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), rockMat);
          miniRock.position.set(-0.55, 0.2, -0.4);
          group.add(miniRock);
        } else if (node.type === 'stone') {
          // Grey granite quarry outcrop
          const rockGeo = new THREE.DodecahedronGeometry(0.9, 1);
          const rockMat = new THREE.MeshStandardMaterial({ color: 0x8f9aa8, metalness: 0.15, roughness: 0.85 });
          const rock = new THREE.Mesh(rockGeo, rockMat);
          rock.position.y = 0.55;
          rock.castShadow = true;
          group.add(rock);

          const smallRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), rockMat);
          smallRock.position.set(0.6, 0.28, 0.5);
          smallRock.rotation.set(0.4, 0.8, 0.2);
          group.add(smallRock);

          const miniRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), rockMat);
          miniRock.position.set(-0.6, 0.22, -0.35);
          group.add(miniRock);

          const pebbleMat = new THREE.MeshStandardMaterial({ color: 0xb6bec8, roughness: 0.95 });
          const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), pebbleMat);
          pebble.position.set(0.15, 0.1, -0.7);
          group.add(pebble);
        } else if (node.type === 'fish_school') {
          // Fish School in river / water
          const fishGroup = new THREE.Group();
          fishGroup.name = 'fish_school_model';

          const ripple = new THREE.Mesh(
            new THREE.RingGeometry(0.65, 1.05, 16),
            new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
          );
          ripple.rotation.x = -Math.PI / 2;
          ripple.position.y = 0.05;
          ripple.name = 'fish_ripple';
          fishGroup.add(ripple);

          for (let f = 0; f < 4; f++) {
            const angle = (f / 4) * Math.PI * 2;
            const fish = new THREE.Mesh(
              new THREE.ConeGeometry(0.08, 0.38, 4),
              new THREE.MeshStandardMaterial({ color: 0x93c5fd, metalness: 0.8, roughness: 0.2 })
            );
            fish.position.set(Math.cos(angle) * 0.6, 0.05, Math.sin(angle) * 0.6);
            fish.rotation.y = angle + Math.PI / 2;
            fish.name = `fish_${f}`;
            fishGroup.add(fish);
          }
          group.add(fishGroup);
        } else {
          // Berry Bush
          const bush = new THREE.Mesh(
            new THREE.SphereGeometry(0.65, 6, 6),
            new THREE.MeshStandardMaterial({ color: 0xa83250 })
          );
          bush.position.y = 0.45;
          bush.castShadow = true;
          group.add(bush);
        }

        scene.add(group);
        resourceMeshes.current.set(node.id, group);
      }

      // Rotate swimming fish in fish_school
      if (node.type === 'fish_school') {
        const fishModel = group.getObjectByName('fish_school_model');
        if (fishModel) {
          fishModel.rotation.y = performance.now() * 0.0015;
          const ripple = fishModel.getObjectByName('fish_ripple') as THREE.Mesh;
          if (ripple && ripple.material instanceof THREE.MeshBasicMaterial) {
            ripple.material.opacity = 0.5 + Math.sin(performance.now() * 0.004) * 0.2;
          }
        }
      }

      // Update selection ring opacity and companion grove highlighting
      const ring = group.getObjectByName('selection_ring') as THREE.Mesh;
      if (ring && ring.material instanceof THREE.MeshBasicMaterial) {
        if (isSelected) {
          ring.material.opacity = 0.95;
          ring.scale.set(1.15, 1.15, 1.15);
        } else if (
          selectedEntity?.kind === 'resource' &&
          selectedResource?.type === 'tree' &&
          node.type === 'tree' &&
          ((selectedResource.clusterId && node.clusterId === selectedResource.clusterId) ||
            Math.hypot(node.position.x - selectedResource.position.x, node.position.z - selectedResource.position.z) <= 12)
        ) {
          ring.material.opacity = 0.38;
          ring.scale.set(0.9, 0.9, 0.9);
        } else {
          ring.material.opacity = 0;
          ring.scale.set(1, 1, 1);
        }
      }

      // Update tree growth visuals
      if (node.type === 'tree') {
        const mature = group.getObjectByName('mature_model');
        const sapling = group.getObjectByName('sapling_model');
        if (mature && sapling) {
          if (node.isRegrowing) {
            mature.visible = false;
            sapling.visible = true;
            const progress = (node.regrowthProgress || 0) / 100;
            const s = 0.35 + 0.65 * progress;
            sapling.scale.set(s, s, s);
          } else {
            mature.visible = true;
            sapling.visible = false;
          }
        }
      }

      // Maintain node elevation on terrain surface
      const nodeY =
        node.type === 'fish_school'
          ? 0.02
          : proceduralMapRef.current
          ? proceduralMapRef.current.getHeightAt(node.position.x, node.position.z)
          : 0;
      group.position.y = nodeY;
    });

    // 2. Sync Units
    const currentUnitIds = new Set(gameState.units.map((u) => u.id));
    unitMeshes.current.forEach((mesh, id) => {
      if (!currentUnitIds.has(id)) {
        scene.remove(mesh);
        unitMeshes.current.delete(id);
      }
    });

    gameState.units.forEach((unit) => {
      let group = unitMeshes.current.get(unit.id);
      const isSelected = selectedUnitIds.includes(unit.id) || selectedEntity?.id === unit.id;
      const ownerColor = FACTION_COLORS[unit.owner]?.hex ?? 0x3b82f6;

      if (!group) {
        group = new THREE.Group();

        // Selection ring
        const ringGeo = new THREE.RingGeometry(0.55, 0.7, 16);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x22c55e,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.04;
        ring.name = 'selection_ring';
        group.add(ring);

        // Character Model
        if (unit.type === 'soldier') {
          // Musket Soldier with Tricorn Hat
          const body = new THREE.Mesh(
            new THREE.CylinderGeometry(0.25, 0.3, 1.1, 8),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          body.position.y = 0.55;
          body.castShadow = true;
          group.add(body);

          const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0xffdbac })
          );
          head.position.y = 1.25;
          group.add(head);

          const hat = new THREE.Mesh(
            new THREE.CylinderGeometry(0.35, 0.35, 0.15, 3),
            new THREE.MeshStandardMaterial({ color: 0x1f2937 })
          );
          hat.position.y = 1.4;
          group.add(hat);

          // Musket
          const musket = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6),
            new THREE.MeshStandardMaterial({ color: 0x4a2e18 })
          );
          musket.position.set(0.28, 0.7, 0.1);
          musket.rotation.z = -0.3;
          group.add(musket);
        } else if (unit.type === 'cavalry') {
          // Cavalaria montada: cavalo + cavaleiro
          const horseBody = new THREE.Mesh(
            new THREE.BoxGeometry(0.45, 0.5, 1.3),
            new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.85 })
          );
          horseBody.position.y = 0.75;
          horseBody.castShadow = true;
          group.add(horseBody);

          const horseHead = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.42, 0.5),
            new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.85 })
          );
          horseHead.position.set(0, 1.0, -0.78);
          group.add(horseHead);

          const legGeometry = new THREE.CylinderGeometry(0.07, 0.07, 0.55, 6);
          const legMaterial = new THREE.MeshStandardMaterial({ color: 0x4a2e18 });
          const legSpots: [number, number][] = [[0.16, 0.45], [-0.16, 0.45], [0.16, -0.45], [-0.16, -0.45]];
          const unitGroup = group;
          legSpots.forEach(([legX, legZ]) => {
            const leg = new THREE.Mesh(legGeometry, legMaterial);
            leg.position.set(legX, 0.27, legZ);
            unitGroup.add(leg);
          });

          const rider = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.25, 0.7, 8),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          rider.position.y = 1.35;
          rider.castShadow = true;
          group.add(rider);

          const riderHead = new THREE.Mesh(
            new THREE.SphereGeometry(0.17, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0xffdbac })
          );
          riderHead.position.y = 1.85;
          group.add(riderHead);

          const helmet = new THREE.Mesh(
            new THREE.ConeGeometry(0.16, 0.3, 6),
            new THREE.MeshStandardMaterial({ color: 0x1f2937 })
          );
          helmet.position.y = 2.08;
          group.add(helmet);
        } else if (unit.type === 'fishing_boat') {
          // Barco de Pesca (Wooden skiff with triangular sail)
          const hull = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.35, 1.6),
            new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.7 })
          );
          hull.position.y = 0.12;
          hull.castShadow = true;
          group.add(hull);

          const mast = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 1.3, 4),
            new THREE.MeshStandardMaterial({ color: 0xd4d4d8 })
          );
          mast.position.set(0, 0.75, 0.1);
          group.add(mast);

          const sail = new THREE.Mesh(
            new THREE.ConeGeometry(0.45, 0.85, 3),
            new THREE.MeshStandardMaterial({ color: ownerColor, roughness: 0.5 })
          );
          sail.position.set(0.18, 0.8, 0.05);
          sail.rotation.z = Math.PI / 8;
          group.add(sail);
        } else if (unit.type === 'trade_boat') {
          // Barco Mercante (Merchant trade vessel with dual sails and cargo)
          const hull = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 0.45, 2.0),
            new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.6 })
          );
          hull.position.y = 0.16;
          hull.castShadow = true;
          group.add(hull);

          const mast = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 1.8, 4),
            new THREE.MeshStandardMaterial({ color: 0x78350f })
          );
          mast.position.set(0, 0.95, 0.1);
          group.add(mast);

          const sail = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.7, 0.04),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          sail.position.set(0, 1.1, 0.15);
          group.add(sail);

          const crate = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.3, 0.4),
            new THREE.MeshStandardMaterial({ color: 0xb45309 })
          );
          crate.position.set(0, 0.45, -0.4);
          group.add(crate);
        } else {
          // Villager
          const body = new THREE.Mesh(
            new THREE.CylinderGeometry(0.24, 0.28, 0.95, 8),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          body.position.y = 0.48;
          body.castShadow = true;
          group.add(body);

          const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0xffdbac })
          );
          head.position.y = 1.08;
          group.add(head);

          // Straw Hat
          const hat = new THREE.Mesh(
            new THREE.ConeGeometry(0.38, 0.2, 8),
            new THREE.MeshStandardMaterial({ color: 0xd97706 })
          );
          hat.position.y = 1.22;
          group.add(hat);
        }

        // Floating 3D Health Bar (only visible when selected or damaged)
        const isBoat = unit.type === 'fishing_boat' || unit.type === 'trade_boat';
        const healthBar = create3DHealthBar({
          width: isBoat ? 1.2 : unit.type === 'cavalry' ? 1.2 : unit.type === 'soldier' ? 1.0 : 0.9,
          height: unit.type === 'soldier' || unit.type === 'cavalry' ? 0.13 : 0.12,
          ownerColor,
          yOffset: isBoat ? 1.9 : unit.type === 'cavalry' ? 2.4 : unit.type === 'soldier' ? 1.75 : 1.55,
        });
        group.add(healthBar);

        scene.add(group);
        unitMeshes.current.set(unit.id, group);
      }

      // Update position according to terrain elevation
      const isBoat = unit.type === 'fishing_boat' || unit.type === 'trade_boat';
      const unitY = isBoat
        ? 0.02
        : proceduralMapRef.current
        ? proceduralMapRef.current.getHeightAt(unit.position.x, unit.position.z)
        : 0;
      group.position.set(unit.position.x, unitY, unit.position.z);

      // Update selection indicator visibility
      const ring = group.getObjectByName('selection_ring') as THREE.Mesh;
      if (ring && ring.material instanceof THREE.MeshBasicMaterial) {
        ring.material.opacity = isSelected ? 0.9 : 0;
      }

      // Update 3D Health Bar visibility and fill
      const healthBar = group.getObjectByName('health_bar_container') as THREE.Group;
      if (healthBar) {
        update3DHealthBar(healthBar, unit.health, unit.maxHealth, isSelected);
      }

      // Nevoa: inimigos fora da visao atual nao aparecem na cena
      group.visible =
        unit.owner === playerSlot ||
        isVisibleAt(visionGridRef.current, Math.floor(unit.position.x), Math.floor(unit.position.z));
    });

    // 3. Sync Buildings
    const currentBuildingIds = new Set(gameState.buildings.map((b) => b.id));
    buildingMeshes.current.forEach((mesh, id) => {
      if (!currentBuildingIds.has(id)) {
        scene.remove(mesh);
        buildingMeshes.current.delete(id);
      }
    });

    gameState.buildings.forEach((b) => {
      let group = buildingMeshes.current.get(b.id);
      const isSelected = selectedEntity?.id === b.id;
      const ownerColor = FACTION_COLORS[b.owner]?.hex ?? 0x2563eb;

      // Recreate mesh if construction completion status changed
      if (group && group.userData.isComplete !== b.isComplete) {
        scene.remove(group);
        buildingMeshes.current.delete(b.id);
        group = undefined;
      }

      if (!group) {
        group = new THREE.Group();
        const bGroundY = proceduralMapRef.current ? proceduralMapRef.current.getHeightAt(b.position.x, b.position.z) : 0;
        group.position.set(b.position.x, bGroundY, b.position.z);
        group.userData.isComplete = b.isComplete;

        // Selection ring
        const ringRadius = b.type === 'town_center' ? 3.2 : b.type === 'barracks' ? 2.6 : 2.1;
        const ringGeo = new THREE.RingGeometry(ringRadius, ringRadius + 0.2, 24);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x22c55e,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.05;
        ring.name = 'building_selection_ring';
        group.add(ring);

        // Universal heavy stone plinth foundation (anchors building deep into terrain so it never floats or sinks)
        const plinthMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.95 });

        if (!b.isComplete) {
          // In-progress construction site scaffolding
          const scaffold = createConstructionScaffold(b.type as BuildingType, ownerColor);
          group.add(scaffold);
        } else if (b.type === 'town_center') {
          // Town Center: Grand colonial structure
          const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.4, 4.0), plinthMat);
          plinth.position.y = -0.15;
          plinth.receiveShadow = true;
          group.add(plinth);

          const base = new THREE.Mesh(
            new THREE.BoxGeometry(3.6, 2.0, 3.6),
            new THREE.MeshStandardMaterial({ color: 0xddc9a3, roughness: 0.7 })
          );
          base.position.y = 1.0;
          base.castShadow = true;
          group.add(base);

          const roof = new THREE.Mesh(
            new THREE.ConeGeometry(2.8, 1.8, 4),
            new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5 })
          );
          roof.position.y = 2.9;
          roof.rotation.y = Math.PI / 4;
          roof.castShadow = true;
          group.add(roof);

          // Flagpole
          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 2.5),
            new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8 })
          );
          pole.position.set(0, 4.0, 0);
          group.add(pole);

          // Flag
          const flag = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.5, 0.04),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          flag.position.set(0.42, 4.9, 0);
          group.add(flag);
        } else if (b.type === 'house') {
          // Colonial House
          const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.35, 2.1), plinthMat);
          plinth.position.y = -0.15;
          plinth.receiveShadow = true;
          group.add(plinth);

          const base = new THREE.Mesh(
            new THREE.BoxGeometry(1.8, 1.2, 1.8),
            new THREE.MeshStandardMaterial({ color: 0xc4b59d })
          );
          base.position.y = 0.6;
          base.castShadow = true;
          group.add(base);

          const roof = new THREE.Mesh(
            new THREE.ConeGeometry(1.4, 0.9, 4),
            new THREE.MeshStandardMaterial({ color: 0xb45309 })
          );
          roof.position.y = 1.65;
          roof.rotation.y = Math.PI / 4;
          roof.castShadow = true;
          group.add(roof);
        } else if (b.type === 'barracks') {
          // Military Barracks
          const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.35, 2.7), plinthMat);
          plinth.position.y = -0.15;
          plinth.receiveShadow = true;
          group.add(plinth);

          const base = new THREE.Mesh(
            new THREE.BoxGeometry(2.8, 1.5, 2.4),
            new THREE.MeshStandardMaterial({ color: 0x78716c })
          );
          base.position.y = 0.75;
          base.castShadow = true;
          group.add(base);

          const roof = new THREE.Mesh(
            new THREE.BoxGeometry(3.0, 0.4, 2.6),
            new THREE.MeshStandardMaterial({ color: 0x475569 })
          );
          roof.position.y = 1.65;
          group.add(roof);

          const banner = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.8, 0.4),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          banner.position.set(1.45, 1.0, 0);
          group.add(banner);
        } else if (b.type === 'tower') {
          // Watchtower (Stone & Wood defense fort)
          const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.35, 0.45, 8), plinthMat);
          plinth.position.y = -0.15;
          plinth.receiveShadow = true;
          group.add(plinth);

          const stoneBase = new THREE.Mesh(
            new THREE.CylinderGeometry(0.8, 1.0, 3.0, 8),
            new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 })
          );
          stoneBase.position.y = 1.5;
          stoneBase.castShadow = true;
          group.add(stoneBase);

          const woodPlatform = new THREE.Mesh(
            new THREE.BoxGeometry(1.8, 0.5, 1.8),
            new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 })
          );
          woodPlatform.position.y = 3.25;
          group.add(woodPlatform);

          const roof = new THREE.Mesh(
            new THREE.ConeGeometry(1.3, 0.8, 4),
            new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.5 })
          );
          roof.position.y = 3.9;
          roof.rotation.y = Math.PI / 4;
          group.add(roof);

          const flag = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.25, 0.03),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          flag.position.set(0.2, 4.4, 0);
          group.add(flag);
        } else if (b.type === 'sawmill') {
          // Sawmill & Lumber Camp (Serralheria & Madeireira)
          const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.35, 2.3), plinthMat);
          plinth.position.y = -0.15;
          plinth.receiveShadow = true;
          group.add(plinth);

          const base = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 1.3, 2.0),
            new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.8 })
          );
          base.position.y = 0.65;
          base.castShadow = true;
          group.add(base);

          const roof = new THREE.Mesh(
            new THREE.ConeGeometry(1.6, 0.9, 4),
            new THREE.MeshStandardMaterial({ color: 0x713f12, roughness: 0.6 })
          );
          roof.position.y = 1.7;
          roof.rotation.y = Math.PI / 4;
          roof.castShadow = true;
          group.add(roof);

          // Water wheel / saw blade
          const wheel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.8, 0.8, 0.25, 8),
            new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.5 })
          );
          wheel.position.set(-1.3, 0.7, 0);
          wheel.rotation.z = Math.PI / 2;
          wheel.name = 'sawmill_wheel';
          group.add(wheel);

          // Pile of timber logs
          const log = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 1.2, 5),
            new THREE.MeshStandardMaterial({ color: 0x5c4033 })
          );
          log.position.set(0.6, 0.15, 1.1);
          log.rotation.z = Math.PI / 2;
          group.add(log);

          const flag = new THREE.Mesh(
            new THREE.BoxGeometry(0.35, 0.2, 0.03),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          flag.position.set(0, 2.3, 0);
          group.add(flag);
        } else if (b.type === 'mine') {
          // Mineradora & Pedreira (Stone/Gold extraction and smelting forge)
          const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.4, 2.5), plinthMat);
          plinth.position.y = -0.15;
          plinth.receiveShadow = true;
          group.add(plinth);

          const stoneBase = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 1.4, 2.2),
            new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 })
          );
          stoneBase.position.y = 0.7;
          stoneBase.castShadow = true;
          group.add(stoneBase);

          // Dark shaft entrance
          const entrance = new THREE.Mesh(
            new THREE.BoxGeometry(1.0, 1.0, 0.4),
            new THREE.MeshBasicMaterial({ color: 0x09090b })
          );
          entrance.position.set(0, 0.5, 1.0);
          group.add(entrance);

          // Timber headframe tower with hoist pulley
          const headframe = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 1.6, 0.8),
            new THREE.MeshStandardMaterial({ color: 0x78350f })
          );
          headframe.position.set(0.6, 1.8, -0.4);
          headframe.castShadow = true;
          group.add(headframe);

          const wheel = new THREE.Mesh(
            new THREE.TorusGeometry(0.3, 0.06, 6, 12),
            new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.7 })
          );
          wheel.position.set(0.6, 2.5, -0.4);
          group.add(wheel);
        } else if (b.type === 'market') {
          // Mercadão do Império (Grand commercial hub with awnings)
          const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.35, 2.9), plinthMat);
          plinth.position.y = -0.15;
          plinth.receiveShadow = true;
          group.add(plinth);

          const hall = new THREE.Mesh(
            new THREE.BoxGeometry(3.0, 1.4, 2.6),
            new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.6 })
          );
          hall.position.y = 0.7;
          hall.castShadow = true;
          group.add(hall);

          const tent = new THREE.Mesh(
            new THREE.ConeGeometry(2.0, 1.2, 4),
            new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4 })
          );
          tent.position.y = 1.9;
          tent.rotation.y = Math.PI / 4;
          tent.castShadow = true;
          group.add(tent);

          const banner = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 1.0, 0.5),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          banner.position.set(1.55, 1.0, 0);
          group.add(banner);
        } else if (b.type === 'farm') {
          // Fazenda & Granja (Cultivated wheat plot)
          const farmSoil = new THREE.Mesh(
            new THREE.BoxGeometry(2.8, 0.35, 2.8),
            new THREE.MeshStandardMaterial({ color: 0x582f0e, roughness: 0.95 })
          );
          farmSoil.position.y = -0.15;
          farmSoil.receiveShadow = true;
          group.add(farmSoil);

          const field = new THREE.Mesh(
            new THREE.BoxGeometry(2.6, 0.15, 2.6),
            new THREE.MeshStandardMaterial({ color: 0xca8a04, roughness: 0.95 })
          );
          field.position.y = 0.08;
          group.add(field);

          const shed = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 0.8, 0.9),
            new THREE.MeshStandardMaterial({ color: 0x854d0e })
          );
          shed.position.set(0.7, 0.45, 0.7);
          shed.castShadow = true;
          group.add(shed);

          const roof = new THREE.Mesh(
            new THREE.ConeGeometry(0.7, 0.5, 4),
            new THREE.MeshStandardMaterial({ color: 0xb45309 })
          );
          roof.position.set(0.7, 1.05, 0.7);
          roof.rotation.y = Math.PI / 4;
          group.add(roof);
        } else if (b.type === 'dock') {
          // Cais & Doca Naval (Waterfront wooden pier)
          const pier = new THREE.Mesh(
            new THREE.BoxGeometry(2.8, 0.35, 2.8),
            new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 })
          );
          pier.position.y = 0.18;
          pier.castShadow = true;
          group.add(pier);

          // Deep pilings extending firmly into water bed
          for (let px = -1.1; px <= 1.1; px += 2.2) {
            for (let pz = -1.1; pz <= 1.1; pz += 2.2) {
              const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, 1.4, 5),
                new THREE.MeshStandardMaterial({ color: 0x451a03 })
              );
              post.position.set(px, -0.2, pz);
              group.add(post);
            }
          }

          const hut = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 0.9, 1.1),
            new THREE.MeshStandardMaterial({ color: 0x9ca3af })
          );
          hut.position.set(0.65, 0.65, 0.65);
          hut.castShadow = true;
          group.add(hut);

          const flag = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.25, 0.03),
            new THREE.MeshStandardMaterial({ color: ownerColor })
          );
          flag.position.set(0.65, 1.3, 0.65);
          group.add(flag);
        }

        // Floating 3D Health Bar
        const barWidth =
          b.type === 'town_center'
            ? 3.2
            : b.type === 'barracks' || b.type === 'market'
            ? 2.5
            : b.type === 'tower' || b.type === 'dock' || b.type === 'mine'
            ? 2.0
            : 1.8;
        const barHeight = b.type === 'town_center' ? 0.28 : b.type === 'barracks' ? 0.22 : 0.18;
        const barY =
          b.type === 'town_center'
            ? 5.3
            : b.type === 'tower'
            ? 4.7
            : b.type === 'mine'
            ? 3.0
            : b.type === 'market'
            ? 2.6
            : 2.45;

        const healthBar = create3DHealthBar({
          width: barWidth,
          height: barHeight,
          ownerColor,
          yOffset: barY,
        });
        group.add(healthBar);

        scene.add(group);
        buildingMeshes.current.set(b.id, group);
      }

      // Update ring
      const ring = group.getObjectByName('building_selection_ring') as THREE.Mesh;
      if (ring && ring.material instanceof THREE.MeshBasicMaterial) {
        ring.material.opacity = isSelected ? 0.85 : 0;
      }

      // Update 3D Health Bar visibility, fill, and construction progress
      const healthBar = group.getObjectByName('health_bar_container') as THREE.Group;
      if (healthBar) {
        update3DHealthBar(
          healthBar,
          b.health,
          b.maxHealth,
          isSelected,
          !b.isComplete,
          b.buildProgress || 0
        );
      }

      // Update scaffold preview height as building is being constructed
      if (!b.isComplete) {
        const scaffold = group.getObjectByName('construction_scaffold') as THREE.Group;
        if (scaffold) {
          const preview = scaffold.getObjectByName('scaffold_preview') as THREE.Mesh;
          if (preview) {
            const progressRatio = Math.max(0.1, Math.min(1, (b.buildProgress || 0) / 100));
            preview.scale.y = progressRatio;
            const origH = b.type === 'tower' ? 1.2 : 0.8;
            preview.position.y = (origH * progressRatio) / 2;
          }
        }
      }

      // Maintain exact terrain elevation so buildings never sink or hover
      const bGroundY = proceduralMapRef.current ? proceduralMapRef.current.getHeightAt(b.position.x, b.position.z) : 0;
      group.position.y = bGroundY;

      // Nevoa: edificios inimigos fora da visao atual nao aparecem na cena
      group.visible =
        b.owner === playerSlot ||
        isVisibleAt(visionGridRef.current, Math.floor(b.position.x), Math.floor(b.position.z));
    });

    // Host broadcasts simulation state to connected clients in LAN
    if (role === 'host' && multiRef.current) {
      multiRef.current.broadcast(gameState);
    }
  }, [gameState, selectedEntity, selectedUnitIds, role]);

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

    const interval = setInterval(() => {
      setGameState((prev) => {
        // Partida encerrada: a simulacao nao avanca mais
        if (prev.match?.status === 'finished') return prev;

        let updatedUnits = [...prev.units];
        let updatedNodes = [...prev.resourceNodes];
        let updatedBuildings = [...prev.buildings];
        let updatedResources = { ...prev.playerResources };
        const updatedTechs: Record<string, TechState> = { ...(prev.techs ?? {}) };

        // 1. Process Units (Movement, Gathering, Attacking)
        updatedUnits = updatedUnits
          .map((unit) => {
            // A. Move to Target Position
            if (unit.targetPosition) {
              const goal = unit.targetPosition;
              const dx = goal.x - unit.position.x;
              const dz = goal.z - unit.position.z;
              const dist = Math.sqrt(dx * dx + dz * dz);

              if (dist < 0.25) {
                unitPathsRef.current.delete(unit.id);
                return { ...unit, targetPosition: null, state: 'idle' as const };
              }

              const speed = unit.type === 'soldier' ? 0.2 : unit.type === 'cavalry' ? 0.3 : 0.16;
              const isBoat = unit.type === 'fishing_boat' || unit.type === 'trade_boat';
              const pMap = proceduralMapRef.current;

              // A* no grid: cliffs/agua bloqueiam o caminho (cacheado por alvo)
              const cached = unitPathsRef.current.get(unit.id);
              if (!cached || cached.goal.x !== goal.x || cached.goal.z !== goal.z) {
                const isBlocked = pMap
                  ? isBoat
                    ? (x: number, z: number) => !pMap.isWaterAt(x, z)
                    : (x: number, z: number) => pMap.isImpassableAt(x, z)
                  : () => false;
                const path = findPath(unit.position, goal, isBlocked, { mapSize: MAP_SIZE, maxExpanded: 2400 });
                unitPathsRef.current.set(unit.id, { goal: { x: goal.x, z: goal.z }, path });
              }
              const cachedPath = unitPathsRef.current.get(unit.id)?.path ?? [];

              // Segue o proximo waypoint; sem rota (ou fim dela) segue reto ao alvo
              const waypoint = cachedPath.length > 0 ? nextWaypoint(unit.position, cachedPath) : null;
              const heading = waypoint ?? goal;
              const hx = heading.x - unit.position.x;
              const hz = heading.z - unit.position.z;
              const headingDist = Math.sqrt(hx * hx + hz * hz);
              if (headingDist < 1e-6) {
                unitPathsRef.current.delete(unit.id);
                return { ...unit, targetPosition: null, state: 'idle' as const };
              }

              const nextX = unit.position.x + (hx / headingDist) * speed;
              const nextZ = unit.position.z + (hz / headingDist) * speed;

              // Collision check with impassable Skyrim cliffs and ocean
              if (pMap) {
                if (isBoat) {
                  if (!pMap.isWaterAt(nextX, nextZ)) {
                    return { ...unit, targetPosition: null, state: 'idle' as const };
                  }
                } else {
                  if (pMap.isImpassableAt(nextX, nextZ)) {
                    if (!pMap.isImpassableAt(nextX, unit.position.z)) {
                      return { ...unit, position: { x: nextX, z: unit.position.z }, state: 'moving' as const };
                    } else if (!pMap.isImpassableAt(unit.position.x, nextZ)) {
                      return { ...unit, position: { x: unit.position.x, z: nextZ }, state: 'moving' as const };
                    } else {
                      return { ...unit, targetPosition: null, state: 'idle' as const };
                    }
                  }
                }
              }

              return {
                ...unit,
                position: {
                  x: nextX,
                  z: nextZ,
                },
                state: 'moving' as const,
              };
            }

            // Reparo: aldeao conserta o edificio proprio consumindo madeira
            if (unit.state === 'repairing' && unit.targetEntityId) {
              const targetId = unit.targetEntityId;
              const building = updatedBuildings.find((bd) => bd.id === targetId);
              if (!building || !building.isComplete || building.owner !== unit.owner || building.health >= building.maxHealth) {
                return { ...unit, state: 'idle' as const, targetEntityId: null, targetPosition: null };
              }

              const repairDx = building.position.x - unit.position.x;
              const repairDz = building.position.z - unit.position.z;
              const repairDistance = Math.sqrt(repairDx * repairDx + repairDz * repairDz);

              // Aproxima do edificio antes de comecar a consertar
              if (repairDistance > REPAIR_REACH) {
                const step = 0.16;
                const nextX = unit.position.x + (repairDx / repairDistance) * step;
                const nextZ = unit.position.z + (repairDz / repairDistance) * step;
                const repairMap = proceduralMapRef.current;
                if (repairMap && repairMap.isImpassableAt(nextX, nextZ)) {
                  return { ...unit, state: 'idle' as const, targetEntityId: null };
                }
                return { ...unit, position: { x: nextX, z: nextZ }, state: 'repairing' as const };
              }

              const ownerResources = updatedResources[unit.owner];
              const healed = Math.min(REPAIR_HP_PER_TICK, building.maxHealth - building.health);
              const woodCost = healed * REPAIR_WOOD_PER_HP;
              if (!ownerResources || healed <= 0 || ownerResources.wood < woodCost) {
                return { ...unit, state: 'idle' as const, targetEntityId: null };
              }

              updatedResources = {
                ...updatedResources,
                [unit.owner]: { ...ownerResources, wood: ownerResources.wood - woodCost },
              };
              updatedBuildings = updatedBuildings.map((bd) =>
                bd.id === building.id ? { ...bd, health: bd.health + healed } : bd
              );
              return { ...unit, state: 'repairing' as const };
            }

            // B. Resource Gathering (With Sustainable Forestry, Regrowth, Shift Timer & Strict Proximity Leash)
            if (unit.state === 'gathering' && unit.targetEntityId) {
              const targetNode = updatedNodes.find((n) => n.id === unit.targetEntityId);

              // 1. Work Shift Countdown Timer
              let nextShiftRemaining = unit.gatherShiftSecondsRemaining;
              if (unit.gatherTimeLimitSeconds && unit.gatherTimeLimitSeconds > 0) {
                const currentRemaining = unit.gatherShiftSecondsRemaining ?? unit.gatherTimeLimitSeconds;
                nextShiftRemaining = currentRemaining - 0.05; // 50ms interval = 0.05s
                if (nextShiftRemaining <= 0) {
                  // Shift finished: worker stops and returns to idle
                  return {
                    ...unit,
                    state: 'idle' as const,
                    targetEntityId: null,
                    targetPosition: null,
                    gatherShiftSecondsRemaining: undefined,
                  };
                }
              }

              if (targetNode && targetNode.remaining > 0 && !targetNode.isRegrowing) {
                const dx = targetNode.position.x - unit.position.x;
                const dz = targetNode.position.z - unit.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);

                if (dist > 1.8) {
                  // Walk closer
                  const speed = 0.16;
                  return {
                    ...unit,
                    position: {
                      x: unit.position.x + (dx / dist) * speed,
                      z: unit.position.z + (dz / dist) * speed,
                    },
                    gatherShiftSecondsRemaining: nextShiftRemaining,
                  };
                } else {
                  // Gather resource tick
                  let gatherRate = 0.5;
                  if (targetNode.type === 'tree') {
                    const hasSawmill = updatedBuildings.some(
                      (b) => b.owner === unit.owner && b.type === 'sawmill' && b.isComplete
                    );
                    if (hasSawmill) gatherRate *= 1.35;
                  } else if (targetNode.type === 'gold_mine' || targetNode.type === 'stone') {
                    const hasMine = updatedBuildings.some(
                      (b) => b.owner === unit.owner && b.type === 'mine' && b.isComplete
                    );
                    if (hasMine) gatherRate *= 1.4;
                  } else if (targetNode.type === 'fish_school') {
                    gatherRate = unit.type === 'fishing_boat' ? 1.0 : 0.65;
                  }

                  // Tecnologias de economia aceleram a coleta
                  gatherRate *= gatherMultiplier(updatedTechs[unit.owner], targetNode.type);

                  targetNode.remaining = Math.max(0, targetNode.remaining - gatherRate);

                  const resKey =
                    targetNode.type === 'tree'
                      ? 'wood'
                      : targetNode.type === 'gold_mine'
                      ? 'gold'
                      : targetNode.type === 'stone'
                      ? 'stone'
                      : 'food';
                  if (updatedResources[unit.owner]) {
                    updatedResources[unit.owner] = {
                      ...updatedResources[unit.owner],
                      [resKey]: updatedResources[unit.owner][resKey] + gatherRate,
                    };
                  }

                  // If resource got depleted this tick:
                  if (targetNode.remaining <= 0) {
                    if (targetNode.type === 'fish_school') {
                      // Fish schools in river are renewable: replenish school
                      targetNode.remaining = 600;
                    }

                    const isSustainableTree =
                      targetNode.type === 'tree' &&
                      (targetNode.harvestMode === 'sustainable' ||
                        (unit.owner === playerSlot && isColonySustainableForestryRef.current));

                    if (isSustainableTree) {
                      // Sustainable forestry: plant seedling and start regrowth
                      targetNode.harvestMode = 'sustainable';
                      targetNode.isRegrowing = true;
                      targetNode.regrowthProgress = 0;
                      targetNode.remaining = 0;
                    }

                    // Auto-retarget with STRICT PROXIMITY CONSTRAINT:
                    // Only search within unit.gatherRadiusLimit (default 18m) of the anchor origin!
                    // This prevents villagers from runaway travel clearcutting the entire map.
                    const resType = targetNode.type;
                    const maxRadius = unit.gatherRadiusLimit || gatherRadiusLimitRef.current || 18;
                    const anchor = unit.gatherOrigin || targetNode.position || unit.position;

                    const nearbyNodes = updatedNodes.filter(
                      (n) =>
                        n.type === resType &&
                        n.id !== targetNode.id &&
                        n.remaining > 0 &&
                        !n.isRegrowing &&
                        (maxRadius >= 999 || Math.hypot(n.position.x - anchor.x, n.position.z - anchor.z) <= maxRadius)
                    );

                    if (nearbyNodes.length > 0) {
                      nearbyNodes.sort((a, b) => {
                        // Prioritize same cluster first if available
                        if (targetNode.clusterId) {
                          const aSame = a.clusterId === targetNode.clusterId ? 1 : 0;
                          const bSame = b.clusterId === targetNode.clusterId ? 1 : 0;
                          if (aSame !== bSame) return bSame - aSame;
                        }
                        const dA = Math.hypot(a.position.x - unit.position.x, a.position.z - unit.position.z);
                        const dB = Math.hypot(b.position.x - unit.position.x, b.position.z - unit.position.z);
                        return dA - dB;
                      });

                      const nextTarget = nearbyNodes[0];
                      // INHERIT SUSTAINABILITY:
                      // If the previous tree or grove was sustainable, propagate to the next tree!
                      if (isSustainableTree) {
                        nextTarget.harvestMode = 'sustainable';
                      }

                      return {
                        ...unit,
                        targetEntityId: nextTarget.id,
                        state: 'gathering' as const,
                        gatherOrigin: anchor,
                        gatherRadiusLimit: maxRadius,
                        gatherTimeLimitSeconds: unit.gatherTimeLimitSeconds,
                        gatherShiftSecondsRemaining: nextShiftRemaining,
                      };
                    } else {
                      // Bosque / local deposit exhausted or regrowing: STOP and wait at post!
                      return {
                        ...unit,
                        state: 'idle' as const,
                        targetEntityId: null,
                        targetPosition: null,
                        gatherOrigin: anchor,
                        gatherRadiusLimit: maxRadius,
                        gatherShiftSecondsRemaining: undefined,
                      };
                    }
                  }

                  return {
                    ...unit,
                    gatherShiftSecondsRemaining: nextShiftRemaining,
                  };
                }
              } else {
                // Target node is already depleted or regrowing: check nearby within strict proximity clamp
                const resType = targetNode?.type || 'tree';
                const isSustainableTree =
                  resType === 'tree' &&
                  ((targetNode && targetNode.harvestMode === 'sustainable') ||
                    (unit.owner === playerSlot && isColonySustainableForestryRef.current));

                const maxRadius = unit.gatherRadiusLimit || gatherRadiusLimitRef.current || 14;
                const anchor = unit.gatherOrigin || targetNode?.position || unit.position;

                const nearbyNodes = updatedNodes.filter(
                  (n) =>
                    n.type === resType &&
                    n.remaining > 0 &&
                    !n.isRegrowing &&
                    (maxRadius >= 999 || Math.hypot(n.position.x - anchor.x, n.position.z - anchor.z) <= maxRadius)
                );

                if (nearbyNodes.length > 0) {
                  nearbyNodes.sort((a, b) => {
                    if (targetNode?.clusterId) {
                      const aSame = a.clusterId === targetNode.clusterId ? 1 : 0;
                      const bSame = b.clusterId === targetNode.clusterId ? 1 : 0;
                      if (aSame !== bSame) return bSame - aSame;
                    }
                    const dA = Math.hypot(a.position.x - unit.position.x, a.position.z - unit.position.z);
                    const dB = Math.hypot(b.position.x - unit.position.x, b.position.z - unit.position.z);
                    return dA - dB;
                  });

                  const nextTarget = nearbyNodes[0];
                  if (isSustainableTree) {
                    nextTarget.harvestMode = 'sustainable';
                  }

                  return {
                    ...unit,
                    targetEntityId: nextTarget.id,
                    state: 'gathering' as const,
                    gatherOrigin: anchor,
                    gatherRadiusLimit: maxRadius,
                    gatherTimeLimitSeconds: unit.gatherTimeLimitSeconds,
                    gatherShiftSecondsRemaining: nextShiftRemaining,
                  };
                }
                return {
                  ...unit,
                  state: 'idle' as const,
                  targetEntityId: null,
                  targetPosition: null,
                  gatherOrigin: anchor,
                  gatherRadiusLimit: maxRadius,
                  gatherShiftSecondsRemaining: undefined,
                };
              }
            }

            // C. Combat Attacking
            if (unit.state === 'attacking' && unit.targetEntityId) {
              const targetEnemy = updatedUnits.find((u) => u.id === unit.targetEntityId);
              const targetBuilding = !targetEnemy ? updatedBuildings.find((b) => b.id === unit.targetEntityId) : null;
              const target = targetEnemy || targetBuilding;

              if (target && target.health > 0) {
                const dx = target.position.x - unit.position.x;
                const dz = target.position.z - unit.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);

                const attackRange = unit.type === 'soldier' ? (targetBuilding ? 5.5 : 4.5) : unit.type === 'cavalry' ? (targetBuilding ? 3.5 : 2.5) : (targetBuilding ? 2.5 : 1.2);
                if (dist > attackRange) {
                  const speed = unit.type === 'cavalry' ? 0.26 : 0.18;
                  return {
                    ...unit,
                    position: {
                      x: unit.position.x + (dx / dist) * speed,
                      z: unit.position.z + (dz / dist) * speed,
                    },
                  };
                } else {
                  // Apply damage with rhythmic attack cadence
                  const cooldown = unit.attackCooldown ?? 0;
                  if (cooldown <= 0) {
                    const baseDamage = unit.type === 'soldier' ? 24 : unit.type === 'cavalry' ? 32 : 8;
                    const damage = Math.round(
                      baseDamage * unitDamageMultiplier(updatedTechs[unit.owner], unit.type)
                    );
                    const prevHealth = target.health;
                    target.health = Math.max(0, target.health - damage);

                    const isMusket = unit.type === 'soldier';

                    // Spawn hit-effect particles at target's exact 3D coordinates
                    engineRef.current?.spawnHitEffect(
                      target.position.x,
                      targetBuilding ? 1.4 : 0.65,
                      target.position.z,
                      isMusket
                    );

                    // Combat audio feedback
                    soundManager.playCombatHitSound(isMusket);

                    // If fatal hit, spawn defeat burst
                    if (prevHealth > 0 && target.health <= 0) {
                      engineRef.current?.spawnHitEffect(
                        target.position.x,
                        targetBuilding ? 1.0 : 0.3,
                        target.position.z,
                        false
                      );
                    }

                    // Reset attack cooldown (Soldier fires every ~12 ticks = 0.6s, Villager strikes every ~8 ticks = 0.4s)
                    return {
                      ...unit,
                      attackCooldown: isMusket ? 12 : 8,
                    };
                  } else {
                    return {
                      ...unit,
                      attackCooldown: cooldown - 1,
                    };
                  }
                }
              } else {
                return { ...unit, state: 'idle' as const, targetEntityId: null };
              }
            }

            // D. Construction / Hammering Building Site
            if (unit.state === 'building' && unit.targetEntityId) {
              const targetB = updatedBuildings.find((b) => b.id === unit.targetEntityId);
              if (targetB && !targetB.isComplete && targetB.health > 0) {
                const dx = targetB.position.x - unit.position.x;
                const dz = targetB.position.z - unit.position.z;
                const dist = Math.hypot(dx, dz);

                const buildRange = 2.4;
                if (dist > buildRange) {
                  // Walk towards building site
                  const speed = 0.16;
                  return {
                    ...unit,
                    position: {
                      x: unit.position.x + (dx / dist) * speed,
                      z: unit.position.z + (dz / dist) * speed,
                    },
                  };
                } else {
                  // Hammer and advance construction
                  const bDef = BUILDING_CATALOG[targetB.type as 'house' | 'barracks' | 'tower'];
                  const buildTime = bDef ? bDef.buildTimeSeconds : 10;
                  const progressDelta = 100 / (buildTime * 20); // 20 ticks per second
                  targetB.buildProgress = Math.min(100, (targetB.buildProgress || 0) + progressDelta);
                  targetB.health = Math.round(targetB.maxHealth * (0.1 + 0.9 * (targetB.buildProgress / 100)));

                  // Hammer dust & wood particles occasionally
                  if (Math.random() < 0.22) {
                    engineRef.current?.spawnConstructionParticles(targetB.position.x, 0.7, targetB.position.z);
                    if (targetB.owner === playerSlot) {
                      soundManager.playHammerSound();
                    }
                  }

                  if (targetB.buildProgress >= 100) {
                    targetB.isComplete = true;
                    targetB.health = targetB.maxHealth;
                    if (targetB.type === 'house' && updatedResources[targetB.owner]) {
                      updatedResources[targetB.owner].maxPop += 5;
                    }
                    if (targetB.owner === playerSlot) {
                      soundManager.playBuildingCompletedSound(targetB.type);
                      triggerNotification(`Construção Concluída: ${bDef ? bDef.name : 'Edifício'}!`, 'success');
                    }
                    return { ...unit, state: 'idle' as const, targetEntityId: null };
                  }
                }
              } else {
                return { ...unit, state: 'idle' as const, targetEntityId: null };
              }
            }

            return unit;
          });
        // Free population slots of every unit that died this tick
        const deathsByOwner = countDeathsByOwner(updatedUnits);
        updatedUnits = updatedUnits.filter((u) => u.health > 0); // Remove dead units
        // Descarta caminhos A* de unidades que ja sairam da partida
        const liveUnitIds = new Set(updatedUnits.map((u) => u.id));
        unitPathsRef.current.forEach((_, id) => {
          if (!liveUnitIds.has(id)) unitPathsRef.current.delete(id);
        });
        for (const owner of Object.keys(deathsByOwner)) {
          updatedResources = applyPopDelta(updatedResources, owner, -deathsByOwner[owner]);
        }

        // Remove destroyed buildings
        updatedBuildings = updatedBuildings.filter((b) => b.health > 0);

        // Advance regrowing trees (Sustainable Forestry)
        updatedNodes = updatedNodes.map((n) => {
          if (n.isRegrowing) {
            // ~18s to regrow: 100 / (20 * 18) = ~0.28% per tick
            const nextProgress = Math.min(100, (n.regrowthProgress || 0) + 0.28);
            if (nextProgress >= 100) {
              return {
                ...n,
                isRegrowing: false,
                regrowthProgress: 100,
                remaining: n.maxCapacity || 150,
              };
            }
            return { ...n, regrowthProgress: nextProgress };
          }
          return n;
        });

        // Remove depleted resource nodes (preserve regrowing trees in sustainable forestry)
        updatedNodes = updatedNodes.filter((n) => n.remaining > 0 || n.isRegrowing);

        // 2. Process Building Training Queues
        updatedBuildings = updatedBuildings.map((building) => {
          if (building.trainingQueue.length > 0) {
            const currentItem = { ...building.trainingQueue[0] };
            currentItem.progress += 2; // progress speed

            if (currentItem.progress >= 100) {
              // Spawn unit
              const isBoat = currentItem.unitType === 'fishing_boat' || currentItem.unitType === 'trade_boat';
              const maxHp = isBoat ? 220 : currentItem.unitType === 'soldier' ? 150 : currentItem.unitType === 'cavalry' ? 180 : 100;
              const newUnit: Unit = {
                id: uuidv4(),
                type: currentItem.unitType,
                owner: building.owner,
                position: {
                  x: building.position.x + (isBoat ? 2.5 : Math.random() * 2 + 2),
                  z: building.position.z + (isBoat ? 2.5 : Math.random() * 2 + 2),
                },
                targetPosition: null,
                targetEntityId: null,
                health: maxHp,
                maxHealth: maxHp,
                attackDamage: currentItem.unitType === 'soldier' ? 18 : currentItem.unitType === 'cavalry' ? 20 : 5,
                state: 'idle',
              };
              updatedUnits.push(newUnit);

              if (updatedResources[building.owner]) {
                updatedResources = applyPopDelta(updatedResources, building.owner, 1);
              }

              // Audio feedback: Unit finished training!
              if (building.owner === playerSlot) {
                soundManager.playUnitTrainedSound(currentItem.unitType);
              }

              return {
                ...building,
                trainingQueue: building.trainingQueue.slice(1),
              };
            } else {
              return {
                ...building,
                trainingQueue: [currentItem, ...building.trainingQueue.slice(1)],
              };
            }
          }
          return building;
        });

        // 2b. Defensive Watchtowers automated defense
        updatedBuildings.forEach((b) => {
          if (b.type === 'tower' && b.isComplete && b.health > 0) {
            b.attackCooldown = Math.max(0, (b.attackCooldown || 0) - 1);
            if (b.attackCooldown <= 0) {
              const enemies = updatedUnits.filter((u) => u.owner !== b.owner && u.health > 0);
              let nearestEnemy: Unit | null = null;
              let nearestDist = 12;
              enemies.forEach((e) => {
                const dist = Math.hypot(e.position.x - b.position.x, e.position.z - b.position.z);
                if (dist < nearestDist) {
                  nearestDist = dist;
                  nearestEnemy = e;
                }
              });

              if (nearestEnemy) {
                (nearestEnemy as Unit).health = Math.max(0, (nearestEnemy as Unit).health - 16);
                b.attackCooldown = 22; // ~1.1s cooldown
                engineRef.current?.spawnHitEffect(
                  (nearestEnemy as Unit).position.x,
                  0.7,
                  (nearestEnemy as Unit).position.z,
                  true
                );
                soundManager.playCombatHitSound(true);
              }
            }
          }
        });

        // 2c. Passive Production from Completed Infrastructure & Trade Fleet
        (['player1', 'player2', 'player3', 'player4'] as const).forEach((slot) => {
          const res = updatedResources[slot];
          if (!res) return;

          // Completed Farms produce continuous grain harvest
          const completedFarms = updatedBuildings.filter(
            (b) => b.owner === slot && b.type === 'farm' && b.isComplete && b.health > 0
          ).length;
          if (completedFarms > 0) {
            res.food += completedFarms * 0.1; // ~2 food / second per completed farm
          }

          // Completed Grand Markets generate municipal trade tax & commerce
          const completedMarkets = updatedBuildings.filter(
            (b) => b.owner === slot && b.type === 'market' && b.isComplete && b.health > 0
          ).length;
          if (completedMarkets > 0) {
            res.gold = (res.gold || 0) + completedMarkets * 0.05; // ~1 gold / second per market
          }

          // Trade Boats generate passive commerce gold along the river
          const activeTradeBoats = updatedUnits.filter(
            (u) => u.owner === slot && u.type === 'trade_boat' && u.health > 0
          ).length;
          if (activeTradeBoats > 0) {
            res.gold = (res.gold || 0) + activeTradeBoats * 0.15; // ~3 gold / second per trade boat
          }

          // Completed Sawmills refine wood into noble planks
          const completedSawmills = updatedBuildings.filter(
            (b) => b.owner === slot && b.type === 'sawmill' && b.isComplete && b.health > 0
          ).length;
          if (completedSawmills > 0) {
            updatedResources[slot] = refinePlanks(res, completedSawmills);
          }
        });

        // 3. IA autonoma de todos os slots nao humanos no modo solo (2..4 jogadores)
        if (role === 'single') {
          const humanSlot = playerSlotRef.current;
          const aiSlots = activeSlotsRef.current.filter((slot) => slot !== humanSlot);

          aiSlots.forEach((aiSlot) => {
            const aiTc = updatedBuildings.find((b) => b.owner === aiSlot && b.type === 'town_center');
            const aiUnits = updatedUnits.filter((u) => u.owner === aiSlot);
            const aiRes = updatedResources[aiSlot];
            if (!aiRes || !aiTc) return;

            // Producao: mosqueteiro, aldeao e cavalaria quando o ouro permite
            if (aiTc.trainingQueue.length === 0 && aiUnits.length < 8) {
              const cycle: UnitType[] = ['soldier', 'villager', 'soldier', 'cavalry'];
              const trainType = cycle[aiUnits.length % cycle.length];
              const cost = UNIT_COSTS[trainType];
              if (canAfford(aiRes, cost)) {
                updatedResources[aiSlot] = applyCost(aiRes, cost);
                aiTc.trainingQueue.push({ unitType: trainType, progress: 0 });
              }
            }

            // Unidades ociosas: aldeoes coletam, militares marcham contra a base humana
            aiUnits.forEach((aiUnit) => {
              if (aiUnit.state !== 'idle') return;

              if (aiUnit.type === 'villager') {
                const nearestTree = updatedNodes.find((n) => n.type === 'tree');
                if (nearestTree) {
                  aiUnit.state = 'gathering';
                  aiUnit.targetEntityId = nearestTree.id;
                }
                return;
              }

              const soldiers = aiUnits.filter((u) => u.type === 'soldier').length;
              const cavalry = aiUnits.filter((u) => u.type === 'cavalry').length;
              const shouldMarch =
                (aiUnit.type === 'soldier' && soldiers >= 3) ||
                (aiUnit.type === 'cavalry' && (cavalry >= 2 || soldiers >= 3));
              if (shouldMarch) {
                const humanTc = updatedBuildings.find((b) => b.owner === humanSlot && b.type === 'town_center');
                if (humanTc) {
                  aiUnit.targetPosition = { x: humanTc.position.x + 2, z: humanTc.position.z + 2 };
                }
              }
            });
          });
        }

        // 3b. Filas de pesquisa: tecnologias e avancos de era (20 ticks/s)
        Object.keys(updatedTechs).forEach((slot) => {
          const before = updatedTechs[slot];
          if (!before) return;
          const after = advanceResearch(before, 0.05);
          updatedTechs[slot] = after;
          if (slot !== playerSlotRef.current || after === before) return;
          if (after.completed.length > before.completed.length) {
            const techId = after.completed[after.completed.length - 1];
            const tech = TECH_DEFS.find((candidate) => candidate.id === techId);
            triggerNotification(`Tecnologia pesquisada: ${tech?.name ?? techId}! (${tech?.description ?? ''})`, 'success');
            soundManager.playBuildingCompletedSound('market');
          } else if (after.era !== before.era) {
            triggerNotification(`Avanço de era concluído: ${after.era}!`, 'success');
            soundManager.playBuildingCompletedSound('town_center');
          }
        });

        // 4. Separacao de corpos: empurra unidades sobrepostas (grid espacial, ~O(n) por tick)
        const separationMap = proceduralMapRef.current;
        if (separationMap && updatedUnits.length > 1) {
          const movedPositions = new Map<string, { x: number; z: number }>();
          const relax = (units: Unit[], isBlocked: (x: number, z: number) => boolean) => {
            if (units.length < 2) return;
            const resolved = resolveSeparation(
              units.map((u) => ({ id: u.id, x: u.position.x, z: u.position.z })),
              { mapSize: MAP_SIZE, isBlocked }
            );
            resolved.forEach((pos, index) => {
              const unit = units[index];
              if (pos.x !== unit.position.x || pos.z !== unit.position.z) {
                movedPositions.set(unit.id, { x: pos.x, z: pos.z });
              }
            });
          };
          const isSeaUnit = (u: Unit) => u.type === 'fishing_boat' || u.type === 'trade_boat';
          relax(updatedUnits.filter((u) => !isSeaUnit(u)), (x, z) => separationMap.isImpassableAt(x, z));
          relax(updatedUnits.filter(isSeaUnit), (x, z) => !separationMap.isWaterAt(x, z));
          if (movedPositions.size > 0) {
            updatedUnits = updatedUnits.map((u) => {
              const pos = movedPositions.get(u.id);
              return pos ? { ...u, position: pos } : u;
            });
          }
        }

        return {
          units: updatedUnits,
          buildings: updatedBuildings,
          resourceNodes: updatedNodes,
          playerResources: updatedResources,
          techs: updatedTechs,
          match:
            activeSlotsRef.current.length >= 2
              ? evaluateMatch(updatedBuildings, activeSlotsRef.current)
              : { status: 'running' as const, players: activeSlotsRef.current },
        };
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
            } else if (b.type === 'barracks' && key === 'c') {
              handleTrainUnit('cavalry', 1);
            } else if (b.type === 'dock' && key === 'p') {
              handleTrainUnit('fishing_boat', 1);
            } else if (b.type === 'dock' && key === 'm') {
              handleTrainUnit('trade_boat', 1);
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
          myUnits.forEach((u) => {
            const cmd = { type: 'attack', unitId: u.id, targetId: id };
            if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
            else multiRef.current?.sendToHost(cmd);
          });
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
            // Attack enemy building
            myUnits.forEach((u) => {
              const cmd = { type: 'attack', unitId: u.id, targetId: id };
              if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
              else multiRef.current?.sendToHost(cmd);
            });
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
      const isLandUnit = myUnits.some((u) => u.type !== 'fishing_boat' && u.type !== 'trade_boat');
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

  // ==========================================
  // RENDER: PRE-GAME LOBBY / MENU
  // ==========================================
  if (!isGameStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/40 flex items-center justify-center p-4 text-slate-100 selection:bg-amber-500 selection:text-slate-950">
        <div className="max-w-xl w-full bg-slate-900/90 backdrop-blur-xl border border-amber-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          {/* Brand Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-1 shadow-inner">
              <Shield className="w-9 h-9" />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white flex items-center justify-center gap-2">
              Crônicas da Vila <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">AoE3 Web</span>
            </h1>
            <p className="text-sm text-slate-400">
              Jogo de Estratégia em Tempo Real com Construção de Bases e Multiplayer 100% Offline via Wi-Fi/LAN
            </p>
          </div>

          {/* LAN Connection Banner */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Wifi className="w-4 h-4" /> Servidor Local (Docker / Localhost)
              </span>
              <span className="text-slate-400 font-mono">Porta: 3000</span>
            </div>

            <div className="flex items-center gap-2 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 text-xs font-mono">
              <span className="text-slate-500">IP na Rede Local:</span>
              <span className="text-amber-300 font-bold flex-1 truncate">
                http://{lanIps[0] || 'localhost'}:3000
              </span>
              <button
                type="button"
                onClick={copyLanUrl}
                className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg flex items-center gap-1 transition-colors text-[11px] font-sans font-medium"
              >
                {copiedIp ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedIp ? 'Copiado!' : 'Copiar Link'}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              <strong>Dica Multiplayer:</strong> Qualquer pessoa conectada no mesmo Wi-Fi pode abrir este link no navegador do celular ou PC para entrar na sua partida sem precisar de internet!
            </p>
          </div>

          {/* Player Configurations */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Seu Nome / Título</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Código da Sala (LAN)</label>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Escolha sua Civilização & Cor</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(FACTION_COLORS) as [string, typeof FACTION_COLORS['player1']][]).map(([slot, info]) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setPlayerSlot(slot as PlayerSlot)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all text-left ${
                      playerSlot === slot
                        ? `${info.border} bg-slate-800 ring-2 ring-amber-500/40 text-white`
                        : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full ${info.colorClass}`} />
                    <span className="truncate">{info.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {lobbyError && (
            <p role="alert" className="rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {lobbyError}
            </p>
          )}

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setLobbyError(null);
                  setRole('host');
                  setIsGameStarted(true);
                }}
                className="py-3.5 px-4 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all active:scale-[0.98]"
              >
                <Play className="w-4 h-4 fill-current" /> Criar Partida (Host LAN)
              </button>

              <button
                type="button"
                onClick={() => {
                  setLobbyError(null);
                  setRole('client');
                  setIsGameStarted(true);
                }}
                className="py-3.5 px-4 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <Users className="w-4 h-4" /> Entrar via Código
              </button>
            </div>

            <div className="pt-1">
              <span className="block text-xs font-medium text-slate-400 mb-1.5">
                Treino Solo: jogadores na partida (você + IA)
              </span>
              <div className="grid grid-cols-3 gap-2">
                {([2, 3, 4] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      setMatchSize(size);
                      soundManager.playClickSound();
                    }}
                    className={`py-2 rounded-xl border text-xs font-semibold transition-all ${
                      matchSize === size
                        ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 ring-1 ring-amber-500/30'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                    }`}
                  >
                    {size} jogadores
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {matchSize === 2
                  ? 'Você contra uma colônia rival.'
                  : `${matchSize - 1} colônias rivais controladas pela IA.`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setLobbyError(null);
                setRole('single');
                setIsGameStarted(true);
              }}
              className="w-full py-2.5 px-4 rounded-xl font-medium bg-slate-900/60 hover:bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-800/80 flex items-center justify-center gap-2 text-xs transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Jogar Treino Solo Offline (Contra IA)
            </button>
          </div>
        </div>
      </div>
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
        onMouseEnter={() => setIsHoverPeeking(true)}
      />

      {/* MINIMAL RESTORE DOCK WHEN HUD IS HIDDEN (Cinematic Exploration Mode) */}
      {hudMode === 'hidden' && !isHoverPeeking && (
        <div
          onMouseEnter={() => {
            setIsHoverPeeking(true);
            engineRef.current?.setIsPointerOverUI(true);
          }}
          onMouseLeave={() => {
            setIsHoverPeeking(false);
            engineRef.current?.setIsPointerOverUI(false);
          }}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex items-center gap-2 bg-slate-950/90 hover:bg-slate-950 border border-amber-500/40 hover:border-amber-400 px-3.5 py-1.5 rounded-full shadow-2xl backdrop-blur-md text-xs font-semibold transition-all group"
        >
          <button
            type="button"
            onClick={() => {
              setHudMode('full');
              soundManager.playClickSound();
              triggerNotification('Interface HUD restaurada.', 'info');
            }}
            className="flex items-center gap-1.5 text-amber-300 hover:text-amber-200 transition-colors"
          >
            <Eye className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
            <span>Exibir Interface</span>
            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-[10px] text-white">H</kbd>
          </button>

          <span className="text-slate-600">·</span>

          {/* Camera Lock toggle button in Hidden mode */}
          <button
            type="button"
            onClick={toggleCameraLock}
            className={`flex items-center gap-1 text-[11px] transition-colors ${
              isCameraAutoMoveLocked ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Travar / Destravar Rolagem Automática de Câmera (Tecla L)"
          >
            {isCameraAutoMoveLocked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
            <span>{isCameraAutoMoveLocked ? 'Câmera Fixa' : 'Câmera Livre'}</span>
          </button>

          <span className="text-slate-600 hidden sm:inline">·</span>
          <span className="text-[10px] text-slate-400 hidden sm:inline">Modo Exploração Livre</span>
        </div>
      )}

      {/* TOP RESOURCE & STATUS HUD (FULL / COMPACT / HOVER PEEK) */}
      {(hudMode !== 'hidden' || isHoverPeeking) && (
        <header
          onMouseEnter={() => {
            setIsHoverPeeking(true);
            engineRef.current?.setIsPointerOverUI(true);
          }}
          onMouseLeave={() => {
            setIsHoverPeeking(false);
            engineRef.current?.setIsPointerOverUI(false);
          }}
          className={`absolute top-2 sm:top-4 left-2 sm:left-4 right-2 sm:right-4 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 pointer-events-none transition-all duration-300 z-30 ${
            hudMode === 'hidden' && isHoverPeeking ? 'opacity-100 translate-y-0' : ''
          }`}
        >
          {hudMode === 'compact' && !isHoverPeeking ? (
            /* COMPACT TACTICAL HUD STRIP */
            <div className="flex items-center justify-between w-full pointer-events-auto bg-slate-950/90 backdrop-blur-md px-3 sm:px-4 py-1.5 rounded-2xl border border-slate-800 shadow-2xl">
              {/* Compact Resource Ticker */}
              <div className="flex items-center gap-2 sm:gap-4 text-xs font-mono">
                <span className="flex items-center gap-1 text-amber-300 font-bold" title="Madeira">
                  M {Math.floor(myResources.wood)}
                </span>
                <span className="flex items-center gap-1 text-red-300 font-bold" title="Alimento">
                  C {Math.floor(myResources.food)}
                </span>
                <span className="flex items-center gap-1 text-yellow-300 font-bold" title="Ouro">
                  O {Math.floor(myResources.gold)}
                </span>
                <span
                  className="flex items-center gap-1 text-slate-300 font-bold"
                  title="Pedra"
                >
                  P {Math.floor(myResources.stone)}
                </span>
                <span className="flex items-center gap-1 text-orange-200 font-bold" title="Tábuas">
                  T {Math.floor(myResources.planks || 0)}
                </span>
                <span className="flex items-center gap-1 text-blue-300 font-bold" title="População">
                  Pop {myResources.pop}/{myResources.maxPop}
                </span>
              </div>

              {/* Compact Controls */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={toggleCameraLock}
                  className={`px-2 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors ${
                    isCameraAutoMoveLocked
                      ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                  title="Travar / Destravar Rolagem Automática (Tecla L)"
                >
                  {isCameraAutoMoveLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  <span className="hidden md:inline">{isCameraAutoMoveLocked ? 'Câmera Fixa' : 'Câmera Livre'}</span>
                  <kbd className="hidden lg:inline text-[9px] px-1 py-0.5 bg-slate-900/80 rounded font-mono text-slate-400">L</kbd>
                </button>

                <button
                  type="button"
                  onClick={() => setHudMode('full')}
                  className="px-2 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                  title="Expandir para Modo HUD Completo (Tecla C)"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden sm:inline">Completo</span>
                  <kbd className="hidden lg:inline text-[9px] px-1 py-0.5 bg-slate-900/80 rounded font-mono text-slate-400">C</kbd>
                </button>

                <button
                  type="button"
                  onClick={() => setHudMode('hidden')}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-300 transition-colors"
                  title="Ocultar HUD completamente (Tecla H)"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            /* FULL DETAILED HUD BAR */
            <>
              {/* SVG-Art & Interactive Navigation Resource Bar (Ikariam / SkyCity / AoE style) */}
              <ResourceNavMenu
                resources={myResources}
                activeGatherers={activeGatherers}
                idleVillagersCount={idleFriendlyVillagersCount}
                onSelectIdleVillager={handleSelectIdleVillager}
                onOpenCatalog={() => setIsEmpireCatalogOpen(true)}
                onOpenMarket={() => setIsEmpireCatalogOpen(true)}
                onJumpToResource={handleJumpToResource}
                onQuickBuild={(type) => {
                  setBuildMode(type);
                  soundManager.playClickSound();
                  triggerNotification(`Modo de Construção: ${BUILDING_CATALOG[type]?.name || type}. Clique no terreno para erguer a obra.`, 'info');
                }}
                onRegenerateProceduralMap={role === 'single' ? handleRegenerateProceduralMap : undefined}
                isSustainableForestry={isColonySustainableForestry}
                onToggleSustainableForestry={handleToggleColonySustainableForestry}
              />

              {/* Room & Actions Bar */}
              <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-950/90 backdrop-blur-md px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-2xl border border-slate-800 shadow-2xl pointer-events-auto">
                {/* Camera Auto-Movement Lock Toggle Button */}
                <button
                  type="button"
                  onClick={toggleCameraLock}
                  className={`p-1.5 px-2.5 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-semibold ${
                    isCameraAutoMoveLocked
                      ? 'bg-amber-500/25 border-amber-500/50 text-amber-300 shadow-sm shadow-amber-500/20 ring-1 ring-amber-500/30'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                  title={
                    isCameraAutoMoveLocked
                      ? 'Câmera Fixa: rolagem automática pelas bordas travada (Tecla L). Clique para destravar.'
                      : 'Câmera Livre: rolagem automática pelas bordas ativa (Tecla L). Clique para travar.'
                  }
                >
                  {isCameraAutoMoveLocked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5 text-slate-400" />}
                  <span className="hidden sm:inline font-bold">
                    {isCameraAutoMoveLocked ? 'Câmera Fixa' : 'Câmera Livre'}
                  </span>
                  <kbd className="hidden md:inline px-1 py-0.5 bg-slate-900 rounded font-mono text-[9px] text-slate-400">L</kbd>
                </button>

                {/* HUD Mode Switcher Segmented Control */}
                <div className="hidden sm:flex items-center p-0.5 bg-slate-900 border border-slate-800 rounded-xl text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setHudMode('full')}
                    className={`px-2 py-1 rounded-lg transition-colors ${
                      hudMode === 'full' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Modo Completo"
                  >
                    Cheio
                  </button>
                  <button
                    type="button"
                    onClick={() => setHudMode('compact')}
                    className={`px-2 py-1 rounded-lg transition-colors ${
                      hudMode === 'compact' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Modo Tático Compacto (Tecla C)"
                  >
                    Compacto
                  </button>
                  <button
                    type="button"
                    onClick={() => setHudMode('hidden')}
                    className="px-2 py-1 rounded-lg text-slate-400 hover:text-amber-300 transition-colors"
                    title="Modo Cinemático Oculto (Tecla H)"
                  >
                    <EyeOff className="w-3 h-3 inline mr-1" />
                    Ocultar
                  </button>
                </div>

                {/* Mobile Single-Button HUD Toggle */}
                <button
                  type="button"
                  onClick={toggleHudMode}
                  className="sm:hidden p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Alternar Modo do HUD (Tecla H / C)"
                >
                  <Layers className="w-4 h-4 text-amber-400" />
                </button>

                {/* Sustainable Colony Forestry Policy Button */}
                <button
                  type="button"
                  onClick={handleToggleColonySustainableForestry}
                  className={`p-1.5 px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    isColonySustainableForestry
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                  title="Política Colonial de Reflorestamento: quando ativo, todas as árvores colhidas no mapa renascem automaticamente com mudas!"
                >
                  <Sprout className={`w-3.5 h-3.5 ${isColonySustainableForestry ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
                  <span className="hidden md:inline">Reflorestamento</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${isColonySustainableForestry ? 'bg-emerald-500/30 text-emerald-200 font-bold' : 'bg-slate-900 text-slate-400'}`}>
                    {isColonySustainableForestry ? 'ATIVO' : 'DESL'}
                  </span>
                </button>

                {/* Work Zones Selector Button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsWorkZoneModalOpen((prev) => !prev);
                    soundManager.playClickSound();
                  }}
                  className={`p-1.5 px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    activeWorkZones.length > 0 || isWorkZoneModalOpen
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/20'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                  title="Zonas de Trabalho: configure o raio limite e evite que os aldeões desmatem o mapa inteiro! (Tecla Z)"
                >
                  <Target className={`w-3.5 h-3.5 ${activeWorkZones.length > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`} />
                  <span className="hidden md:inline">Zonas</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${activeWorkZones.length > 0 ? 'bg-amber-500/30 text-amber-200' : 'bg-slate-900 text-slate-400'}`}>
                    {gatherRadiusLimit >= 999 ? 'Livre' : `${gatherRadiusLimit}m`}
                  </span>
                  <kbd className="hidden lg:inline px-1 py-0.5 bg-slate-900 rounded font-mono text-[9px] text-slate-400">Z</kbd>
                </button>

                {/* Research & Eras Panel Button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsTechPanelOpen((prev) => !prev);
                    soundManager.playClickSound();
                  }}
                  className={`p-1.5 px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    isTechPanelOpen
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/20'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                  title="Tecnologias e Eras: pesquique melhorias de economia e militar"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden md:inline">Tecnologias</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-slate-900 text-amber-200">
                    {gameState.techs?.[playerSlot]?.era === 'commercial'
                      ? 'E2'
                      : gameState.techs?.[playerSlot]?.era === 'industrial'
                      ? 'E3'
                      : 'E1'}
                  </span>
                </button>

                {/* Controls Guide Modal Button */}
                <button
                  type="button"
                  onClick={() => {
                    setShowControlsModal(true);
                    soundManager.playClickSound();
                  }}
                  className="p-1.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1 text-xs font-semibold"
                  title="Ver Guia de Controles e Atalhos"
                >
                  <Info className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden lg:inline">Controles</span>
                </button>

                {/* Audio Mute/Unmute Toggle Button */}
                <button
                  type="button"
                  onClick={() => {
                    const muted = soundManager.toggleMute();
                    setIsAudioMuted(muted);
                    if (!muted) soundManager.playClickSound();
                  }}
                  className={`p-1.5 rounded-xl transition-colors ${
                    isAudioMuted
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-slate-800 hover:bg-slate-700 text-amber-400'
                  }`}
                  title={isAudioMuted ? 'Ativar Efeitos Sonoros' : 'Silenciar Efeitos Sonoros'}
                >
                  {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                {/* Chat Toggle Button */}
                <button
                  type="button"
                  onClick={() => setIsChatOpen(!isChatOpen)}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors relative"
                  title="Chat da Partida"
                >
                  <MessageSquare className="w-4 h-4" />
                  {chatMessages.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full" />
                  )}
                </button>
              </div>
            </>
          )}
        </header>
      )}

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

        {/* Selected Entity Command Card */}
        {(selectedUnitsList.length > 0 || selectedEntity) && (
          isBottomCardCollapsed ? (
            /* COLLAPSED COMPACT CARD BADGE */
            <div
              onMouseEnter={() => engineRef.current?.setIsPointerOverUI(true)}
              onMouseLeave={() => engineRef.current?.setIsPointerOverUI(false)}
              className="bg-slate-950/90 backdrop-blur-xl border border-slate-800 hover:border-slate-700 rounded-2xl p-2.5 px-4 shadow-2xl pointer-events-auto flex items-center justify-between gap-3 text-xs w-full max-w-sm transition-all"
            >
              <div className="flex items-center gap-2 truncate">
                {selectedUnitsList.length > 1 ? (
                  <>
                    <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="font-bold text-white truncate">Pelotão ({selectedUnitsList.length} Unidades)</span>
                  </>
                ) : selectedUnitsList.length === 1 ? (
                  <>
                    {selectedUnitsList[0].type === 'villager' ? <Users className="w-4 h-4 text-amber-400 shrink-0" /> : <Sword className="w-4 h-4 text-blue-400 shrink-0" />}
                    <span className="font-bold text-white truncate">
                      {selectedUnitsList[0].type === 'villager' ? 'Aldeão' : selectedUnitsList[0].type === 'cavalry' ? 'Cavalaria' : 'Mosqueteiro'} ({Math.round(selectedUnitsList[0].health)}/{selectedUnitsList[0].maxHealth} HP)
                    </span>
                  </>
                ) : selectedBuilding ? (
                  <>
                    <Castle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="font-bold text-white truncate">
                      {selectedBuilding.type === 'town_center' ? 'Centro da Vila' : BUILDING_CATALOG[selectedBuilding.type as 'house' | 'barracks' | 'tower']?.name || 'Edifício'}
                      {selectedBuilding.trainingQueue.length > 0 && ` (${selectedBuilding.trainingQueue.length} na fila)`}
                    </span>
                  </>
                ) : selectedResource ? (
                  <>
                    {selectedResource.type === 'tree' ? (
                      <TreePine className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : selectedResource.type === 'gold_mine' ? (
                      <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                    ) : selectedResource.type === 'stone' ? (
                      <Pickaxe className="w-4 h-4 text-slate-300 shrink-0" />
                    ) : (
                      <Apple className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span className="font-bold text-white truncate">
                      {selectedResource.type === 'tree'
                        ? 'Madeira'
                        : selectedResource.type === 'gold_mine'
                        ? 'Ouro'
                        : selectedResource.type === 'stone'
                        ? 'Pedra'
                        : 'Frutas'}{' '}
                      ({Math.round(selectedResource.remaining)})
                    </span>
                  </>
                ) : null}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsBottomCardCollapsed(false)}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 flex items-center gap-1 text-[11px] font-semibold px-2 transition-colors"
                  title="Expandir Painel de Comandos"
                >
                  <span>Expandir</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUnitIds([]);
                    setSelectedEntity(null);
                  }}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                  title="Desmarcar Seleção (ESC)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            /* EXPANDED FULL COMMAND CARD */
            <div
              onMouseEnter={() => engineRef.current?.setIsPointerOverUI(true)}
              onMouseLeave={() => engineRef.current?.setIsPointerOverUI(false)}
              className="bg-slate-950/95 backdrop-blur-xl border border-slate-800 rounded-3xl p-4 sm:p-5 w-full max-w-lg shadow-2xl pointer-events-auto space-y-4 max-h-[60vh] sm:max-h-[65vh] overflow-y-auto"
            >
              {/* Header minimize bar of the card */}
              <div className="flex items-center justify-between -mt-1 -mr-1 pb-1 border-b border-slate-800/60">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  {selectedUnitsList.length > 1 ? 'Comando de Pelotão' : selectedUnitsList.length === 1 ? 'Unidade Selecionada' : selectedBuilding ? 'Painel de Estrutura' : 'Recurso Natural'}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsBottomCardCollapsed(true)}
                    className="p-1 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-300 text-[11px] flex items-center gap-1 transition-colors"
                    title="Recolher painel para liberar a visão"
                  >
                    <span>Recolher</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUnitIds([]);
                      setSelectedEntity(null);
                    }}
                    className="p-1 rounded-lg bg-slate-900 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                    title="Desmarcar Seleção (ESC)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            {/* Multi-Unit Squad Selected */}
            {selectedUnitsList.length > 1 && (
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <Shield className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-white">
                        Pelotão Militar ({selectedUnitsList.length} Unidades)
                      </h3>
                      <div className="text-xs text-slate-400 flex items-center gap-2">
                        {soldierCount > 0 && (
                          <span className="text-blue-400 font-medium">{soldierCount}x Mosqueteiros</span>
                        )}
                        {soldierCount > 0 && villagerCount > 0 && <span>•</span>}
                        {villagerCount > 0 && (
                          <span className="text-amber-400 font-medium">{villagerCount}x Aldeões</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 font-mono text-slate-300">
                    {Math.round(totalSquadHealth)}/{totalSquadMaxHealth} HP
                  </span>
                </div>

                {/* Squad Health Bar */}
                <div className="w-full h-2 bg-slate-800 rounded-full mt-3 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${(totalSquadHealth / Math.max(1, totalSquadMaxHealth)) * 100}%` }}
                  />
                </div>

                {/* Quick Squad Filter Sub-selections */}
                {soldierCount > 0 && villagerCount > 0 && (
                  <div className="flex gap-2 mt-3 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        const sIds = selectedUnitsList.filter((u) => u.type === 'soldier').map((u) => u.id);
                        setSelectedUnitIds(sIds);
                        setSelectedEntity(sIds.length > 0 ? { id: sIds[0], kind: 'unit' } : null);
                        soundManager.playUnitResponseSound('soldier', sIds.length);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
                    >
                      <Sword className="w-3.5 h-3.5 text-blue-400" /> Apenas Soldados ({soldierCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const vIds = selectedUnitsList.filter((u) => u.type === 'villager').map((u) => u.id);
                        setSelectedUnitIds(vIds);
                        setSelectedEntity(vIds.length > 0 ? { id: vIds[0], kind: 'unit' } : null);
                        soundManager.playUnitResponseSound('villager', vIds.length);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
                    >
                      <Users className="w-3.5 h-3.5 text-amber-400" /> Apenas Aldeões ({villagerCount})
                    </button>
                  </div>
                )}

                {/* Squad Formation Toggles ('Box', 'Line', 'Spread') */}
                <div className="mt-3 pt-2.5 border-t border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <span>Formação de Movimento:</span>
                    <span className="text-amber-400 font-bold text-xs">
                      {squadFormation === 'box' ? 'Caixa (Padrão)' : squadFormation === 'line' ? 'Linha (Frontal)' : 'Dispersa (Anti-Área)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSquadFormation('box');
                        soundManager.playClickSound();
                      }}
                      className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        squadFormation === 'box'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm shadow-amber-500/20'
                          : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 border-slate-800'
                      }`}
                      title="Formação em Caixa: pelotão compacto em bloco, ótimo para marchas rápidas e manobras"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Caixa</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSquadFormation('line');
                        soundManager.playClickSound();
                      }}
                      className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        squadFormation === 'line'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm shadow-amber-500/20'
                          : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 border-slate-800'
                      }`}
                      title="Formação em Linha: fileira frontal horizontal, maximiza linha de tiro dos mosqueteiros"
                    >
                      <AlignJustify className="w-3.5 h-3.5" />
                      <span>Linha</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSquadFormation('spread');
                        soundManager.playClickSound();
                      }}
                      className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        squadFormation === 'spread'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm shadow-amber-500/20'
                          : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 border-slate-800'
                      }`}
                      title="Formação Dispersa: espaçamento aberto e solto, evita aglomeração e reduz dano em área"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Dispersa</span>
                    </button>
                  </div>
                </div>

                {/* Squad-Level Work Zone Controls */}
                {villagerCount > 0 && (
                  <div className="mt-3 p-3 rounded-2xl bg-slate-900/90 border border-emerald-500/30 space-y-2 text-xs shadow-inner">
                    <div className="flex items-center justify-between font-semibold text-slate-200">
                      <span className="flex items-center gap-1.5 text-emerald-400">
                        <Target className="w-4 h-4" />
                        <span>Zona de Trabalho do Pelotão ({villagerCount} Aldeões)</span>
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Raio: {gatherRadiusLimit >= 999 ? 'Livre' : `${gatherRadiusLimit}m`}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { r: 8, label: '8m Estrito' },
                        { r: 14, label: '14m Médio' },
                        { r: 22, label: '22m Amplo' },
                        { r: 999, label: 'Livre' },
                      ].map((preset) => {
                        const villagerIds = selectedUnitsList.filter((u) => u.type === 'villager').map((u) => u.id);
                        const isPresetActive = gatherRadiusLimit === preset.r;
                        return (
                          <button
                            key={preset.r}
                            type="button"
                            onClick={() => handleSetUnitWorkZoneRadius(villagerIds, preset.r)}
                            className={`py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                              isPresetActive
                                ? 'bg-emerald-500 text-slate-950 font-bold'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Villager Construction Menu if villagers are in squad */}
                {villagerCount > 0 && selectedUnitsList.some((u) => u.owner === playerSlot) && (
                  renderVillagerBuildCatalog()
                )}
              </div>
            )}

            {/* Single Unit Selected */}
            {selectedUnitsList.length <= 1 && selectedUnit && (
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400">
                      {selectedUnit.type === 'soldier' ? <Sword className="w-6 h-6" /> : <Users className="w-6 h-6" />}
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-white capitalize">
                        {selectedUnit.type === 'soldier' ? 'Soldado Mosqueteiro' : selectedUnit.type === 'cavalry' ? 'Cavalaria Montada' : 'Aldeão Construtor'}
                      </h3>
                      <div className="text-xs text-slate-400 flex items-center gap-2">
                        <span>Status: <span className="text-amber-400 font-medium capitalize">{selectedUnit.state}</span></span>
                        <span>•</span>
                        <span>Dano: {selectedUnit.attackDamage}</span>
                      </div>
                    </div>
                  </div>

                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 font-mono text-slate-300">
                    {Math.round(selectedUnit.health)}/{selectedUnit.maxHealth} HP
                  </span>
                </div>

                {/* Health Bar */}
                <div className="w-full h-2 bg-slate-800 rounded-full mt-3 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${(selectedUnit.health / selectedUnit.maxHealth) * 100}%` }}
                  />
                </div>

                {/* Tactical Formation Selector */}
                <div className="mt-3 pt-2.5 border-t border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <span>Formação do Pelotão:</span>
                    <span className="text-amber-400 font-bold text-xs">
                      {squadFormation === 'box' ? 'Caixa [1]' : squadFormation === 'line' ? 'Linha [2]' : 'Dispersa [3]'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSquadFormation('box');
                        soundManager.playClickSound();
                        triggerNotification('Formação em Caixa ativada', 'info');
                      }}
                      className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        squadFormation === 'box'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm'
                          : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 border-slate-800'
                      }`}
                      title="Formação em Caixa: bloco compacto para marcha regular"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Caixa [1]</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSquadFormation('line');
                        soundManager.playClickSound();
                        triggerNotification('Formação em Linha de Batalha ativada', 'info');
                      }}
                      className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        squadFormation === 'line'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm'
                          : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 border-slate-800'
                      }`}
                      title="Formação em Linha: fileira perpendicular, ideal para mosqueteiros dispararem em salva"
                    >
                      <AlignJustify className="w-3.5 h-3.5" />
                      <span>Linha [2]</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSquadFormation('spread');
                        soundManager.playClickSound();
                        triggerNotification('Formação Dispersa ativada', 'info');
                      }}
                      className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        squadFormation === 'spread'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm'
                          : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 border-slate-800'
                      }`}
                      title="Formação Dispersa: espaçamento aberto, reduz dano em área"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Dispersa [3]</span>
                    </button>
                  </div>
                </div>

                {/* Work Zone & Gathering Controls for Villager */}
                {selectedUnit.type === 'villager' && (
                  <div className="mt-3 p-3 rounded-2xl bg-slate-900/90 border border-emerald-500/30 space-y-2.5 text-xs shadow-inner">
                    <div className="flex items-center justify-between font-semibold text-slate-200">
                      <span className="flex items-center gap-1.5 text-emerald-400">
                        <Target className="w-4 h-4" />
                        <span>Zona de Trabalho do Aldeão</span>
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {(selectedUnit.gatherRadiusLimit || gatherRadiusLimit) >= 999
                          ? 'Livre'
                          : `${selectedUnit.gatherRadiusLimit || gatherRadiusLimit}m`}
                      </span>
                    </div>

                    {selectedUnit.state === 'gathering' && selectedUnit.gatherOrigin ? (
                      <div className="text-[11px] text-slate-400 space-y-1 bg-slate-950/70 p-2 rounded-xl border border-slate-800">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-300 font-medium flex items-center gap-1">
                            <Pickaxe className="w-3.5 h-3.5 text-amber-400 animate-bounce" /> Coletando na Zona
                          </span>
                          <span className="font-mono text-emerald-400">
                            {selectedUnit.gatherShiftSecondsRemaining !== undefined
                              ? `${Math.round(selectedUnit.gatherShiftSecondsRemaining)}s turno`
                              : 'Contínuo'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-800/80">
                          <span>Centro da Zona:</span>
                          <span className="font-mono text-slate-300">
                            X: {Math.round(selectedUnit.gatherOrigin.x)}, Z: {Math.round(selectedUnit.gatherOrigin.z)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 leading-tight">
                        Ao enviar para um recurso, o local se tornará o centro da zona e este aldeão não sairá do raio limite.
                      </p>
                    )}

                    {/* Visual Radius Slider for this Unit */}
                    <div className="space-y-1.5 pt-1 border-t border-slate-800">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Ajustar Raio Limite:</span>
                        <span className="font-mono text-amber-300 font-bold">
                          {(selectedUnit.gatherRadiusLimit || gatherRadiusLimit) >= 999
                            ? 'Sem Limite (Livre)'
                            : `${selectedUnit.gatherRadiusLimit || gatherRadiusLimit}m`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="4"
                        max="40"
                        step="2"
                        value={Math.min(40, selectedUnit.gatherRadiusLimit || gatherRadiusLimit)}
                        onChange={(e) => handleSetUnitWorkZoneRadius([selectedUnit.id], Number(e.target.value))}
                        className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                      <div className="grid grid-cols-4 gap-1 pt-0.5">
                        {[
                          { r: 8, label: '8m Estrito' },
                          { r: 14, label: '14m Médio' },
                          { r: 22, label: '22m Amplo' },
                          { r: 999, label: 'Livre' },
                        ].map((preset) => {
                          const currentR = selectedUnit.gatherRadiusLimit || gatherRadiusLimit;
                          const isActive = currentR === preset.r || (preset.r === 999 && currentR >= 999);
                          return (
                            <button
                              key={preset.r}
                              type="button"
                              onClick={() => handleSetUnitWorkZoneRadius([selectedUnit.id], preset.r)}
                              className={`py-1 rounded-lg text-[10px] font-semibold transition-all ${
                                isActive
                                  ? 'bg-emerald-500 text-slate-950 font-bold'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                              }`}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Center Re-anchor & Pause Buttons */}
                    <div className="flex gap-2 pt-1 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setIsSettingZoneCenter(true);
                          soundManager.playClickSound();
                          triggerNotification(
                            'Clique em qualquer árvore ou terreno para definir o novo centro da Zona de Trabalho.',
                            'info'
                          );
                        }}
                        className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
                          isSettingZoneCenter
                            ? 'bg-amber-500 text-slate-950 font-bold animate-pulse'
                            : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700'
                        }`}
                      >
                        <Target className="w-3.5 h-3.5" />
                        <span>{isSettingZoneCenter ? 'Clique no Mapa...' : 'Mudar Centro'}</span>
                      </button>

                      {selectedUnit.state === 'gathering' && (
                        <button
                          type="button"
                          onClick={() => {
                            const cmd = { type: 'move', unitId: selectedUnit.id, target: selectedUnit.position };
                            if (role === 'host' || role === 'single') handleIncomingCommand(cmd);
                            else multiRef.current?.sendToHost(cmd);
                            triggerNotification('Aldeão interrompeu a coleta e está livre.', 'info');
                          }}
                          className="py-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-300 border border-slate-700 text-[11px] font-semibold transition-colors"
                        >
                          Pausar
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Villager Construction Menu */}
                {selectedUnit.type === 'villager' && selectedUnit.owner === playerSlot && (
                  renderVillagerBuildCatalog()
                )}
              </div>
            )}

            {/* Incomplete Building Under Construction */}
            {selectedBuilding && !selectedBuilding.isComplete && (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                      <Hammer className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-white">
                          Canteiro: {selectedBuilding.type === 'house' ? 'Casa Colonial' : selectedBuilding.type === 'barracks' ? 'Quartel Militar' : 'Torre de Vigia'}
                        </h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 animate-pulse">
                          Em Obras
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {selectedBuilding.type === 'house'
                          ? 'Estrutura habitacional (+5 População quando pronta)'
                          : selectedBuilding.type === 'barracks'
                          ? 'Guarnição militar para infantaria e mosqueteiros'
                          : 'Fortificação defensiva com artilharia de guarda'}
                      </div>
                    </div>
                  </div>

                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 font-mono text-slate-300">
                    {Math.round(selectedBuilding.health)}/{selectedBuilding.maxHealth} HP
                  </span>
                </div>

                {/* Real-time Construction Progress Bar */}
                <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 space-y-3 shadow-inner">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <Hammer className="w-4 h-4 text-amber-400" /> Progresso da Construção:
                    </span>
                    <span className="text-amber-400 font-mono font-bold text-sm bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/30">
                      {Math.round(selectedBuilding.buildProgress || 0)}%
                    </span>
                  </div>

                  <div className="w-full h-3 bg-slate-950 rounded-full p-0.5 border border-slate-800 overflow-hidden relative shadow-inner">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 rounded-full transition-all duration-150 ease-out shadow-[0_0_10px_rgba(245,158,11,0.5)] relative overflow-hidden"
                      style={{ width: `${Math.min(100, Math.max(0, selectedBuilding.buildProgress || 0))}%` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
                    </div>
                  </div>

                  {/* Active builder count & estimated time */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                    <span>
                      Aldeões construindo: <strong className="text-white font-mono">{activeBuildersOnSelectedBuilding}</strong>
                    </span>
                    <span>
                      {selectedBuilding.buildProgress && selectedBuilding.buildProgress > 0
                        ? `~${Math.max(1, Math.ceil((100 - (selectedBuilding.buildProgress || 0)) / (Math.max(1, activeBuildersOnSelectedBuilding) * 5)))}s restantes`
                        : 'Aguardando construtores...'}
                    </span>
                  </div>
                </div>

                {/* Quick button to dispatch all available idle friendly villagers */}
                {selectedBuilding.owner === playerSlot && (
                  <button
                    type="button"
                    onClick={() => handleSendAllIdleVillagersToBuild(selectedBuilding.id)}
                    className="w-full p-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 transition-all hover:scale-[1.01]"
                  >
                    <Users className="w-4 h-4" />
                    <span>Designar Aldeões Disponíveis para Ajudar na Obra</span>
                  </button>
                )}
              </div>
            )}

            {/* Completed Building Selected */}
            {selectedBuilding && selectedBuilding.isComplete && (
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400">
                      {selectedBuilding.type === 'town_center' ? (
                        <Shield className="w-6 h-6 text-amber-400" />
                      ) : selectedBuilding.type === 'barracks' ? (
                        <Sword className="w-6 h-6 text-red-400" />
                      ) : selectedBuilding.type === 'tower' ? (
                        <Castle className="w-6 h-6 text-cyan-400" />
                      ) : selectedBuilding.type === 'sawmill' ? (
                        <TreePine className="w-6 h-6 text-emerald-400" />
                      ) : selectedBuilding.type === 'mine' ? (
                        <Coins className="w-6 h-6 text-yellow-400" />
                      ) : selectedBuilding.type === 'market' ? (
                        <Sparkles className="w-6 h-6 text-amber-300" />
                      ) : selectedBuilding.type === 'farm' ? (
                        <Sprout className="w-6 h-6 text-lime-400" />
                      ) : selectedBuilding.type === 'dock' ? (
                        <Compass className="w-6 h-6 text-blue-400" />
                      ) : (
                        <Home className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-white capitalize">
                        {BUILDING_CATALOG[selectedBuilding.type as BuildingType]?.name ||
                          (selectedBuilding.type === 'town_center' ? 'Centro da Vila' : selectedBuilding.type)}
                      </h3>
                      <div className="text-xs text-slate-400">
                        {selectedBuilding.type === 'town_center'
                          ? 'Edifício Principal de Treino e Gestão Colonial'
                          : selectedBuilding.type === 'barracks'
                          ? 'Recrutamento de Infantaria Militar e Mosqueteiros'
                          : selectedBuilding.type === 'tower'
                          ? 'Posto defensivo armado com tiros automáticos (Alcance: 12)'
                          : selectedBuilding.type === 'dock'
                          ? 'Cais e Estaleiro Naval (Construção de Barcos de Pesca e Comércio)'
                          : selectedBuilding.type === 'market'
                          ? 'Mercadão Central da Cidade (Câmbio e Venda de Mercadorias)'
                          : selectedBuilding.type === 'sawmill'
                          ? 'Serralheria & Madeireira (+35% rendimento de corte de madeira)'
                          : selectedBuilding.type === 'mine'
                          ? 'Mineradora & Pedreira (+40% rendimento de extração de ouro)'
                          : selectedBuilding.type === 'farm'
                          ? 'Fazenda Agrícola (Produção contínua e sustentável de alimento)'
                          : 'Habitação colonial (+5 limite de população)'}
                      </div>
                    </div>
                  </div>

                  <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 font-mono text-slate-300">
                    {Math.round(selectedBuilding.health)}/{selectedBuilding.maxHealth} HP
                  </span>
                </div>

                {/* Building Specific Actions & Training Queues */}
                {selectedBuilding.owner === playerSlot && (
                  <div className="mt-4 pt-3 border-t border-slate-800 space-y-3">
                    {/* Training Queue & Progress (for Town Center, Barracks, Dock) */}
                    {(selectedBuilding.type === 'town_center' ||
                      selectedBuilding.type === 'barracks' ||
                      selectedBuilding.type === 'dock') && (
                      <>
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          <span>Fila de Construção / Treino:</span>
                          {selectedBuilding.trainingQueue.length > 0 ? (
                            <span className="text-amber-400 font-mono font-bold flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                              {selectedBuilding.trainingQueue.length}/5 na fila
                            </span>
                          ) : (
                            <span className="text-slate-500 font-medium normal-case">0/5 vagas ocupadas</span>
                          )}
                        </div>

                        {selectedBuilding.trainingQueue.length > 0 && (
                          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-3 space-y-2.5 shadow-inner">
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2.5">
                                {selectedBuilding.trainingQueue[0].unitType === 'soldier' ? (
                                  <div className="p-1.5 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30">
                                    <Sword className="w-4 h-4" />
                                  </div>
                                ) : selectedBuilding.trainingQueue[0].unitType === 'cavalry' ? (
                                  <div className="p-1.5 rounded-xl bg-amber-600/20 text-amber-400 border border-amber-500/30">
                                    <PawPrint className="w-4 h-4" />
                                  </div>
                                ) : selectedBuilding.trainingQueue[0].unitType === 'fishing_boat' ||
                                  selectedBuilding.trainingQueue[0].unitType === 'trade_boat' ? (
                                  <div className="p-1.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                    <Compass className="w-4 h-4" />
                                  </div>
                                ) : (
                                  <div className="p-1.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                    <Users className="w-4 h-4" />
                                  </div>
                                )}
                                <div>
                                  <div className="font-bold text-white text-xs">
                                    {selectedBuilding.trainingQueue[0].unitType === 'soldier'
                                      ? 'Soldado Mosqueteiro'
                                      : selectedBuilding.trainingQueue[0].unitType === 'cavalry'
                                      ? 'Cavalaria Montada'
                                      : selectedBuilding.trainingQueue[0].unitType === 'fishing_boat'
                                      ? 'Barco de Pesca Fluvial'
                                      : selectedBuilding.trainingQueue[0].unitType === 'trade_boat'
                                      ? 'Barco Mercante de Rio'
                                      : 'Aldeão Construtor'}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    ~{Math.max(1, Math.ceil((100 - selectedBuilding.trainingQueue[0].progress) / (2 * 20)))}s restantes
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-xs text-amber-400 font-mono font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                                  {Math.round(selectedBuilding.trainingQueue[0].progress)}%
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCancelTrain(selectedBuilding.id, 0)}
                                  className="p-1 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-300 border border-slate-700 hover:border-red-500/40 transition-colors text-[11px]"
                                  title="Cancelar e reembolsar recursos"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="w-full h-2.5 bg-slate-950 rounded-full p-0.5 border border-slate-800 overflow-hidden relative shadow-inner">
                              <div
                                className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 rounded-full transition-all duration-100 ease-out shadow-[0_0_8px_rgba(245,158,11,0.5)] relative overflow-hidden"
                                style={{ width: `${Math.min(100, Math.max(0, selectedBuilding.trainingQueue[0].progress))}%` }}
                              >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
                              </div>
                            </div>

                            <div className="pt-1 border-t border-slate-800/80">
                              <div className="text-[10px] text-slate-400 mb-1.5 font-medium flex items-center justify-between">
                                <span>Próximos na Fila (Clique no X para cancelar):</span>
                                <span>{selectedBuilding.trainingQueue.length}/5 slots</span>
                              </div>
                              <div className="grid grid-cols-5 gap-1.5">
                                {[0, 1, 2, 3, 4].map((slotIdx) => {
                                  const item = selectedBuilding.trainingQueue[slotIdx];
                                  if (!item) {
                                    return (
                                      <div
                                        key={slotIdx}
                                        className="h-10 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 flex items-center justify-center text-[10px] text-slate-600 font-mono"
                                      >
                                        #{slotIdx + 1}
                                      </div>
                                    );
                                  }

                                  const isFirst = slotIdx === 0;
                                  return (
                                    <div
                                      key={slotIdx}
                                      className={`h-10 rounded-xl border p-1 relative flex items-center justify-between transition-all ${
                                        isFirst
                                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-sm'
                                          : 'bg-slate-800/80 border-slate-700/80 text-slate-200'
                                      }`}
                                    >
                                      <div className="flex items-center gap-1 pl-0.5">
                                        <span className="text-[10px] font-bold font-mono">#{slotIdx + 1}</span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleCancelTrain(selectedBuilding.id, slotIdx)}
                                        className="p-1 rounded-md bg-slate-900/80 hover:bg-red-500 text-slate-400 hover:text-white transition-colors"
                                        title="Cancelar treino"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Recruitment Action Buttons by Building Type */}
                    <div className="space-y-2">
                      {/* Town Center Recruitment */}
                      {selectedBuilding.type === 'town_center' && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={
                              myResources.food < 50 ||
                              selectedBuilding.trainingQueue.length >= 5 ||
                              myResources.pop + totalQueuedForPlayer >= myResources.maxPop
                            }
                            onClick={() => handleTrainUnit('villager', 1)}
                            className={`flex-1 p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                              myResources.food >= 50 &&
                              selectedBuilding.trainingQueue.length < 5 &&
                              myResources.pop + totalQueuedForPlayer < myResources.maxPop
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold border-amber-400 shadow-md shadow-amber-500/10 hover:scale-[1.01]'
                                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                          >
                            <Users className="w-4 h-4" />
                            <span>Treinar Aldeão (50 Comida) [V]</span>
                          </button>

                          <button
                            type="button"
                            disabled={
                              myResources.food < 50 ||
                              selectedBuilding.trainingQueue.length >= 5 ||
                              myResources.pop + totalQueuedForPlayer >= myResources.maxPop
                            }
                            onClick={() => handleTrainUnit('villager', 5)}
                            className={`px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                              myResources.food >= 50 &&
                              selectedBuilding.trainingQueue.length < 5 &&
                              myResources.pop + totalQueuedForPlayer < myResources.maxPop
                                ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700'
                                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                            title="Enfileirar múltiplos aldeões até lotar a fila"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+5</span>
                          </button>
                        </div>
                      )}

                      {/* Barracks Recruitment */}
                      {selectedBuilding.type === 'barracks' && (
                        <>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={
                              myResources.food < 80 ||
                              (myResources.gold || 0) < 40 ||
                              selectedBuilding.trainingQueue.length >= 5 ||
                              myResources.pop + totalQueuedForPlayer >= myResources.maxPop
                            }
                            onClick={() => handleTrainUnit('soldier', 1)}
                            className={`flex-1 p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                              myResources.food >= 80 &&
                              (myResources.gold || 0) >= 40 &&
                              selectedBuilding.trainingQueue.length < 5 &&
                              myResources.pop + totalQueuedForPlayer < myResources.maxPop
                                ? 'bg-red-600 hover:bg-red-500 text-white font-bold border-red-500 shadow-md shadow-red-600/10 hover:scale-[1.01]'
                                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                          >
                            <Sword className="w-4 h-4" />
                            <span>Treinar Mosqueteiro (80 Alim + 40 Ouro) [S]</span>
                          </button>

                          <button
                            type="button"
                            disabled={
                              myResources.food < 80 ||
                              (myResources.gold || 0) < 40 ||
                              selectedBuilding.trainingQueue.length >= 5 ||
                              myResources.pop + totalQueuedForPlayer >= myResources.maxPop
                            }
                            onClick={() => handleTrainUnit('soldier', 5)}
                            className={`px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                              myResources.food >= 80 &&
                              (myResources.gold || 0) >= 40 &&
                              selectedBuilding.trainingQueue.length < 5 &&
                              myResources.pop + totalQueuedForPlayer < myResources.maxPop
                                ? 'bg-slate-800 hover:bg-slate-700 text-red-300 border-slate-700'
                                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                            title="Enfileirar múltiplos mosqueteiros"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+5</span>
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={
                              !canAfford(myResources, UNIT_COSTS.cavalry) ||
                              selectedBuilding.trainingQueue.length >= 5 ||
                              myResources.pop + totalQueuedForPlayer >= myResources.maxPop
                            }
                            onClick={() => handleTrainUnit('cavalry', 1)}
                            className={`flex-1 p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                              canAfford(myResources, UNIT_COSTS.cavalry) &&
                              selectedBuilding.trainingQueue.length < 5 &&
                              myResources.pop + totalQueuedForPlayer < myResources.maxPop
                                ? 'bg-amber-700 hover:bg-amber-600 text-white font-bold border-amber-500 shadow-md shadow-amber-700/10 hover:scale-[1.01]'
                                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                          >
                            <PawPrint className="w-4 h-4" />
                            <span>Treinar Cavalaria (60 Alim + 80 Ouro) [C]</span>
                          </button>

                          <button
                            type="button"
                            disabled={
                              !canAfford(myResources, UNIT_COSTS.cavalry) ||
                              selectedBuilding.trainingQueue.length >= 5 ||
                              myResources.pop + totalQueuedForPlayer >= myResources.maxPop
                            }
                            onClick={() => handleTrainUnit('cavalry', 5)}
                            className={`px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                              canAfford(myResources, UNIT_COSTS.cavalry) &&
                              selectedBuilding.trainingQueue.length < 5 &&
                              myResources.pop + totalQueuedForPlayer < myResources.maxPop
                                ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700'
                                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                            title="Enfileirar múltiplas unidades de cavalaria"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+5</span>
                          </button>
                        </div>
                        </>
                      )}

                      {/* Dock Naval Shipyard Construction */}
                      {selectedBuilding.type === 'dock' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={
                              !canAfford(myResources, UNIT_COSTS.fishing_boat) ||
                              selectedBuilding.trainingQueue.length >= 5 ||
                              myResources.pop + totalQueuedForPlayer >= myResources.maxPop
                            }
                            onClick={() => handleTrainUnit('fishing_boat', 1)}
                            className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${
                              canAfford(myResources, UNIT_COSTS.fishing_boat) &&
                              selectedBuilding.trainingQueue.length < 5 &&
                              myResources.pop + totalQueuedForPlayer < myResources.maxPop
                                ? 'bg-blue-600 hover:bg-blue-500 text-white font-bold border-blue-400 shadow-md shadow-blue-500/10 hover:scale-[1.01]'
                                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Compass className="w-4 h-4 text-cyan-300" />
                              <span>Barco de Pesca [P]</span>
                            </div>
                            <span className="font-mono text-[11px] text-cyan-200">{describeCost(UNIT_COSTS.fishing_boat)}</span>
                          </button>

                          <button
                            type="button"
                            disabled={
                              !canAfford(myResources, UNIT_COSTS.trade_boat) ||
                              selectedBuilding.trainingQueue.length >= 5 ||
                              myResources.pop + totalQueuedForPlayer >= myResources.maxPop
                            }
                            onClick={() => handleTrainUnit('trade_boat', 1)}
                            className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${
                              canAfford(myResources, UNIT_COSTS.trade_boat) &&
                              selectedBuilding.trainingQueue.length < 5 &&
                              myResources.pop + totalQueuedForPlayer < myResources.maxPop
                                ? 'bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-md shadow-amber-500/10 hover:scale-[1.01]'
                                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-yellow-200" />
                              <span>Barco Mercante [M]</span>
                            </div>
                            <span className="font-mono text-[11px] text-yellow-200">{describeCost(UNIT_COSTS.trade_boat)}</span>
                          </button>
                        </div>
                      )}

                      {/* Building Maintenance: reparo e demolicao */}
                      <div className="space-y-2">
                        {selectedBuilding.health < selectedBuilding.maxHealth && (
                          <button
                            type="button"
                            disabled={!nearestVillagerToSelectedBuilding}
                            onClick={() => {
                              if (nearestVillagerToSelectedBuilding) {
                                handleRepairBuilding(nearestVillagerToSelectedBuilding.id, selectedBuilding.id);
                              }
                            }}
                            className="w-full p-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-900 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-2 transition-all"
                          >
                            <Wrench className="w-4 h-4" />
                            <span>
                              Reparar ({REPAIR_HP_PER_TICK * 20} HP/s · {REPAIR_WOOD_PER_HP * 100} M por 100 HP)
                            </span>
                          </button>
                        )}
                        {selectedBuilding.type !== 'town_center' && (
                          <button
                            type="button"
                            onClick={() => handleDemolishBuilding(selectedBuilding.id)}
                            className="w-full p-2.5 rounded-xl bg-slate-800 hover:bg-red-900/70 border border-slate-700 hover:border-red-500/60 text-slate-300 hover:text-red-200 font-semibold text-xs flex items-center justify-center gap-2 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Demolir (devolve 50%)</span>
                          </button>
                        )}
                      </div>

                      {/* Grand Market Hub Actions */}
                      {selectedBuilding.type === 'market' && (
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => setIsEmpireCatalogOpen(true)}
                            className="w-full p-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.01]"
                          >
                            <Sparkles className="w-4 h-4" />
                            <span>Abrir Mercadão de Câmbio de Recursos & Catálogo [M]</span>
                          </button>
                          <p className="text-[11px] text-slate-400 text-center">
                            Gera renda passiva municipal (+1 ouro/segundo) e permite comprar/vender recursos excedentes.
                          </p>
                        </div>
                      )}

                      {/* Farm Information Status */}
                      {selectedBuilding.type === 'farm' && (
                        <div className="p-3 rounded-xl bg-lime-950/40 border border-lime-800/60 text-lime-300 text-xs flex items-center gap-2.5">
                          <Sprout className="w-5 h-5 text-lime-400 shrink-0" />
                          <div>
                            <div className="font-bold">Colheita Agrícola Sustentável em Operação</div>
                            <div className="text-[10px] text-lime-400/80">
                              Gera automaticamente +2 alimento/segundo de forma perene sem esgotar o talhão.
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Sawmill Information Status */}
                      {selectedBuilding.type === 'sawmill' && (
                        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2.5">
                          <TreePine className="w-5 h-5 text-emerald-400 shrink-0" />
                          <div>
                            <div className="font-bold">Oficina de Corte Ativa (+35% Coleta de Madeira)</div>
                            <div className="text-[10px] text-emerald-400/80">
                              Todos os lenhadores da colônia colhem madeira com velocidade amplificada.
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Mine Information Status */}
                      {selectedBuilding.type === 'mine' && (
                        <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs flex items-center gap-2.5">
                          <Coins className="w-5 h-5 text-amber-400 shrink-0" />
                          <div>
                            <div className="font-bold">Pedreira & Forja Operacional (+40% Extração)</div>
                            <div className="text-[10px] text-amber-400/80">
                              Aumenta em 40% a taxa de rendimento de extração de jazidas de minério de ouro.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Resource Node Selected */}
            {selectedResource && (
              <div className="space-y-4">
                {/* Header Information */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-inner ${
                        selectedResource.type === 'tree'
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : selectedResource.type === 'gold_mine'
                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                          : selectedResource.type === 'stone'
                          ? 'bg-slate-500/15 border-slate-400/30 text-slate-300'
                          : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                      }`}
                    >
                      {selectedResource.type === 'tree' ? (
                        selectedResource.isRegrowing ? (
                          <Sprout className="w-6 h-6 animate-pulse" />
                        ) : (
                          <TreePine className="w-6 h-6" />
                        )
                      ) : selectedResource.type === 'gold_mine' ? (
                        <Coins className="w-6 h-6" />
                      ) : selectedResource.type === 'stone' ? (
                        <Pickaxe className="w-6 h-6" />
                      ) : (
                        <Apple className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-white">
                          {selectedResource.type === 'tree'
                            ? selectedResource.harvestMode === 'sustainable'
                              ? 'Bosque Sustentável (Reflorestamento)'
                              : 'Floresta de Madeira (Desmatamento)'
                            : selectedResource.type === 'gold_mine'
                            ? 'Jazida de Minério de Ouro'
                            : selectedResource.type === 'stone'
                            ? 'Pedreira de Pedra Bruta'
                            : 'Arbusto de Frutas Silvestres'}
                        </h3>
                        {selectedResource.isRegrowing && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 animate-pulse">
                            Em Crescimento
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>
                          {selectedResource.isRegrowing
                            ? `Muda em desenvolvimento (${Math.round(selectedResource.regrowthProgress || 0)}% completo)`
                            : selectedResource.type === 'tree'
                            ? 'Madeira para habitações, quartéis e torres'
                            : selectedResource.type === 'gold_mine'
                            ? 'Ouro nobre para infantaria e fortificações'
                            : selectedResource.type === 'stone'
                            ? 'Pedra bruta para pedreiras, torres e muralhas'
                            : 'Alimento rápido para recrutar novos colonos'}
                        </span>
                        <span>•</span>
                        <span className="text-amber-400 font-medium font-mono">
                          {activeGatherersOnSelectedResource} Aldeão(ões) colhendo
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 uppercase font-medium">Reserva</div>
                    <div
                      className={`text-lg font-mono font-bold ${
                        selectedResource.type === 'tree'
                          ? 'text-emerald-400'
                          : selectedResource.type === 'gold_mine'
                          ? 'text-amber-400'
                          : selectedResource.type === 'stone'
                          ? 'text-slate-300'
                          : 'text-rose-400'
                      }`}
                    >
                      {selectedResource.isRegrowing
                        ? `${Math.round(selectedResource.regrowthProgress || 0)}%`
                        : `${Math.round(selectedResource.remaining)}/${selectedResource.maxCapacity || (selectedResource.type === 'tree' ? 150 : selectedResource.type === 'gold_mine' ? 600 : selectedResource.type === 'stone' ? 700 : 350)}`}
                    </div>
                  </div>
                </div>

                {/* Specific Forestry Controls for Trees */}
                {selectedResource.type === 'tree' && (
                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    {/* Grove Cluster Overview & Status */}
                    <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-white">
                          <TreePine className="w-4 h-4 text-emerald-400" />
                          <span>{selectedResource.clusterName || 'Bosque Nativo'}</span>
                        </div>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                          {groveTrees.length} árvores no bosque
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="p-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
                          <div className="text-[10px] text-slate-400">Maduras</div>
                          <div className="font-mono font-bold text-emerald-400">{matureGroveCount}</div>
                        </div>
                        <div className="p-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
                          <div className="text-[10px] text-slate-400">Em Mudas</div>
                          <div className="font-mono font-bold text-green-300">{regrowingGroveCount}</div>
                        </div>
                        <div className="p-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
                          <div className="text-[10px] text-slate-400">Modo Bosque</div>
                          <div className={`font-mono font-bold ${isGroveAllSustainable ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {isGroveAllSustainable ? 'Sustentável' : 'Misto / Corte'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Grove-Wide Reforestation vs Clear-Cut Controls */}
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                        <span>Configuração de Reflorestamento:</span>
                        <span className="text-[10px] text-emerald-400 font-normal">Aplica a todas as {groveTrees.length} árvores</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleSetGroveHarvestMode(selectedResource.clusterId || selectedResource.id, 'sustainable')}
                          className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                            isGroveAllSustainable
                              ? 'bg-emerald-500/25 border-emerald-500 text-white shadow-md shadow-emerald-500/20 ring-1 ring-emerald-400'
                              : 'bg-emerald-950/40 hover:bg-emerald-900/40 border-emerald-600/40 text-emerald-200'
                          }`}
                          title="Garante que TODAS as árvores deste bosque renasçam como mudas após o corte"
                        >
                          <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-300">
                            <Sprout className="w-4 h-4 text-emerald-400" />
                            <span>Reflorestar Todo o Bosque</span>
                          </div>
                          <span className="text-[10px] text-emerald-300/80 leading-tight">
                            Todas as {groveTrees.length} árvores brotam mudas e regeneram continuamente madeira!
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSetGroveHarvestMode(selectedResource.clusterId || selectedResource.id, 'clear_cut')}
                          className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                            !isGroveAllSustainable
                              ? 'bg-amber-500/20 border-amber-500 text-white shadow-sm'
                              : 'bg-slate-900/80 hover:bg-slate-800 border-slate-800 text-slate-400'
                          }`}
                          title="Remove permanentemente as árvores deste bosque para liberar terreno"
                        >
                          <div className="flex items-center gap-1.5 font-bold text-xs text-amber-300">
                            <Trash2 className="w-4 h-4 text-amber-400" />
                            <span>Desmatar Todo o Bosque</span>
                          </div>
                          <span className="text-[10px] text-slate-400 leading-tight">
                            Corte definitivo sem replantio para liberar o chão da colônia.
                          </span>
                        </button>
                      </div>

                      {/* Single tree toggle */}
                      <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800">
                        <span className="text-slate-400 text-[11px]">Esta árvore selecionada:</span>
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleResourceHarvestMode(
                              selectedResource.id,
                              selectedResource.harvestMode === 'sustainable' ? 'clear_cut' : 'sustainable'
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                            selectedResource.harvestMode === 'sustainable'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {selectedResource.harvestMode === 'sustainable' ? (
                            <>
                              <Sprout className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Reflorestar (Muda Ativa)</span>
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-3.5 h-3.5 text-amber-400" />
                              <span>Desmatar (Sem Muda)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Visual Work Zone Radius & Shift Selector */}
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <Target className="w-4 h-4" />
                          <span>Seletor de Zona de Trabalho (Raio Limite):</span>
                        </span>
                        <span className="text-[10px] text-emerald-300 font-mono font-bold">
                          {gatherRadiusLimit >= 999 ? 'Busca Livre' : `Raio: ${gatherRadiusLimit} metros`}
                        </span>
                      </div>

                      <div className="p-3 rounded-2xl bg-slate-950/80 border border-emerald-500/30 space-y-2.5 text-xs shadow-inner">
                        {/* Interactive Range Slider */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span>Ajustar Raio da Zona:</span>
                            <span className="font-mono text-emerald-400 font-bold">
                              {gatherRadiusLimit >= 999 ? 'Infinito (Sem Limite)' : `${gatherRadiusLimit}m`}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="4"
                            max="40"
                            step="2"
                            value={Math.min(40, gatherRadiusLimit)}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setGatherRadiusLimit(val);
                            }}
                            className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Presets */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1">
                          {[
                            { r: 8, label: '8m', title: 'Bosque Estrito' },
                            { r: 14, label: '14m', title: 'Bosque Médio' },
                            { r: 22, label: '22m', title: 'Área Local' },
                            { r: 35, label: '35m', title: 'Setor Amplo' },
                            { r: 999, label: 'Livre', title: 'Todo Mapa' },
                          ].map((preset) => (
                            <button
                              key={preset.r}
                              type="button"
                              onClick={() => {
                                setGatherRadiusLimit(preset.r);
                                soundManager.playClickSound();
                                triggerNotification(
                                  `Raio da Zona de Trabalho definido para ${preset.r >= 999 ? 'Sem Limite' : `${preset.r}m`} (${preset.title}).`,
                                  'info'
                                );
                              }}
                              className={`py-1 px-1 rounded-xl text-center transition-all ${
                                gatherRadiusLimit === preset.r
                                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                              }`}
                              title={preset.title}
                            >
                              <div className="font-bold text-[10px]">{preset.label}</div>
                              <div className="text-[9px] opacity-75">{preset.title}</div>
                            </button>
                          ))}
                        </div>

                        {/* Live Coverage & Strict Leash Feedback */}
                        <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                          <span className="flex items-center gap-1 text-emerald-300">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>
                              {previewZone
                                ? `${previewZone.treesCovered} árvore(s) cobertas nesta zona`
                                : `${groveTrees.length} árvores no bosque`}
                            </span>
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 font-mono">
                            Trava Estrita no Raio
                          </span>
                        </div>
                      </div>

                      {/* Work Shift Duration (Optional Timer) */}
                      <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
                        <span className="text-[11px] text-slate-400">Turno de Coleta:</span>
                        <div className="flex gap-1">
                          {[
                            { s: 0, label: 'Contínuo' },
                            { s: 60, label: '1 min' },
                            { s: 120, label: '2 min' },
                            { s: 180, label: '3 min' },
                          ].map((t) => (
                            <button
                              key={t.s}
                              type="button"
                              onClick={() => {
                                setGatherShiftDuration(t.s);
                                soundManager.playClickSound();
                              }}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all ${
                                gatherShiftDuration === t.s
                                  ? 'bg-amber-500 text-slate-950 font-bold'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* If currently in regrowth */}
                    {selectedResource.isRegrowing ? (
                      <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between text-xs text-emerald-300">
                          <span className="flex items-center gap-1.5 font-bold">
                            <Sprout className="w-4 h-4 animate-bounce" /> Tempo de Crescimento da Muda:
                          </span>
                          <span className="font-mono font-bold">
                            {Math.round(selectedResource.regrowthProgress || 0)}%
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-950 rounded-full p-0.5 border border-slate-800 overflow-hidden relative">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full transition-all duration-100"
                            style={{ width: `${Math.min(100, Math.max(0, selectedResource.regrowthProgress || 0))}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-slate-400">
                          A muda está se desenvolvendo. Em poucos segundos a árvore estará adulta para nova extração!
                        </div>
                      </div>
                    ) : (
                      /* Dispatch Villagers Action Buttons */
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <button
                            type="button"
                            onClick={() => handleAssignVillagersToResource(selectedResource.id, 1)}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                            title="Enviar 1 aldeão livre para colher"
                          >
                            <Users className="w-3.5 h-3.5 text-amber-400" />
                            <span>+1 Aldeão</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleAssignVillagersToResource(selectedResource.id, 3)}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                            title="Enviar até 3 aldeões livres para colher"
                          >
                            <Users className="w-3.5 h-3.5 text-amber-400" />
                            <span>+3 Aldeões</span>
                          </button>

                          {selectedUnitsList.length > 0 && villagerCount > 0 && (
                            <button
                              type="button"
                              onClick={() => handleAssignSelectedSquadToResource(selectedResource.id)}
                              className="p-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                              title="Enviar aldeões atualmente selecionados no pelotão"
                            >
                              <Users className="w-3.5 h-3.5" />
                              <span>Pelotão ({villagerCount})</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleClearForestCluster(selectedResource.id)}
                            className="p-2 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-xs font-semibold text-emerald-200 flex items-center justify-center gap-1.5 transition-colors"
                            title="Marcar todas as árvores vizinhas para desmatamento e colheita em cadeia"
                          >
                            <TreePine className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Limpar Bosque</span>
                          </button>
                        </div>

                        {/* Immediate Clear Option */}
                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                          <span className="text-[11px] text-slate-400">Precisa desobstruir o chão agora?</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveResourceImmediately(selectedResource.id)}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-300 border border-slate-700 hover:border-red-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors"
                            title="Remover árvore imediatamente do mapa para posicionar construções"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            <span>Remover Árvore Agora</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Specific Gold Mine Controls */}
                {selectedResource.type === 'gold_mine' && (
                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleAssignVillagersToResource(selectedResource.id, 1)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Users className="w-3.5 h-3.5 text-amber-400" />
                        <span>+1 Minerador</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAssignVillagersToResource(selectedResource.id, 3)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Users className="w-3.5 h-3.5 text-amber-400" />
                        <span>+3 Mineradores</span>
                      </button>

                      {selectedUnitsList.length > 0 && villagerCount > 0 && (
                        <button
                          type="button"
                          onClick={() => handleAssignSelectedSquadToResource(selectedResource.id)}
                          className="p-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Pelotão ({villagerCount})</span>
                        </button>
                      )}
                    </div>

                    <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 flex items-start gap-2">
                      <Coins className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-amber-300 font-semibold block">Exploração Mineral Contínua:</strong>
                        <span>
                          Ao esgotar esta jazida de ouro, os aldeões automaticamente procuram e migram para o próximo filão mineral mais próximo.
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Specific Stone Quarry Controls */}
                {selectedResource.type === 'stone' && (
                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleAssignVillagersToResource(selectedResource.id, 1)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Users className="w-3.5 h-3.5 text-slate-300" />
                        <span>+1 Pedreiro</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAssignVillagersToResource(selectedResource.id, 3)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Users className="w-3.5 h-3.5 text-slate-300" />
                        <span>+3 Pedreiros</span>
                      </button>

                      {selectedUnitsList.length > 0 && villagerCount > 0 && (
                        <button
                          type="button"
                          onClick={() => handleAssignSelectedSquadToResource(selectedResource.id)}
                          className="p-2 rounded-xl bg-slate-400 hover:bg-slate-300 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Pelotão ({villagerCount})</span>
                        </button>
                      )}
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-700/20 border border-slate-600/40 text-xs text-slate-300/90 flex items-start gap-2">
                      <Pickaxe className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-200 font-semibold block">Extração Contínua de Pedra:</strong>
                        <span>
                          A Mineradora &amp; Pedreira dá +40% de rendimento. Ao esgotar esta pedreira, os aldeões migram para a próxima automaticamente.
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Specific Food Bush Controls */}
                {selectedResource.type === 'food_bush' && (
                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleAssignVillagersToResource(selectedResource.id, 1)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Users className="w-3.5 h-3.5 text-rose-400" />
                        <span>+1 Coletor</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAssignVillagersToResource(selectedResource.id, 3)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Users className="w-3.5 h-3.5 text-rose-400" />
                        <span>+3 Coletores</span>
                      </button>

                      {selectedUnitsList.length > 0 && villagerCount > 0 && (
                        <button
                          type="button"
                          onClick={() => handleAssignSelectedSquadToResource(selectedResource.id)}
                          className="p-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>Pelotão ({villagerCount})</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          )
        )}
      </footer>
      )}

      {/* LAN CHAT MODAL / DRAWER */}
      {isHudVisible && isChatOpen && (
        <div className="absolute top-16 right-4 w-80 bg-slate-950/95 backdrop-blur-xl border border-slate-800 rounded-3xl p-4 shadow-2xl z-50 flex flex-col h-96">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs font-bold text-slate-300">
            <span className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-amber-400" /> Chat da Partida (LAN)
            </span>
            <button
              type="button"
              onClick={() => setIsChatOpen(false)}
              className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded-lg bg-slate-900"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-3 space-y-2 text-xs">
            {chatMessages.length === 0 ? (
              <div className="text-center text-slate-500 py-10">Nenhuma mensagem ainda.</div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div key={idx} className="bg-slate-900/80 p-2 rounded-xl border border-slate-800/80">
                  <span className="font-bold text-amber-400">{msg.sender}: </span>
                  <span className="text-slate-200">{msg.message}</span>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSendChat} className="flex gap-2 pt-2 border-t border-slate-800">
            <input
              type="text"
              placeholder="Digite sua mensagem..."
              value={currentChatInput}
              onChange={(e) => setCurrentChatInput(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              className="p-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition-colors font-bold"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* TACTICAL CONTROLS & SHORTCUTS GUIDE MODAL */}
      {showControlsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto">
          <div className="bg-slate-900/95 border border-slate-700/80 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-base">
                <Info className="w-5 h-5 text-cyan-400" />
                <span>Guia de Navegação e Controles RTS</span>
              </div>
              <button
                type="button"
                onClick={() => setShowControlsModal(false)}
                className="p-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs px-2.5 py-1 transition-colors"
              >
                ✕ Fechar
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-amber-400" /> Câmera e Exploração do Mapa
                </div>
                <ul className="space-y-1 text-slate-400">
                  <li>• <kbd className="font-mono text-slate-200">L</kbd>: <strong className="text-amber-300">Travar Movimento Automático</strong> (Fixa a câmera para explorar sem rolagem acidental)</li>
                  <li>• <kbd className="font-mono text-slate-200">WASD</kbd> ou <kbd className="font-mono text-slate-200">Setas</kbd>: Mover visão livremente</li>
                  <li>• <strong className="text-slate-200">Bordas da Tela (Edge Scroll)</strong>: Rolagem suave automática ao aproximar o mouse (desativa ao passar sobre botões)</li>
                  <li>• <strong className="text-slate-200">Botão do Meio do Mouse ou Toque (Mobile)</strong>: Arraste para Pan rápido no mapa</li>
                  <li>• <strong className="text-slate-200">Minimapa</strong>: Clique para teleportar a visão (botão no topo para recolher/expandir ou tecla <kbd className="font-mono text-slate-200">M</kbd>)</li>
                  <li>• <kbd className="font-mono text-slate-200">Espaço</kbd>: Centralizar no Centro da Vila ou Pelotão selecionado</li>
                </ul>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-cyan-400" /> Modos de HUD e Responsividade
                </div>
                <ul className="space-y-1 text-slate-400">
                  <li>• <kbd className="font-mono text-slate-200">H</kbd>: <strong className="text-white">Ocultar / Mostrar HUD</strong> (Modo Cinemático com 100% de visão limpa)</li>
                  <li>• <kbd className="font-mono text-slate-200">C</kbd>: <strong className="text-white">Modo Tático Compacto</strong> (Barra ultra-fina para telas menores e máxima área útil)</li>
                  <li>• <strong className="text-slate-200">Modo Espiar (Hover Peek)</strong>: Com o HUD oculto, aproxime o mouse do topo para revelar os recursos temporariamente!</li>
                  <li>• <strong className="text-slate-200">Painel de Seleção Recolhível</strong>: Clique em "Recolher" no card inferior para minimizar a barra de unidades.</li>
                </ul>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-blue-400" /> Formações e Ordens Táticas
                </div>
                <ul className="space-y-1 text-slate-400">
                  <li>• <kbd className="font-mono text-slate-200">1</kbd>: Formação em Caixa (Marcha em bloco compacto)</li>
                  <li>• <kbd className="font-mono text-slate-200">2</kbd>: Formação em Linha (Fileira frontal de batalha, tiro amplo)</li>
                  <li>• <kbd className="font-mono text-slate-200">3</kbd>: Formação Dispersa (Espaçamento aberto evasivo)</li>
                  <li>• <strong className="text-slate-200">Botão Direito</strong>: Ordem de marcha, ataque, coleta ou reparo</li>
                </ul>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <TreePine className="w-4 h-4 text-emerald-400" /> Produção e Manejo de Recursos
                </div>
                <ul className="space-y-1 text-slate-400">
                  <li>• <kbd className="font-mono text-slate-200">Z</kbd>: <strong className="text-emerald-300">Zonas de Trabalho Delimitadas</strong>: Configura o raio limite de extração (8m, 14m, 22m, etc.). Ao enviar aldeões para um recurso, eles fixam o local como centro e nunca saem desmatando o mapa inteiro descontroladamente!</li>
                  <li>• <kbd className="font-mono text-slate-200">V</kbd>: Recrutar Aldeão (Com Centro da Vila selecionado)</li>
                  <li>• <kbd className="font-mono text-slate-200">S</kbd>: Recrutar Mosqueteiro (Com Quartel selecionado)</li>
                  <li>• <kbd className="font-mono text-slate-200">C</kbd>: Recrutar Cavalaria (Com Quartel selecionado)</li>
                  <li>• <strong className="text-slate-200">Fila de Produção de 5 Slots</strong>: Enfileire até 5 unidades; clique no ✕ de qualquer slot para cancelar e reembolsar 100% dos recursos!</li>
                  <li>• <strong className="text-slate-200">Manejo Sustentável vs Desmatamento</strong>: Selecione árvores para escolher entre remoção definitiva ou plantio automático de mudas com renovação contínua.</li>
                  <li>• <strong className="text-slate-200">Encadeamento Contínuo</strong>: Aldeões e mineradores buscam a próxima árvore ou mina próxima dentro da zona ao esgotar o alvo!</li>
                </ul>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Hammer className="w-4 h-4 text-amber-400" /> Construção Dinâmica com Aldeões
                </div>
                <ul className="space-y-1 text-slate-400">
                  <li>• <kbd className="font-mono text-slate-200">Q</kbd>: Casa Colonial (+5 Limite de População)</li>
                  <li>• <kbd className="font-mono text-slate-200">W</kbd>: Quartel Militar (Treinamento de Mosqueteiros)</li>
                  <li>• <kbd className="font-mono text-slate-200">E</kbd>: Torre de Vigia (Guarda defensiva armada)</li>
                  <li>• <strong className="text-slate-200">Canteiro de Obras</strong>: Edifícios começam com andaimes e crescem conforme os aldeões martelam!</li>
                  <li>• <strong className="text-slate-200">Trabalho em Equipe</strong>: Múltiplos aldeões na mesma obra aceleram o tempo!</li>
                </ul>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowControlsModal(false)}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors shadow-lg shadow-amber-500/10"
            >
              Entendido, Continuar Batalha
            </button>
          </div>
        </div>
      )}

      {/* WORK ZONE CONFIGURATOR MODAL */}
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

      {isWorkZoneModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto">
          <div
            onMouseEnter={() => engineRef.current?.setIsPointerOverUI(true)}
            onMouseLeave={() => engineRef.current?.setIsPointerOverUI(false)}
            className="bg-slate-900/95 border border-emerald-500/40 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 text-slate-200"
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Target className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    Configurador de Zonas de Trabalho
                  </h2>
                  <p className="text-xs text-slate-400">
                    Defina o raio de ação para que os aldeões não saiam desmatando o mapa inteiro.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWorkZoneModalOpen(false)}
                className="p-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs px-2.5 py-1 transition-colors"
              >
                ✕ Fechar
              </button>
            </div>

            {/* Radius Slider & Presets */}
            <div className="space-y-3 bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">Raio Limite da Zona:</span>
                <span className="text-sm font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-lg border border-emerald-500/20">
                  {gatherRadiusLimit >= 999 ? 'Sem Limite (Livre)' : `${gatherRadiusLimit} metros`}
                </span>
              </div>

              <input
                type="range"
                min="4"
                max="40"
                step="2"
                value={Math.min(40, gatherRadiusLimit)}
                onChange={(e) => setGatherRadiusLimit(Number(e.target.value))}
                className="w-full accent-emerald-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
              />

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {[
                  { r: 8, label: '8m', title: 'Bosque Estrito', desc: 'Apenas árvores imediatas' },
                  { r: 14, label: '14m', title: 'Padrão', desc: 'Bosque completo' },
                  { r: 22, label: '22m', title: 'Área Local', desc: 'Bosque e margens' },
                  { r: 35, label: '35m', title: 'Amplo', desc: 'Setor expandido' },
                  { r: 999, label: 'Livre', title: 'Sem Limite', desc: 'Todo o mapa' },
                ].map((preset) => (
                  <button
                    key={preset.r}
                    type="button"
                    onClick={() => {
                      setGatherRadiusLimit(preset.r);
                      soundManager.playClickSound();
                    }}
                    className={`p-2 rounded-xl text-center border transition-all ${
                      gatherRadiusLimit === preset.r
                        ? 'bg-emerald-500/25 border-emerald-500 text-emerald-300 font-bold shadow-md shadow-emerald-500/10 ring-1 ring-emerald-400'
                        : 'bg-slate-900/90 hover:bg-slate-800 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="font-bold text-xs">{preset.label}</div>
                    <div className="text-[10px] text-slate-400">{preset.title}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div
                onClick={() => setShowWorkZones3D((prev) => !prev)}
                className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-colors ${
                  showWorkZones3D ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-slate-800/60 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-emerald-400" />
                  <span>Círculos 3D no Mapa</span>
                </div>
                <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-slate-900">
                  {showWorkZones3D ? 'LIGADO' : 'DESL'}
                </span>
              </div>

              <div
                onClick={() => setIsStrictZoneLeash((prev) => !prev)}
                className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-colors ${
                  isStrictZoneLeash ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-slate-800/60 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>Trava Estrita na Zona</span>
                </div>
                <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-slate-900">
                  {isStrictZoneLeash ? 'LIGADO' : 'DESL'}
                </span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <button
                type="button"
                onClick={() => handleApplyRadiusToAllWorkingVillagers(gatherRadiusLimit)}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.99]"
              >
                <Target className="w-4 h-4" />
                <span>Aplicar Raio ({gatherRadiusLimit >= 999 ? 'Livre' : `${gatherRadiusLimit}m`}) a Todos os Aldeões em Coleta</span>
              </button>
            </div>

            {/* Active Zones List */}
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                <span>Zonas Ativas na Colônia:</span>
                <span className="text-emerald-400 font-mono font-bold">{activeWorkZones.length} zona(s)</span>
              </div>

              {activeWorkZones.length === 0 ? (
                <p className="text-xs text-slate-500 italic p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-center">
                  Nenhuma zona de trabalho ativa no momento. Envie aldeões para colher um recurso para criar uma zona automaticamente!
                </p>
              ) : (
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {activeWorkZones.map((z) => (
                    <div
                      key={z.id}
                      className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        <div>
                          <div className="font-bold text-white">
                            {z.clusterName || `Zona em X:${Math.round(z.x)} Z:${Math.round(z.z)}`}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {z.unitCount} aldeão(ões) • Raio: {z.radius >= 999 ? 'Livre' : `${z.radius}m`} • {z.treesRemaining} árvores disponíveis
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          engineRef.current?.setCameraTarget(z.x, z.z);
                          setIsWorkZoneModalOpen(false);
                          soundManager.playClickSound();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-semibold transition-colors shrink-0"
                      >
                        Focar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TACTICAL TOAST NOTIFICATIONS */}
      {notification && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300 animate-in fade-in slide-in-from-top-3">
          <div
            className={`px-4 py-2.5 rounded-2xl backdrop-blur-xl border shadow-2xl flex items-center gap-2.5 text-xs font-semibold ${
              notification.type === 'success'
                ? 'bg-emerald-950/95 text-emerald-300 border-emerald-500/50 shadow-emerald-500/20'
                : notification.type === 'warning'
                ? 'bg-amber-950/95 text-amber-300 border-amber-500/50 shadow-amber-500/20'
                : 'bg-slate-950/95 text-slate-200 border-slate-700/90 shadow-black/60'
            }`}
          >
            {notification.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : notification.type === 'warning' ? (
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
        </div>
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
      {showResultScreen && (
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
