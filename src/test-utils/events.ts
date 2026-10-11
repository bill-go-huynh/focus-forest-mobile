/**
 * A5.6–A5.7 answers shaped like focus-forest-api `src/events/events.dto.ts` and
 * `community-tree.dto.ts`: an event as one user sees it, Home's card, what a session did for an
 * event, and the Community Tree.
 */

export const EVENT_ID = 'autumn-study';

const BADGE = {
  id: 'autumn-study',
  name: 'Autumn Study',
  description: 'Took part in the Autumn Study event.',
  category: 'event',
  rarity: 'rare',
  artworkId: 'autumn-study',
};
const LANTERNS = {
  id: 'maple-lanterns',
  name: 'Maple Lanterns',
  description: 'Lanterns from the Autumn Study event.',
  type: 'decoration',
  rarity: 'rare',
  artworkId: 'maple-lanterns',
};

export function makeEvent(
  overrides: {
    joined?: boolean;
    phase?: 'upcoming' | 'live' | 'ended';
    values?: [number, number, number];
    reached?: [boolean, boolean];
    communityTree?: { stage: string | null; totalMinutes: number } | null;
  } = {},
) {
  const joined = overrides.joined ?? true;
  const [hours, days, together] = overrides.values ?? [180, 2, 0];
  const value = (n: number) => (joined ? n : null);
  return {
    id: EVENT_ID,
    name: 'Autumn Study',
    description: 'A week of steady autumn focus.',
    artworkId: 'autumn-study',
    phase: overrides.phase ?? 'live',
    startsAt: '2026-10-15T00:00:00.000Z',
    endsAt: '2026-10-22T00:00:00.000Z',
    joined,
    communityTree:
      overrides.communityTree === undefined
        ? { stage: 'bloom', totalMinutes: 12_340 }
        : overrides.communityTree,
    missions: [
      {
        id: 'five-hours',
        name: 'Focus 5 hours',
        description: 'Five hours of focus.',
        measure: 'focus_minutes',
        target: 300,
        dailyMinutes: 0,
        value: value(hours),
        completed: joined && hours >= 300,
      },
      {
        id: 'three-days',
        name: 'Focus on 3 days',
        description: 'Three different days.',
        measure: 'active_days',
        target: 3,
        dailyMinutes: 0,
        value: value(days),
        completed: joined && days >= 3,
      },
      {
        id: 'together',
        name: 'Focus together once',
        description: 'One Focus Together session.',
        measure: 'focus_together_sessions',
        target: 1,
        dailyMinutes: 0,
        value: value(together),
        completed: joined && together >= 1,
      },
    ],
    milestones: [
      {
        id: 'first-leaf',
        name: 'First leaf',
        requiredMissions: 1,
        reached: overrides.reached?.[0] ?? false,
        rewards: { badge: null, cosmetic: LANTERNS, traitId: 'event:autumn-study' },
      },
      {
        id: 'full-autumn',
        name: 'Full autumn',
        requiredMissions: 2,
        reached: overrides.reached?.[1] ?? false,
        rewards: { badge: BADGE, cosmetic: null, traitId: null },
      },
    ],
  };
}

export function makeEventCard(overrides: { joined?: boolean; phase?: string } = {}) {
  const joined = overrides.joined ?? true;
  return {
    id: EVENT_ID,
    name: 'Autumn Study',
    artworkId: 'autumn-study',
    phase: overrides.phase ?? 'live',
    startsAt: '2026-10-15T00:00:00.000Z',
    endsAt: '2026-10-22T00:00:00.000Z',
    joined,
    missionsCompleted: joined ? 1 : null,
    missionsTotal: 3,
  };
}

export function makeCommunityTree(
  overrides: { celebrate?: string[]; joined?: boolean; stage?: string | null } = {},
) {
  const milestone = (stage: string, thresholdMinutes: number, reached: boolean) => ({
    stage,
    thresholdMinutes,
    reached,
    reachedAt: reached ? '2026-10-17T10:00:00.000Z' : null,
    rewards: { badge: null, cosmetic: LANTERNS },
  });
  return {
    eventId: EVENT_ID,
    name: 'The Garden Oak',
    artworkId: 'garden-oak',
    stage: overrides.stage === undefined ? 'bloom' : overrides.stage,
    totalMinutes: 12_340,
    participants: 230,
    joined: overrides.joined ?? true,
    yourMinutes: overrides.joined === false ? null : 340,
    milestones: [
      milestone('seedling', 1_000, true),
      milestone('growing_tree', 5_000, true),
      milestone('bloom', 10_000, true),
      milestone('final_form', 50_000, false),
    ],
    celebrate: overrides.celebrate ?? [],
  };
}

export function makeSessionEventResult() {
  return {
    eventId: EVENT_ID,
    missions: [
      { id: 'five-hours', value: 300, target: 300, completed: true },
      { id: 'three-days', value: 2, target: 3, completed: false },
      { id: 'together', value: 0, target: 1, completed: false },
    ],
    newlyCompletedMissionIds: ['five-hours'],
    newlyReachedMilestoneIds: ['first-leaf'],
    community: { minutes: 120, totalMinutes: 12_340, reachedStages: [] },
  };
}
