import { describe, expect, it } from 'vitest';
import { parseDeveloperCommand } from '../../src/game/developerCommands';

describe('developer mode command parser', () => {
  it('accepts commands used to prepare a ship voyage', () => {
    expect(parseDeveloperCommand('recursos max', 6)).toEqual({ ok: true, command: { type: 'resources_max' } });
    expect(parseDeveloperCommand('viagem', 6)).toEqual({ ok: true, command: { type: 'voyage_scenario' } });
    expect(parseDeveloperCommand('ilha 6', 6)).toEqual({ ok: true, command: { type: 'island', index: 6 } });
  });

  it('supports unit and visibility setup commands', () => {
    expect(parseDeveloperCommand('aldeoes 4', 6)).toEqual({ ok: true, command: { type: 'spawn', unit: 'villager', count: 4 } });
    expect(parseDeveloperCommand('spawn warship 2', 6)).toEqual({ ok: true, command: { type: 'spawn', unit: 'warship', count: 2 } });
    expect(parseDeveloperCommand('revelar on', 6)).toEqual({ ok: true, command: { type: 'reveal', enabled: true } });
  });

  it('rejects unknown commands, invalid island indices and unsafe input', () => {
    expect(parseDeveloperCommand('ilha 7', 6).ok).toBe(false);
    expect(parseDeveloperCommand('eval alert(1)', 6).ok).toBe(false);
    expect(parseDeveloperCommand('recursos 100', 6).ok).toBe(false);
  });
});
