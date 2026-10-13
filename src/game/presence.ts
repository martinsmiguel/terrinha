/**
 * Presença na sala (#211): quem está no mundo agora e quem já passou por ele (offline). O servidor mantém a lista por
 * sala e a envia a todos a cada entrada ou saída. Regra pura.
 */

export interface PresenceEntry {
  slot: string;
  name: string;
  isHost: boolean;
  online: boolean;
  /** Última entrada ou saída (ms). */
  lastSeen: number;
}

const bySlotOrder = (a: PresenceEntry, b: PresenceEntry) => Number(b.online) - Number(a.online) || a.slot.localeCompare(b.slot);

/** Entrada: o slot fica online com o nome atual (reentrada atualiza o mesmo registro). */
export function presenceJoin(list: readonly PresenceEntry[], entry: { slot: string; name: string; isHost: boolean }, now: number): PresenceEntry[] {
  const rest = list.filter((item) => item.slot !== entry.slot);
  return [...rest, { ...entry, online: true, lastSeen: now }].sort(bySlotOrder);
}

/** Saída: o slot fica offline, mas continua na lista do mundo. */
export function presenceLeave(list: readonly PresenceEntry[], slot: string, now: number): PresenceEntry[] {
  return list.map((item) => (item.slot === slot ? { ...item, online: false, lastSeen: now } : item)).sort(bySlotOrder);
}

export const onlineCount = (list: readonly PresenceEntry[]): number => list.filter((item) => item.online).length;

/** Valida a lista recebida pela rede (o cliente não confia em formato). */
export function isPresenceList(value: unknown): value is PresenceEntry[] {
  return Array.isArray(value) && value.length <= 16 && value.every((item) =>
    item && typeof item === 'object'
    && typeof (item as PresenceEntry).slot === 'string' && typeof (item as PresenceEntry).name === 'string'
    && typeof (item as PresenceEntry).isHost === 'boolean' && typeof (item as PresenceEntry).online === 'boolean'
    && typeof (item as PresenceEntry).lastSeen === 'number');
}
