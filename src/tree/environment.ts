import type { Equipment } from '../api/progression';

/**
 * The garden around a growing tree (docs/03 §7 layers 2 and 17; §10 → cosmetics decorate the
 * garden): the equipped background and decoration, by cosmetic id. Presentation only, drawn by
 * the renderer for the current month's scenes; never part of a tree, an archive, or a recap.
 */
export interface SceneEnvironment {
  background: string | null;
  decoration: string | null;
}

export const BASE_ENVIRONMENT: SceneEnvironment = { background: null, decoration: null };

/** Backgrounds and decorations the renderer can draw; any other id draws nothing. */
export const KNOWN_BACKGROUNDS = ['meadow', 'misty-hills'] as const;
export const KNOWN_DECORATIONS = ['mossy-stones', 'stone-lantern'] as const;

/** The garden the server says is equipped; the base environment while that is not known. */
export function environmentFrom(equipment: Equipment | undefined | null): SceneEnvironment {
  if (!equipment) return BASE_ENVIRONMENT;
  return {
    background: equipment.forest.background?.id ?? null,
    decoration: equipment.forest.decoration?.id ?? null,
  };
}
