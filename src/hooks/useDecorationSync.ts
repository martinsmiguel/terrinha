import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { decorationById } from '../game/decorations';
import { createDecorationMesh } from '../game/decorMeshes';
import type { DecorationRotation } from '../game/decor';
import type { GameEngine } from '../game/engine';
import { FACTION_COLORS } from '../game/factions';
import type { Decoration } from '../game/model';
import { isVisibleAt } from '../game/visibility';

interface Options {
  engineRef: { current: GameEngine | null };
  heightAt?: (x: number, z: number) => number;
  decorations: readonly Decoration[] | undefined;
  playerSlot: string;
  visionGridRef: { current: Uint8Array };
}

/** Enfeites na cena (#180): cria, remove e esconde na névoa os alheios, como os edifícios. */
export function useDecorationSync({ engineRef, heightAt, decorations, playerSlot, visionGridRef }: Options) {
  const meshes = useRef(new Map<string, THREE.Group>());
  useEffect(() => {
    const scene = engineRef.current?.scene;
    if (!scene) return;
    const list = decorations ?? [];
    const ids = new Set(list.map((d) => d.id));
    meshes.current.forEach((mesh, id) => {
      if (!ids.has(id)) { scene.remove(mesh); meshes.current.delete(id); }
    });
    for (const decoration of list) {
      let mesh = meshes.current.get(decoration.id);
      if (!mesh) {
        const def = decorationById(decoration.type);
        if (!def) continue;
        mesh = createDecorationMesh(def, decoration.rotation as DecorationRotation, FACTION_COLORS[decoration.owner]?.hex);
        mesh.position.set(decoration.position.x, heightAt?.(decoration.position.x, decoration.position.z) ?? 0, decoration.position.z);
        scene.add(mesh);
        meshes.current.set(decoration.id, mesh);
      }
      mesh.visible = decoration.owner === playerSlot
        || isVisibleAt(visionGridRef.current, Math.floor(decoration.position.x), Math.floor(decoration.position.z));
    }
  }, [engineRef, heightAt, decorations, playerSlot, visionGridRef]);
}
