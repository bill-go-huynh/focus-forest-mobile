import type { DailyProgress, GrowthResult, HomeResponse, WeeklyProgress } from '../api/core-loop';
import { formatFocused } from '../history/history-format';
import { stageName } from '../tree/describe-tree';
import { traitLook } from '../tree/signature/trait-decorations';
import { TREE_STAGES, type TreeStage } from '../tree/tree-contract';
import { knownTrait, type KnownTrait } from '../tree/visual-state';
import type { ReactionKind } from '../tree/motion-plan';

/**
 * Words and values for the Core Loop screens, from server truth only (M3.2). Nothing here
 * computes progress, goals, or streaks: it phrases what the server said.
 */

export type MomentKind = 'stage' | 'trait' | 'blossoms' | 'growth';

/** The one major moment a completion plays, and the other changes said in words. */
export interface GrowthMoment {
  kind: MomentKind;
  reaction: ReactionKind;
  caption: string;
  others: string[];
  /** The stage the tree grew from, for the cross-fade (stage moments only). */
  fromStage: string | null;
}

const STAGE_CAPTION_FALLBACK = 'Your tree reached a new stage.';
const TRAIT_CAPTION_FALLBACK = 'Your tree earned a new milestone detail.';

const isStage = (value: string): value is TreeStage => TREE_STAGES.some((s) => s === value);

/**
 * The most significant change across one or more server growth results, in session order:
 * a stage change, else a new trait, else new blossoms, else plain growth (docs/04 §5: one
 * milestone sequence per completion; the others become a line of text).
 */
export function growthMoment(growths: readonly GrowthResult[]): GrowthMoment {
  const stages = growths.flatMap((g) => (g.stage ? [g.stage] : []));
  const traits = growths.flatMap((g) => g.newTraits);
  const blossoms = growths.some((g) => g.blossoms !== undefined);
  const fullness = growths.some((g) => g.fullness !== undefined);
  const richness = growths.some((g) => g.richness !== undefined);

  const stageCaption = stages.length > 0 ? stageText(stages.at(-1)!.to) : null;
  const traitCaptions = traits.map((t) => traitText(t.id));
  const lines = {
    blossoms: blossoms ? 'New blossoms opened.' : null,
    fullness: fullness ? 'The canopy filled in.' : null,
    richness: richness ? 'Your tree grew richer.' : null,
  };

  if (stageCaption) {
    return moment(
      'stage',
      stageCaption,
      [...traitCaptions, lines.blossoms, lines.fullness, lines.richness],
      stages[0]!.from,
    );
  }
  if (traitCaptions.length > 0) {
    const [first, ...rest] = traitCaptions;
    return moment('trait', first!, [...rest, lines.blossoms, lines.fullness, lines.richness]);
  }
  if (lines.blossoms) {
    return moment('blossoms', lines.blossoms, [lines.fullness, lines.richness]);
  }
  return moment('growth', 'Your tree grew.', [lines.fullness, lines.richness]);
}

function moment(
  kind: MomentKind,
  caption: string,
  others: (string | null)[],
  fromStage: string | null = null,
): GrowthMoment {
  return {
    kind,
    reaction: kind === 'trait' ? 'trait' : kind,
    caption,
    others: [
      ...new Set(others.filter((line): line is string => line !== null && line !== caption)),
    ],
    fromStage,
  };
}

function stageText(stage: string): string {
  return isStage(stage) ? `Your tree became a ${stageName(stage)}.` : STAGE_CAPTION_FALLBACK;
}

function traitText(id: string): string {
  const trait = knownTrait(id);
  const look = trait ? traitLook(trait) : null;
  if (!trait || !look) return TRAIT_CAPTION_FALLBACK;
  const name = `${look.name.charAt(0).toUpperCase()}${look.name.slice(1)}`;
  return `${name} for ${milestoneWords(trait)}.`;
}

function milestoneWords(trait: KnownTrait): string {
  return trait.family === 'streak-days'
    ? `your ${trait.value}-day streak`
    : `${trait.value} focus hours`;
}

export interface GoalLine {
  /** For the progress ring only: the share of the target, 0–100. */
  percent: number;
  valueText: string;
}

function goalLine(current: number, target: number, completed: boolean, unit: string): GoalLine {
  const percent =
    completed || target === 0 ? 100 : Math.min(100, Math.round((current / target) * 100));
  const value = `${current} / ${target} ${unit}`;
  return { percent, valueText: completed ? `Goal reached · ${value}` : value };
}

/** Today's daily goal, as the server reported it. */
export function dailyGoalLine(today: DailyProgress): GoalLine {
  return goalLine(today.focusedMinutes, today.targetMinutes, today.completed, 'min');
}

/** This week's weekly goal; null when this week has none. */
export function weeklyGoalLine(week: WeeklyProgress | null): GoalLine | null {
  if (!week) return null;
  return goalLine(
    week.current,
    week.target,
    week.completed,
    week.type === 'session_count' ? 'sessions' : 'min',
  );
}

/** This Monday-to-Sunday week's counted focus, goal or not. */
export function weekLine(week: HomeResponse['week']): string {
  return week.focusedMilliseconds < 60_000
    ? 'This week: no focus yet'
    : `This week: ${formatFocused(week.focusedMilliseconds)} focused`;
}

/** The current streak, or today's rest day (rest days keep the streak). */
export function streakLine(home: Pick<HomeResponse, 'streak' | 'rest'>): string {
  const { current } = home.streak;
  if (home.rest.today || home.streak.today === 'rest') {
    return current > 0 ? `Rest day today · your ${current}-day streak is kept` : 'Rest day today';
  }
  return current > 0 ? `${current}-day streak` : 'Focus today to start a streak';
}

/** "Growing Tree · growing toward Mature Tree": a gentle hint from the server's progress. */
export function stageHint(stage: string, progress: number | null): string {
  if (!isStage(stage)) return 'Your tree';
  const name = stageName(stage);
  const next = TREE_STAGES[TREE_STAGES.indexOf(stage) + 1];
  if (!next || progress === null) return name;
  return progress >= 0.75
    ? `${name} · almost a ${stageName(next)}`
    : `${name} · growing toward ${stageName(next)}`;
}
