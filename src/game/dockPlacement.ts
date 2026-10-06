/**
 * Política de posicionamento do cais: a janela de água usada pela prévia e
 * pela aplicação autorizada é a mesma que limita o nascimento do barco, para
 * que "cais exige oceano navegável" e "barco nasce perto do cais" andem
 * juntas. Módulo puro, sem dependência de renderização.
 */
export const DOCK_WATER_WINDOW_OFFSETS = [-2, 0, 2] as const;

/**
 * Verdadeiro se algum ponto da janela do cais toca `waterAt` (qualquer água).
 */
export function hasWaterNearDock(
  waterAt: (x: number, z: number) => boolean,
  dockX: number,
  dockZ: number
): boolean {
  for (const ox of DOCK_WATER_WINDOW_OFFSETS) {
    for (const oz of DOCK_WATER_WINDOW_OFFSETS) {
      if (waterAt(dockX + ox, dockZ + oz)) return true;
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
  let best: { x: number; z: number } | null = null;
  let bestDistance = Infinity;
  for (const ox of DOCK_WATER_WINDOW_OFFSETS) {
    for (const oz of DOCK_WATER_WINDOW_OFFSETS) {
      const cx = dockX + ox;
      const cz = dockZ + oz;
      if (!isOceanAt(cx, cz)) continue;
      const distance = Math.hypot(cx - preferredX, cz - preferredZ);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x: cx, z: cz };
      }
    }
  }
  return best;
}
