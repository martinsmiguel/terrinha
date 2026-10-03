import { describe, expect, it } from 'vitest';
import { chooseSelectionCandidate } from '../../src/game/entitySelection';

describe('chooseSelectionCandidate', () => {
  it('selects an adjacent villager through overlapping tree foliage', () => {
    const candidates = [
      { kind: 'resource' as const, id: 'tree', distance: 20, resourceType: 'tree' },
      { kind: 'unit' as const, id: 'villager', distance: 21.5 },
    ];

    expect(chooseSelectionCandidate(candidates)?.id).toBe('villager');
  });

  it('selects nearby ore instead of a tree canopy hit', () => {
    const candidates = [
      { kind: 'resource' as const, id: 'tree', distance: 20, resourceType: 'tree' },
      { kind: 'resource' as const, id: 'ore', distance: 21, resourceType: 'gold_mine' },
    ];

    expect(chooseSelectionCandidate(candidates)?.id).toBe('ore');
  });

  it('keeps a clearly foreground resource as the target', () => {
    const candidates = [
      { kind: 'resource' as const, id: 'tree', distance: 12, resourceType: 'tree' },
      { kind: 'unit' as const, id: 'villager', distance: 18 },
    ];

    expect(chooseSelectionCandidate(candidates)?.id).toBe('tree');
  });
});
