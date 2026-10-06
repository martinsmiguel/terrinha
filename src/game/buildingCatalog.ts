export type BuildingType =
  | 'house'
  | 'barracks'
  | 'tower'
  | 'sawmill'
  | 'mine'
  | 'market'
  | 'farm'
  | 'dock';

export interface BuildingDef {
  type: BuildingType;
  name: string;
  category: 'civil' | 'militar' | 'defesa' | 'economia' | 'naval';
  description: string;
  benefit: string;
  cost: { wood: number; food?: number; gold?: number; stone?: number; planks?: number };
  buildTimeSeconds: number;
  maxHealth: number;
  hotkey: string;
  footprintWidth: number;
  footprintDepth: number;
  requiresWater?: boolean; // Docks must be built near river/water
}

export const BUILDING_CATALOG: Record<BuildingType, BuildingDef> = {
  house: {
    type: 'house',
    name: 'Casa Colonial',
    category: 'civil',
    description: 'Habitação para colonos. Essencial para expandir a população da sua vila.',
    benefit: '+5 Capacidade de População',
    cost: { wood: 60 },
    buildTimeSeconds: 8,
    maxHealth: 450,
    hotkey: 'Q',
    footprintWidth: 2.4,
    footprintDepth: 2.4,
  },
  barracks: {
    type: 'barracks',
    name: 'Quartel Militar',
    category: 'militar',
    description: 'Guarnição militar para treinamento de infantaria e mosqueteiros imperiais.',
    benefit: 'Recruta Soldados Mosqueteiros',
    cost: { wood: 120, gold: 30 },
    buildTimeSeconds: 14,
    maxHealth: 800,
    hotkey: 'W',
    footprintWidth: 3.6,
    footprintDepth: 3.2,
  },
  tower: {
    type: 'tower',
    name: 'Torre de Vigia',
    category: 'defesa',
    description: 'Posto avançado fortificado que atira automaticamente contra invasores.',
    benefit: 'Ataque Automático (16 Dano, Alcance 12)',
    cost: { wood: 80, stone: 40, planks: 20 },
    buildTimeSeconds: 12,
    maxHealth: 650,
    hotkey: 'E',
    footprintWidth: 2.2,
    footprintDepth: 2.2,
  },
  sawmill: {
    type: 'sawmill',
    name: 'Serralheria & Madeireira',
    category: 'economia',
    description: 'Oficina de corte e tábuas. Aumenta a velocidade de coleta florestal e fornece tábuas nobres.',
    benefit: '+35% Coleta de Madeira & Refino de Tábuas',
    cost: { wood: 110 },
    buildTimeSeconds: 11,
    maxHealth: 550,
    hotkey: 'R',
    footprintWidth: 3.0,
    footprintDepth: 2.8,
  },
  mine: {
    type: 'mine',
    name: 'Mineradora & Pedreira',
    category: 'economia',
    description: 'Instalação de extração de veios de pedra, ferro e ouro com forja para lingotes.',
    benefit: '+40% Eficiência de Extração Mineral',
    cost: { wood: 130, gold: 25 },
    buildTimeSeconds: 14,
    maxHealth: 650,
    hotkey: 'T',
    footprintWidth: 3.2,
    footprintDepth: 3.0,
  },
  market: {
    type: 'market',
    name: 'Mercadão do Império',
    category: 'economia',
    description: 'Grande centro comercial. Permite comprar e vender mercadorias e gerenciar preços da colônia.',
    benefit: 'Câmbio de Recursos (Madeira/Comida/Ouro)',
    cost: { wood: 150, gold: 50 },
    buildTimeSeconds: 16,
    maxHealth: 750,
    hotkey: 'Y',
    footprintWidth: 3.8,
    footprintDepth: 3.4,
  },
  farm: {
    type: 'farm',
    name: 'Fazenda & Granja',
    category: 'economia',
    description: 'Talhão agrícola de trigo e cereais cultivado por aldeões para suprimento contínuo de alimento.',
    benefit: 'Fonte Renovável de Alimento sem vagar',
    cost: { wood: 75 },
    buildTimeSeconds: 9,
    maxHealth: 400,
    hotkey: 'F',
    footprintWidth: 2.8,
    footprintDepth: 2.8,
  },
  dock: {
    type: 'dock',
    name: 'Cais & Doca Naval',
    category: 'naval',
    description: 'Estaleiro construído na margem do oceano navegável para atracar e construir Barcos de Pesca e Comércio.',
    benefit: 'Constrói Barcos de Pesca e Mercantes',
    cost: { wood: 140 },
    buildTimeSeconds: 15,
    maxHealth: 700,
    hotkey: 'B',
    footprintWidth: 3.4,
    footprintDepth: 3.4,
    requiresWater: true,
  },
};
