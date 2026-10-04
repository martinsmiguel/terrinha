export type SelectionKind = 'unit' | 'building' | 'resource';

export interface SelectionTarget {
  kind: SelectionKind;
  id: string;
}

export interface SelectionState {
  unitIds: string[];
  entity: { id: string; kind: SelectionKind } | null;
}

export const emptySelection: SelectionState = { unitIds: [], entity: null };

export function resolveClickSelection(
  current: SelectionState,
  target: SelectionTarget,
  shiftKey: boolean
): SelectionState {
  if (target.kind !== 'unit') {
    return { unitIds: [], entity: { id: target.id, kind: target.kind } };
  }

  if (!shiftKey) {
    return { unitIds: [target.id], entity: { id: target.id, kind: 'unit' } };
  }

  const next = current.unitIds.includes(target.id)
    ? current.unitIds.filter((id) => id !== target.id)
    : [...current.unitIds, target.id];
  return {
    unitIds: next,
    entity: next.length > 0 ? { id: next[0], kind: 'unit' } : null,
  };
}

export interface ClickCandidate {
  kind: SelectionKind;
  id: string;
  distance: number;
}

export function pickFrontMostCandidate(candidates: ClickCandidate[]): ClickCandidate | null {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  for (const candidate of candidates) {
    if (candidate.distance < best.distance) best = candidate;
  }
  return best;
}
