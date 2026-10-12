import { agricultura } from './agricultura';
import { cantaria } from './cantaria';
import { carpintaria } from './carpintaria';
import { colonizacao } from './colonizacao';
import { comercio } from './comercio';
import { exploracao } from './exploracao';
import { guerra } from './guerra';
import { mineracao } from './mineracao';
import { navegacao } from './navegacao';
import type { CraftDef } from './types';

export type { CraftDef } from './types';

/** Registro dos ofícios, na ordem de exibição. Acrescentar = criar o arquivo e incluir aqui (conferido por `crafts.test.ts`). */
export const CRAFT_DEFS = [carpintaria, cantaria, mineracao, agricultura, navegacao, comercio, guerra, exploracao, colonizacao] as const;

export type CraftId = (typeof CRAFT_DEFS)[number]['id'];
export const CRAFT_IDS: readonly CraftId[] = CRAFT_DEFS.map((craft) => craft.id);

const BY_ID: ReadonlyMap<string, CraftDef> = new Map(CRAFT_DEFS.map((craft) => [craft.id, craft]));
export const craftById = (id: string): CraftDef | undefined => BY_ID.get(id);
export const isCraftId = (value: unknown): value is CraftId => typeof value === 'string' && BY_ID.has(value);
