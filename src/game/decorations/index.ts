import { banner } from './banner';
import { brazier } from './brazier';
import { flowerBed } from './flowerBed';
import { fountain } from './fountain';
import { menhir } from './menhir';
import { sapling } from './sapling';
import type { DecorationDef } from './types';

export type { DecorationDef } from './types';

/** Registro dos enfeites, na ordem da aba Decoração. Acrescentar = criar o arquivo e incluir aqui. */
export const DECORATION_DEFS = [sapling, flowerBed, menhir, brazier, fountain, banner] as const satisfies readonly DecorationDef[];

export type DecorationId = (typeof DECORATION_DEFS)[number]['id'];

export const decorationById = (id: string): DecorationDef | undefined => DECORATION_DEFS.find((def) => def.id === id);
export const isDecorationId = (value: unknown): value is DecorationId => typeof value === 'string' && DECORATION_DEFS.some((def) => def.id === value);
