import type { GameState, Unit } from './model';

export interface BatchCommand { type: 'gather'; unitId: string; targetId: string }

export interface BatchRow { unitId: string; owner: string; unit: string; targetId: string; effect: string }
export interface BatchSkip { unitId: string; reason: string }
export interface BatchPreview { rows: BatchRow[]; skipped: BatchSkip[]; commands: BatchCommand[] }

const UNIT_LABEL: Record<string, string> = { villager: 'Aldeão', soldier: 'Soldado', cavalry: 'Cavalaria' };

/**
 * Prévia do lote: cada comando é conferido com a MESMA autorização das ações individuais (posse, alvo conhecido, capacidade).
 * Lista todos os alvos e donos com o efeito; o que a autorização recusa aparece como pulado, com o motivo. Não altera nada.
 */
export function previewBatch(
  state: Pick<GameState, 'units' | 'resourceNodes'>, commands: readonly BatchCommand[], authorize: (command: BatchCommand) => boolean
): BatchPreview {
  const rows: BatchRow[] = [];
  const skipped: BatchSkip[] = [];
  const accepted: BatchCommand[] = [];
  const seen = new Set<string>();
  for (const command of commands) {
    const unit = state.units.find((candidate) => candidate.id === command.unitId);
    if (seen.has(command.unitId)) { skipped.push({ unitId: command.unitId, reason: 'repetida no lote' }); continue; }
    seen.add(command.unitId);
    if (!unit || unit.health <= 0) { skipped.push({ unitId: command.unitId, reason: 'unidade inexistente ou morta' }); continue; }
    const node = state.resourceNodes.find((candidate) => candidate.id === command.targetId);
    if (!node) { skipped.push({ unitId: unit.id, reason: 'alvo inexistente' }); continue; }
    if (!authorize(command)) { skipped.push({ unitId: unit.id, reason: 'o host recusaria: alvo desconhecido, fora da visão ou sem posse' }); continue; }
    accepted.push(command);
    rows.push({ unitId: unit.id, owner: unit.owner, unit: UNIT_LABEL[unit.type] ?? unit.type, targetId: node.id, effect: `passa a coletar ${node.type} (${Math.round(node.position.x)}, ${Math.round(node.position.z)})` });
  }
  return { rows, skipped, commands: accepted };
}

interface PriorOrder { unitId: string; state: Unit['state']; targetEntityId: Unit['targetEntityId']; targetPosition: Unit['targetPosition']; applied: { targetEntityId: string } }
export interface BatchRecord { prior: PriorOrder[]; appliedAt: number }

/** Registro das ordens anteriores das unidades do lote, tirado ANTES de aplicar. */
export function recordBatch(state: Pick<GameState, 'units'>, preview: BatchPreview, appliedAt: number): BatchRecord {
  const prior: PriorOrder[] = preview.commands.flatMap((command) => {
    const unit = state.units.find((candidate) => candidate.id === command.unitId);
    return unit ? [{ unitId: unit.id, state: unit.state, targetEntityId: unit.targetEntityId, targetPosition: unit.targetPosition ? { ...unit.targetPosition } : null, applied: { targetEntityId: command.targetId } }] : [];
  });
  return { prior, appliedAt };
}

export interface BatchUndo<T> { state: T; reverted: string[]; conflicts: BatchSkip[] }

/**
 * Desfaz só o que ainda pode ser revertido: a unidade precisa estar viva e ainda executando a ordem do lote. Unidade que já mudou de
 * ordem, morreu ou sumiu é um conflito informado e não é tocada. Recursos já coletados não voltam e unidades mortas não ressuscitam.
 */
export function undoBatch<T extends Pick<GameState, 'units'>>(state: T, record: BatchRecord): BatchUndo<T> {
  const reverted: string[] = [];
  const conflicts: BatchSkip[] = [];
  const byId = new Map(record.prior.map((entry) => [entry.unitId, entry]));
  const units = state.units.map((unit) => {
    const entry = byId.get(unit.id);
    if (!entry) return unit;
    if (unit.health <= 0) { conflicts.push({ unitId: unit.id, reason: 'a unidade morreu' }); return unit; }
    if (unit.targetEntityId !== entry.applied.targetEntityId) { conflicts.push({ unitId: unit.id, reason: 'a unidade já recebeu outra ordem ou terminou a coleta' }); return unit; }
    reverted.push(unit.id);
    return { ...unit, state: entry.state === 'gathering' ? ('idle' as const) : entry.state, targetEntityId: entry.targetEntityId, targetPosition: entry.targetPosition };
  });
  for (const entry of record.prior) if (!state.units.some((u) => u.id === entry.unitId)) conflicts.push({ unitId: entry.unitId, reason: 'a unidade não existe mais' });
  return { state: { ...state, units }, reverted, conflicts };
}

/** O desfazer expira: depois de 60 s do lote, o estado da partida já avançou demais para reverter com segurança. */
export const BATCH_UNDO_SECONDS = 60;
export const canUndoBatch = (record: BatchRecord | null, elapsed: number): boolean => Boolean(record) && elapsed - record!.appliedAt <= BATCH_UNDO_SECONDS;
