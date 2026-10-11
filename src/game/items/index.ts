import { food } from './food';
import { gold } from './gold';
import { planks } from './planks';
import { stone } from './stone';
import type { ItemDef } from './types';
import { wood } from './wood';

export type { ItemDef } from './types';

/**
 * Registro dos itens do império, na ordem de exibição. Acrescentar um item = criar o arquivo e incluí-lo aqui
 * (o teste `items.test.ts` confere que todo arquivo da pasta está registrado).
 */
export const ITEM_DEFS = [wood, food, gold, stone, planks] as const;

export type ItemId = (typeof ITEM_DEFS)[number]['id'];

/** Ids dos itens estocáveis, na ordem do registro: base de estoques, custos, carga, rede e interface. */
export const ITEM_IDS: readonly ItemId[] = ITEM_DEFS.map((item) => item.id);

const BY_ID: ReadonlyMap<string, ItemDef> = new Map(ITEM_DEFS.map((item) => [item.id, item]));

export const itemById = (id: string): ItemDef | undefined => BY_ID.get(id);
export const isItemId = (value: unknown): value is ItemId => typeof value === 'string' && BY_ID.has(value);
export const itemsWithTag = (tag: string): ItemDef[] => ITEM_DEFS.filter((item) => (item.tags as readonly string[]).includes(tag));

/** Saldo zerado de todos os itens. */
export const emptyItems = (): Record<ItemId, number> => Object.fromEntries(ITEM_IDS.map((id) => [id, 0])) as Record<ItemId, number>;

/** Mapa id → valor de exibição, derivado do registro. */
export const itemField = <K extends 'name' | 'short' | 'chipClass'>(field: K): Record<ItemId, ItemDef[K]> =>
  Object.fromEntries(ITEM_DEFS.map((item) => [item.id, (item as ItemDef)[field]])) as unknown as Record<ItemId, ItemDef[K]>;
