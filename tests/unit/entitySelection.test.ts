import { describe, expect, it } from 'vitest';
import {
  pickFrontMostCandidate,
  resolveClickSelection,
  type ClickCandidate,
  type SelectionState,
} from '../../src/game/entitySelection';

const unit = (id: string): { kind: 'unit'; id: string } => ({ kind: 'unit', id });

const selected = (unitIds: string[]): SelectionState => ({
  unitIds,
  entity: unitIds.length > 0 ? { id: unitIds[0], kind: 'unit' } : null,
});

describe('resolveClickSelection', () => {
  it('replaces the selection with the clicked unit when shift is not held', () => {
    const next = resolveClickSelection(selected(['a', 'b']), unit('c'), false);
    expect(next).toEqual({ unitIds: ['c'], entity: { id: 'c', kind: 'unit' } });
  });

  it('adds or removes a unit from the group when shift is held', () => {
    const added = resolveClickSelection(selected(['a']), unit('b'), true);
    expect(added.unitIds).toEqual(['a', 'b']);
    expect(added.entity).toEqual({ id: 'a', kind: 'unit' });

    const removed = resolveClickSelection(selected(['a', 'b']), unit('a'), true);
    expect(removed.unitIds).toEqual(['b']);
    expect(removed.entity).toEqual({ id: 'b', kind: 'unit' });
  });

  it('clears unit ids when shift removes the last selected unit', () => {
    const next = resolveClickSelection(selected(['a']), unit('a'), true);
    expect(next).toEqual({ unitIds: [], entity: null });
  });

  it('selects buildings and resources alone, dropping any unit group', () => {
    expect(resolveClickSelection(selected(['a', 'b']), { kind: 'building', id: 'house-1' }, false)).toEqual({
      unitIds: [],
      entity: { id: 'house-1', kind: 'building' },
    });
    expect(resolveClickSelection(selected(['a']), { kind: 'resource', id: 'tree-1' }, true)).toEqual({
      unitIds: [],
      entity: { id: 'tree-1', kind: 'resource' },
    });
  });
});

describe('pickFrontMostCandidate', () => {
  it('returns the candidate closest to the camera', () => {
    const candidates: ClickCandidate[] = [
      { kind: 'unit', id: 'far', distance: 18 },
      { kind: 'building', id: 'near', distance: 4 },
      { kind: 'resource', id: 'mid', distance: 9 },
    ];
    expect(pickFrontMostCandidate(candidates)).toEqual({ kind: 'building', id: 'near', distance: 4 });
  });

  it('returns null when nothing was hit', () => {
    expect(pickFrontMostCandidate([])).toBeNull();
  });
});
