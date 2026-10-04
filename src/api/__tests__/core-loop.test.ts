import {
  CLOSED_MONTH_GROWTH,
  makeCurrentTree,
  makeGrowth,
  makeHome,
  withWeeklyGoal,
} from '../../test-utils/core-loop';
import { makeSessionResult } from '../../test-utils/sessions';
import { makeTopic } from '../../test-utils/topics';
import { treeDto } from '../../test-utils/trees';
import {
  currentTreeSchema,
  getCurrentTree,
  getHome,
  growthResultSchema,
  homeSchema,
  treeStateSchema,
} from '../core-loop';
import type { ApiClient } from '../client';
import { sessionSchema, submittedSessionSchema } from '../sessions';

const parse = <T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
  v: unknown,
) => schema.safeParse(v);

describe('Phase 3 contracts', () => {
  describe('treeStateSchema', () => {
    it('accepts the API tree, archived trees with no vitality included', () => {
      expect(parse(treeStateSchema, treeDto()).success).toBe(true);
      expect(parse(treeStateSchema, treeDto({ status: 'archived' })).success).toBe(true);
    });

    it('keeps values a newer server may add: unknown traits, stages, and vitality', () => {
      const tree = {
        ...treeDto({ traits: ['event-lantern:2027', 'streak-days:60'] }),
        vitality: 'sparkling',
        progress: { ...treeDto().progress, stage: 'sapling' },
        newField: 1,
      };
      const parsed = treeStateSchema.safeParse(tree);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.traits.map((trait) => trait.id)).toEqual([
        'event-lantern:2027',
        'streak-days:60',
      ]);
    });

    it.each([
      ['a missing progress', { ...treeDto(), progress: undefined }],
      [
        'a text level',
        {
          ...treeDto(),
          progress: { ...treeDto().progress, fullness: { level: 'x', maxLevel: 5 } },
        },
      ],
      ['an unknown status', { ...treeDto(), status: 'burnt' }],
      ['a trait without id', { ...treeDto(), traits: [{ earnedAt: '2026-10-01T00:00:00.000Z' }] }],
      ['a negative seed', { ...treeDto(), variationSeed: -1 }],
    ])('rejects %s', (_case, tree) => {
      expect(parse(treeStateSchema, tree).success).toBe(false);
    });
  });

  describe('growthResultSchema', () => {
    it('accepts normal growth with transitions and new traits', () => {
      const growth = makeGrowth({
        stage: { from: 'growing_tree', to: 'mature_tree' },
        blossoms: { from: 1, to: 2 },
        newTraits: [{ id: 'streak-days:7', earnedAt: '2026-10-07T18:00:00.000Z' }],
      });
      expect(parse(growthResultSchema, growth).success).toBe(true);
    });

    it('accepts a closed month: no tree, nothing changed', () => {
      expect(parse(growthResultSchema, CLOSED_MONTH_GROWTH).success).toBe(true);
    });

    it('rejects a closed month that shows or changes a tree', () => {
      expect(parse(growthResultSchema, { ...CLOSED_MONTH_GROWTH, tree: treeDto() }).success).toBe(
        false,
      );
      expect(
        parse(growthResultSchema, { ...CLOSED_MONTH_GROWTH, blossoms: { from: 1, to: 2 } }).success,
      ).toBe(false);
    });

    it('rejects changes from a session that does not count', () => {
      expect(
        parse(growthResultSchema, makeGrowth({ counted: false, fullness: { from: 1, to: 2 } }))
          .success,
      ).toBe(false);
      expect(parse(growthResultSchema, makeGrowth({ counted: false })).success).toBe(true);
    });
  });

  describe('session answers', () => {
    it('accepts a submission answer with growth, with growth null, and without the field', () => {
      const base = makeSessionResult();
      expect(submittedSessionSchema.parse({ ...base, growth: makeGrowth() }).growth).toMatchObject({
        counted: true,
      });
      expect(submittedSessionSchema.parse({ ...base, growth: null }).growth).toBeNull();
      // Older answers (and note answers) have no growth field: not known, never invented.
      const { growth: _absent, ...noteAnswer } = base;
      expect(sessionSchema.parse(noteAnswer).growth).toBeUndefined();
      expect(submittedSessionSchema.safeParse(noteAnswer).success).toBe(false);
    });

    it('rejects a malformed growth', () => {
      expect(
        submittedSessionSchema.safeParse({ ...makeSessionResult(), growth: { counted: 'yes' } })
          .success,
      ).toBe(false);
    });
  });

  describe('homeSchema', () => {
    it('accepts Home with and without a weekly goal, topics, and a pending ceremony', () => {
      expect(parse(homeSchema, makeHome()).success).toBe(true);
      const full = withWeeklyGoal(
        makeHome({ recentTopics: [makeTopic()], pendingCeremony: { year: 2026, month: 9 } }),
      );
      const parsed = homeSchema.parse(full);
      expect(parsed.pendingCeremony).toEqual({ year: 2026, month: 9 });
      expect(parsed.goals.weekly.thisWeek).toMatchObject({ current: 200, target: 300 });
    });

    it('accepts a streak with a recovery offer', () => {
      const home = makeHome();
      home.streak.recovery.offer = {
        missedDate: '2026-10-06',
        returnDate: '2026-10-07',
        previousStreak: 5,
      };
      expect(parse(homeSchema, home).success).toBe(true);
    });

    it.each([
      ['no tree', { ...makeHome(), tree: undefined }],
      ['no week', { ...makeHome(), week: undefined }],
      ['a text streak', { ...makeHome(), streak: { ...makeHome().streak, current: 'four' } }],
      ['a bad date', { ...makeHome(), today: '7 Oct' }],
      [
        'an unknown weekly goal type',
        {
          ...makeHome(),
          goals: {
            ...makeHome().goals,
            weekly: { goal: { type: 'pages', target: 3 }, pending: null, thisWeek: null },
          },
        },
      ],
    ])('rejects %s', (_case, home) => {
      expect(parse(homeSchema, home).success).toBe(false);
    });
  });

  describe('currentTreeSchema', () => {
    it('accepts the current tree with its month stats', () => {
      expect(parse(currentTreeSchema, makeCurrentTree()).success).toBe(true);
      expect(parse(currentTreeSchema, makeCurrentTree({ topTopicId: null })).success).toBe(true);
    });

    it('rejects missing stats', () => {
      expect(parse(currentTreeSchema, { tree: treeDto() }).success).toBe(false);
    });
  });

  describe('requests', () => {
    it('reads Home and the current tree with their schemas', async () => {
      const request = jest.fn(async () => ({}));
      const client = { request } as unknown as ApiClient;
      await getHome(client);
      await getCurrentTree(client);
      expect(request).toHaveBeenNthCalledWith(1, '/me/home', { schema: homeSchema });
      expect(request).toHaveBeenNthCalledWith(2, '/me/trees/current', {
        schema: currentTreeSchema,
      });
    });
  });
});
