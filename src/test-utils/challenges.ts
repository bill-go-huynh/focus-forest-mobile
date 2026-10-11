import { KAI_ID, LINH_ID } from './social';

/**
 * A5.5 answers shaped like focus-forest-api `src/challenges/challenges.dto.ts`: templates from
 * configuration, and challenges as one participant or invitee sees them.
 */

export const STEADY_WEEK = {
  id: 'steady-week-together',
  kind: 'friend',
  measure: 'active_days',
  goal: 'each',
  target: 7,
  dailyMinutes: 15,
  days: 7,
  maxParticipants: 5,
};
export const TEN_HOURS_WEEK = {
  id: 'ten-hours-week',
  kind: 'personal',
  measure: 'focus_minutes',
  goal: 'each',
  target: 600,
  dailyMinutes: 0,
  days: 7,
  maxParticipants: 1,
};
export const TEAM_FIFTY = {
  id: 'team-fifty-hours',
  kind: 'group',
  measure: 'focus_minutes',
  goal: 'shared',
  target: 3000,
  dailyMinutes: 0,
  days: 7,
  maxParticipants: 10,
};
export const THIRTY_SESSIONS = {
  id: 'thirty-sessions-month',
  kind: 'personal',
  measure: 'sessions',
  goal: 'each',
  target: 30,
  dailyMinutes: 0,
  days: 30,
  maxParticipants: 1,
};

export const TEMPLATES = [TEN_HOURS_WEEK, THIRTY_SESSIONS, STEADY_WEEK, TEAM_FIFTY];

const person = (id: string, displayName: string, username: string) => ({
  id,
  username,
  displayName,
  avatarUrl: null,
});
export const ME = person('user-1', 'Mai Anh', 'mai');
export const LINH = person(LINH_ID, 'Linh', 'linh');
export const KAI = person(KAI_ID, 'Kai', 'kai');

export const CHALLENGE_ID = '0190e000-0000-7000-8000-00000000f001';

export function makeChallenge(
  overrides: {
    id?: string;
    template?: typeof STEADY_WEEK;
    phase?: 'upcoming' | 'active' | 'completed' | 'ended';
    value?: number;
    you?: 'invited' | 'joined';
    participants?: { user: typeof ME; value: number; reached: boolean }[];
    invited?: (typeof ME)[];
    completedAt?: string | null;
  } = {},
) {
  const template = overrides.template ?? STEADY_WEEK;
  const { maxParticipants: _size, ...terms } = template;
  return {
    id: overrides.id ?? CHALLENGE_ID,
    template: terms,
    startDate: '2026-10-12',
    endDate: '2026-10-18',
    phase: overrides.phase ?? 'active',
    completedAt: overrides.completedAt ?? null,
    progress: { value: overrides.value ?? 4, target: template.target },
    participants: overrides.participants ?? [
      { user: ME, value: overrides.value ?? 4, reached: false },
      { user: LINH, value: 7, reached: true },
    ],
    invited: overrides.invited ?? [],
    you: { status: overrides.you ?? 'joined' },
  };
}
