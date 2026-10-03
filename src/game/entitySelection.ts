export type SelectableEntityKind = 'unit' | 'building' | 'resource';

export interface SelectionCandidate {
  kind: SelectableEntityKind;
  id: string;
  distance: number;
  resourceType?: string;
}

/**
 * Foliage has a broad visual silhouette and can overlap nearby units/resources.
 * Within a short ray distance, prefer actionable entities and solid deposits;
 * outside that window the physically front-most hit remains authoritative.
 */
export function chooseSelectionCandidate<T extends SelectionCandidate>(candidates: T[]): T | null {
  if (candidates.length === 0) return null;
  const nearestDistance = Math.min(...candidates.map(({ distance }) => distance));
  const nearby = candidates.filter(({ distance }) => distance <= nearestDistance + 3);
  const priority = (candidate: SelectionCandidate): number => {
    if (candidate.kind === 'unit') return 0;
    if (candidate.kind === 'building') return 1;
    if (candidate.resourceType && candidate.resourceType !== 'tree') return 2;
    return 3;
  };
  return nearby.sort((a, b) => priority(a) - priority(b) || a.distance - b.distance)[0];
}
