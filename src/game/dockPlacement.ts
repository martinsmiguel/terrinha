/**
 * Política de posicionamento do cais: a janela de água usada pela prévia e
 * pela aplicação autorizada é a mesma que limita o nascimento do barco, para
 * que "cais exige oceano navegável" e "barco nasce perto do cais" andem
 * juntas. Módulo puro, sem dependência de renderização.
 */
export const DOCK_WATER_WINDOW_OFFSETS = [-2, 0, 2] as const;
/** Raio (em células) do anel de busca por mar folgado quando a janela do cais só tem fio de costa. */
export const DOCK_SPAWN_SEARCH_RADIUS = 6;

/**
 * Verdadeiro se a janela do cais toca terra firme para acesso pela margem.
 */
export function hasLandNearDock(
  waterAt: (x: number, z: number) => boolean,
  dockX: number,
  dockZ: number
): boolean {
  for (const ox of DOCK_WATER_WINDOW_OFFSETS) {
    for (const oz of DOCK_WATER_WINDOW_OFFSETS) {
      if (!waterAt(dockX + ox, dockZ + oz)) return true;
    }
  }
  return false;
}

/**
 * Verdadeiro se algum ponto da janela do cais toca oceano navegável.
 * Rio/lago interior nunca satisfaz esta regra.
 */
export function hasOceanNearDock(
  isOceanAt: (x: number, z: number) => boolean,
  dockX: number,
  dockZ: number
): boolean {
  for (const ox of DOCK_WATER_WINDOW_OFFSETS) {
    for (const oz of DOCK_WATER_WINDOW_OFFSETS) {
      if (isOceanAt(dockX + ox, dockZ + oz)) return true;
    }
  }
  return false;
}

/**
 * Célula de oceano dentro da janela do cais mais próxima do ponto preferido
 * (spawn ao lado do cais). Retorna `null` quando o cais não tem oceano na
 * janela. O raio é limitado à própria janela: um barco nunca nasce longe do
 * cais, então um canal curto entre ilhas não vira teletransporte.
 */
export function findDockOceanSpawnCell(
  isOceanAt: (x: number, z: number) => boolean,
  dockX: number,
  dockZ: number,
  preferredX: number,
  preferredZ: number
): { x: number; z: number } | null {
  // Preferência por um ponto "folgado": o ponto, o centro da célula e as quatro vizinhas são mar navegável. Um ponto no fio da
  // costa é navegável, mas o primeiro passo do barco cruza água rasa e ele fica preso no cais; só vale como último recurso.
  const roomy = (x: number, z: number): boolean => {
    const cx = Math.floor(x) + 0.5;
    const cz = Math.floor(z) + 0.5;
    return isOceanAt(cx, cz) && isOceanAt(cx + 1, cz) && isOceanAt(cx - 1, cz) && isOceanAt(cx, cz + 1) && isOceanAt(cx, cz - 1);
  };
  let best: { x: number; z: number } | null = null;
  let bestDistance = Infinity;
  let bestRoomy = false;
  for (const ox of DOCK_WATER_WINDOW_OFFSETS) {
    for (const oz of DOCK_WATER_WINDOW_OFFSETS) {
      const cx = dockX + ox;
      const cz = dockZ + oz;
      if (!isOceanAt(cx, cz)) continue;
      const distance = Math.hypot(cx - preferredX, cz - preferredZ);
      const isRoomy = roomy(cx, cz);
      if ((isRoomy && !bestRoomy) || (isRoomy === bestRoomy && distance < bestDistance)) {
        bestDistance = distance;
        bestRoomy = isRoomy;
        best = { x: cx, z: cz };
      }
    }
  }
  if (bestRoomy || !best) return best;
  // Nenhum ponto da janela é folgado: procura mar folgado num anel curto ao redor do cais (no máximo `DOCK_SPAWN_SEARCH_RADIUS` células),
  // para o barco nunca nascer preso no fio da costa. Sem nenhum, vale o ponto navegável da janela.
  let roomyBest: { x: number; z: number } | null = null;
  let roomyDistance = Infinity;
  for (let dx = -DOCK_SPAWN_SEARCH_RADIUS; dx <= DOCK_SPAWN_SEARCH_RADIUS; dx += 1) {
    for (let dz = -DOCK_SPAWN_SEARCH_RADIUS; dz <= DOCK_SPAWN_SEARCH_RADIUS; dz += 1) {
      const cx = Math.floor(dockX) + dx + 0.5;
      const cz = Math.floor(dockZ) + dz + 0.5;
      if (Math.hypot(cx - dockX, cz - dockZ) > DOCK_SPAWN_SEARCH_RADIUS || !roomy(cx, cz)) continue;
      const distance = Math.hypot(cx - preferredX, cz - preferredZ);
      if (distance < roomyDistance) {
        roomyDistance = distance;
        roomyBest = { x: cx, z: cz };
      }
    }
  }
  return roomyBest ?? best;
}
