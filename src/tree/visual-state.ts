import {
  TREE_STAGES,
  VITALITY_STATES,
  type TreeStage,
  type TreeStateDto,
  type VitalityState,
} from './tree-contract';

/**
 * The one adapter between the API's tree state and the renderer (docs/03 §14). It normalizes
 * what the server sent so the renderer never fails on it, and it derives no product truth:
 * stage, levels, traits, vitality, and seed are the server's. Nothing here reads focus time.
 */

/** What the ambient layer shows: a growing tree's vitality, or "at rest" when archived. */
export type Ambience = VitalityState | 'at_rest';

/** A server level scaled for drawing: `ratio` is level / max, from 0 to 1. */
export interface VisualLevel {
  level: number;
  max: number;
  ratio: number;
}

export const TRAIT_FAMILIES = ['streak-days', 'monthly-focus-hours'] as const;
export type TraitFamily = (typeof TRAIT_FAMILIES)[number];

/** A milestone trait the renderer knows how to draw ("<family>:<value>"). */
export interface KnownTrait {
  id: string;
  family: TraitFamily;
  value: number;
}

export interface TreeVisualState {
  year: number;
  month: number;
  lifecycle: 'growing' | 'archived';
  /** The species the renderer draws: the signature species until more exist (Phase 9). */
  species: 'signature';
  /** The species identifier as sent. */
  speciesId: string;
  stage: TreeStage;
  /** The server's progress within the stage (0–1), null at Final Form. Not drawn yet. */
  stageProgress: number | null;
  fullness: VisualLevel;
  blossoms: VisualLevel;
  richness: VisualLevel;
  /** Known traits, each id once, in the server's order. */
  traits: KnownTrait[];
  /** Trait ids the renderer does not know: kept as data, never drawn. */
  unknownTraitIds: string[];
  /** Every trait id as sent, each once. */
  traitIds: string[];
  /** A growing tree's vitality; null when archived or not known. */
  vitality: VitalityState | null;
  ambience: Ambience;
  /** Unsigned 32-bit integer. */
  seed: number;
}

export function toTreeVisualState(dto: TreeStateDto): TreeVisualState {
  const progress = (dto.progress ?? {}) as Partial<TreeStateDto['progress']>;
  const archived = dto.status === 'archived';
  const vitality = !archived && isVitality(dto.vitality) ? dto.vitality : null;
  const { traits, unknownTraitIds, traitIds } = readTraits(dto.traits);
  return {
    year: dto.year,
    month: dto.month,
    lifecycle: archived ? 'archived' : 'growing',
    species: 'signature',
    speciesId: typeof dto.species === 'string' ? dto.species : 'signature',
    stage: readStage(progress.stage, progress.stageNumber),
    stageProgress: unitOrNull(progress.progressToNextStage),
    fullness: level(progress.fullness?.level, progress.fullness?.maxLevel),
    blossoms: level(progress.blossoms?.level, progress.blossoms?.maxLevel),
    richness: level(progress.richness?.tier, progress.richness?.maxTier),
    traits,
    unknownTraitIds,
    traitIds,
    vitality,
    ambience: vitality ?? 'at_rest',
    seed: readSeed(dto.variationSeed),
  };
}

/** The stage by name; an unknown name falls back to the stage number, then to a Seed. */
function readStage(stage: unknown, stageNumber: unknown): TreeStage {
  const named = TREE_STAGES.find((known) => known === stage);
  if (named) return named;
  if (typeof stageNumber === 'number' && Number.isInteger(stageNumber)) {
    return TREE_STAGES[stageNumber - 1] ?? 'seed';
  }
  return 'seed';
}

function isVitality(value: unknown): value is VitalityState {
  return VITALITY_STATES.some((known) => known === value);
}

function level(value: unknown, max: unknown): VisualLevel {
  const top = wholeNumber(max);
  const current = Math.min(wholeNumber(value), top);
  return { level: current, max: top, ratio: top === 0 ? 0 : current / top };
}

/** A whole number of at least 0; anything else counts as 0. */
function wholeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function unitOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

function readSeed(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) >>> 0 : 0;
}

const TRAIT_PATTERN = /^([a-z-]+):(\d+)$/;

/** A trait id of a family the renderer knows ("<family>:<value>"), or null. */
export function knownTrait(id: string): KnownTrait | null {
  const match = TRAIT_PATTERN.exec(id);
  const family = TRAIT_FAMILIES.find((known) => known === match?.[1]);
  return match && family ? { id, family, value: Number(match[2]) } : null;
}

function readTraits(list: unknown) {
  const traitIds: string[] = [];
  const traits: KnownTrait[] = [];
  const unknownTraitIds: string[] = [];
  for (const entry of Array.isArray(list) ? list : []) {
    const id: unknown = (entry as { id?: unknown } | null)?.id;
    if (typeof id !== 'string' || traitIds.includes(id)) continue;
    traitIds.push(id);
    const trait = knownTrait(id);
    if (trait) traits.push(trait);
    else unknownTraitIds.push(id);
  }
  return { traits, unknownTraitIds, traitIds };
}
