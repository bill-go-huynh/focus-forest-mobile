import { makeStreak } from '../../test-utils/consistency';
import {
  FIRST_SESSION,
  FIRST_UNLOCKS,
  HOURS_100,
  makeAchievement,
  makeBadges,
  NO_PROGRESSION,
  STREAK_7,
} from '../../test-utils/progression';
import { makeSessionResult } from '../../test-utils/sessions';
import type { ApiClient } from '../client';
import { acceptRecovery, recoveryResultSchema } from '../consistency';
import { HttpError } from '../errors';
import {
  achievementsSchema,
  badgesSchema,
  getAchievements,
  getBadges,
  progressionErrorCode,
  progressionResultSchema,
  setShowcase,
} from '../progression';
import { sessionSchema, submittedSessionSchema } from '../sessions';

function recordingClient(answer: unknown = {}) {
  const calls: { path: string; options: Record<string, unknown> }[] = [];
  const client = {
    request: jest.fn(async (path: string, options: Record<string, unknown> = {}) => {
      calls.push({ path, options });
      return (options.schema as { parse: (v: unknown) => unknown }).parse(answer);
    }),
  } as unknown as ApiClient;
  return { client, calls };
}

describe('progression contracts (A4.2–A4.3)', () => {
  describe('progressionResultSchema', () => {
    it('reads badges, species, and cosmetics an action caused', () => {
      expect(progressionResultSchema.parse(FIRST_UNLOCKS)).toEqual(FIRST_UNLOCKS);
      expect(progressionResultSchema.parse(NO_PROGRESSION)).toEqual(NO_PROGRESSION);
    });

    it('requires every list: a missing one is not "nothing"', () => {
      const { newlyUnlockedCosmetics: _, ...partial } = FIRST_UNLOCKS;
      expect(progressionResultSchema.safeParse(partial).success).toBe(false);
    });

    it('keeps a category or rarity this version does not know (later phases add them)', () => {
      const social = { ...FIRST_SESSION, category: 'social', rarity: 'mythic' };
      const parsed = progressionResultSchema.parse({
        ...NO_PROGRESSION,
        newlyEarnedBadges: [social],
      });
      expect(parsed.newlyEarnedBadges[0]).toMatchObject({ category: 'social', rarity: 'mythic' });
    });
  });

  describe('session answers', () => {
    it('a PUT answer always carries progression, null for a session stored before A4.2', () => {
      const withResult = makeSessionResult({ progression: FIRST_UNLOCKS });
      expect(submittedSessionSchema.parse(withResult).progression).toEqual(FIRST_UNLOCKS);
      expect(
        submittedSessionSchema.parse(makeSessionResult({ progression: null })).progression,
      ).toBeNull();
      const { progression: _, ...without } = makeSessionResult();
      expect(submittedSessionSchema.safeParse(without).success).toBe(false);
    });

    it('other session answers (a note, History) carry none: unknown, never invented', () => {
      const { progression: _, ...note } = makeSessionResult();
      expect(sessionSchema.parse(note).progression).toBeUndefined();
    });
  });

  describe('achievements and badges', () => {
    it('reads achievement progress, hidden progress, and a unit this version does not know', () => {
      const items = [
        makeAchievement(HOURS_100, { current: 1234, target: 6000 }),
        makeAchievement(FIRST_SESSION, { unit: 'sessions', target: 1, progressVisible: false }),
        makeAchievement(STREAK_7, { unit: 'weekdays', target: 7 }),
      ];
      expect(achievementsSchema.parse({ items }).items.map((a) => a.unit)).toEqual([
        'minutes',
        'sessions',
        'weekdays',
      ]);
    });

    it('requires earnedAt exactly when an achievement is completed', () => {
      const done = makeAchievement(FIRST_SESSION, {
        completed: true,
        earnedAt: FIRST_SESSION.earnedAt,
      });
      expect(achievementsSchema.safeParse({ items: [done] }).success).toBe(true);
      expect(achievementsSchema.safeParse({ items: [{ ...done, earnedAt: null }] }).success).toBe(
        false,
      );
    });

    it('reads owned badges and a showcase of at most three', () => {
      const badges = makeBadges([FIRST_SESSION, STREAK_7, HOURS_100], [STREAK_7, FIRST_SESSION]);
      expect(badgesSchema.parse(badges).showcase.map((b) => b.id)).toEqual([
        'focus-streak:7',
        'first-session',
      ]);
      const four = makeBadges([], [FIRST_SESSION, STREAK_7, HOURS_100, FIRST_SESSION]);
      expect(badgesSchema.safeParse(four).success).toBe(false);
    });
  });

  describe('requests', () => {
    it('reads achievements and badges from /me', async () => {
      const achievements = recordingClient({ items: [] });
      await getAchievements(achievements.client);
      expect(achievements.calls[0]?.path).toBe('/me/achievements');
      const badges = recordingClient(makeBadges());
      await getBadges(badges.client);
      expect(badges.calls[0]?.path).toBe('/me/badges');
    });

    it('replaces the showcase with the ids in order, answered with the badges', async () => {
      const answer = makeBadges([FIRST_SESSION, STREAK_7], [STREAK_7, FIRST_SESSION]);
      const { client, calls } = recordingClient(answer);
      expect(await setShowcase(client, ['focus-streak:7', 'first-session'])).toEqual(answer);
      expect(calls[0]).toMatchObject({
        path: '/me/badges/showcase',
        options: { method: 'PUT', body: { badgeIds: ['focus-streak:7', 'first-session'] } },
      });
    });

    it('reads the error code the server sends, never the message', () => {
      const refused = new HttpError(422, { message: 'No.', code: 'badge_not_owned' });
      expect(progressionErrorCode(refused)).toBe('badge_not_owned');
      expect(progressionErrorCode(new Error('x'))).toBeNull();
    });
  });

  describe('recovery answer (A4.2.G)', () => {
    it('is the streak plus what the recovered day earned', async () => {
      const answer = {
        ...makeStreak(),
        progression: { ...NO_PROGRESSION, newlyEarnedBadges: [STREAK_7] },
      };
      expect(recoveryResultSchema.parse(answer).progression?.newlyEarnedBadges).toHaveLength(1);
      expect(
        recoveryResultSchema.parse({ ...makeStreak(), progression: null }).progression,
      ).toBeNull();
      const { client } = recordingClient(answer);
      expect((await acceptRecovery(client, '2026-10-05')).progression).toEqual(answer.progression);
    });
  });
});
