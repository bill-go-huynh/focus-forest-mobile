import { assertCalmCopy } from '../../components/calm-copy';
import { makeGrowth, makeHome, withWeeklyGoal } from '../../test-utils/core-loop';
import {
  dailyGoalLine,
  growthMoment,
  stageHint,
  streakLine,
  weekLine,
  weeklyGoalLine,
} from '../presentation';

const trait = (id: string) => ({ id, earnedAt: '2026-10-07T18:00:00.000Z' });

describe('growthMoment', () => {
  it('plays a stage change first and lists the rest in one line', () => {
    const moment = growthMoment([
      makeGrowth({
        stage: { from: 'growing_tree', to: 'mature_tree' },
        blossoms: { from: 1, to: 2 },
        newTraits: [trait('streak-days:7')],
      }),
    ]);
    expect(moment).toMatchObject({
      kind: 'stage',
      reaction: 'stage',
      fromStage: 'growing_tree',
      caption: 'Your tree became a Mature Tree.',
      others: ["A songbird's nest for your 7-day streak.", 'New blossoms opened.'],
    });
  });

  it('plays a new trait when the stage did not change', () => {
    const moment = growthMoment([
      makeGrowth({ blossoms: { from: 1, to: 2 }, newTraits: [trait('monthly-focus-hours:10')] }),
    ]);
    expect(moment).toMatchObject({
      kind: 'trait',
      reaction: 'trait',
      caption: 'A hanging seedpod for 10 focus hours.',
      others: ['New blossoms opened.'],
    });
  });

  it('describes a trait it has no art for without naming another', () => {
    expect(growthMoment([makeGrowth({ newTraits: [trait('streak-days:60')] })]).caption).toBe(
      'Your tree earned a new milestone detail.',
    );
  });

  it('plays blossoms, then plain growth', () => {
    expect(growthMoment([makeGrowth({ blossoms: { from: 2, to: 3 } })])).toMatchObject({
      kind: 'blossoms',
      reaction: 'blossoms',
      caption: 'New blossoms opened.',
      others: [],
    });
    expect(
      growthMoment([makeGrowth({ fullness: { from: 1, to: 2 }, richness: { from: 0, to: 1 } })]),
    ).toMatchObject({
      kind: 'growth',
      reaction: 'growth',
      caption: 'Your tree grew.',
      others: ['The canopy filled in.', 'Your tree grew richer.'],
    });
    expect(growthMoment([makeGrowth()])).toMatchObject({ kind: 'growth', others: [] });
  });

  it('combines several sessions into one moment, from the first stage to the last', () => {
    const moment = growthMoment([
      makeGrowth({ stage: { from: 'sprout', to: 'young_tree' } }),
      makeGrowth({ blossoms: { from: 0, to: 1 } }),
      makeGrowth({ stage: { from: 'young_tree', to: 'growing_tree' } }),
    ]);
    expect(moment).toMatchObject({
      kind: 'stage',
      fromStage: 'sprout',
      caption: 'Your tree became a Growing Tree.',
      others: ['New blossoms opened.'],
    });
  });

  it('never reads the session’s minutes: the same growth is the same moment', () => {
    expect(growthMoment([makeGrowth()])).toEqual(growthMoment([makeGrowth()]));
  });

  it('keeps every caption calm', () => {
    const all = growthMoment([
      makeGrowth({
        stage: { from: 'seed', to: 'sprout' },
        fullness: { from: 0, to: 1 },
        blossoms: { from: 0, to: 1 },
        richness: { from: 0, to: 1 },
        newTraits: [trait('streak-days:3'), trait('x:1')],
      }),
    ]);
    for (const text of [all.caption, ...all.others]) assertCalmCopy(text, 'Completion');
  });
});

describe('Home lines', () => {
  it('shows the daily goal from the server', () => {
    const home = makeHome();
    expect(dailyGoalLine(home.goals.daily.today)).toEqual({
      percent: 70,
      valueText: '42 / 60 min',
    });
    expect(
      dailyGoalLine({ ...home.goals.daily.today, focusedMinutes: 75, completed: true }),
    ).toEqual({ percent: 100, valueText: 'Goal reached · 75 / 60 min' });
  });

  it('shows the weekly goal only when this week has one', () => {
    expect(weeklyGoalLine(makeHome().goals.weekly.thisWeek)).toBeNull();
    const minutes = withWeeklyGoal(makeHome(), 200, 300).goals.weekly.thisWeek;
    expect(weeklyGoalLine(minutes)).toEqual({ percent: 67, valueText: '200 / 300 min' });
    expect(
      weeklyGoalLine({
        weekStart: '2026-10-05',
        type: 'session_count',
        target: 5,
        current: 5,
        completed: true,
      }),
    ).toEqual({ percent: 100, valueText: 'Goal reached · 5 / 5 sessions' });
  });

  it('always shows this week’s focus', () => {
    expect(weekLine(makeHome().week)).toBe('This week: 3 h 20 min focused');
    expect(weekLine({ ...makeHome().week, focusedMilliseconds: 0 })).toBe(
      'This week: no focus yet',
    );
  });

  it('shows the streak, or a rest day', () => {
    const home = makeHome();
    expect(streakLine(home)).toBe('4-day streak');
    expect(streakLine({ ...home, streak: { ...home.streak, current: 1 } })).toBe('1-day streak');
    expect(streakLine({ ...home, rest: { ...home.rest, today: true } })).toBe(
      'Rest day today · your 4-day streak is kept',
    );
    expect(streakLine({ ...home, streak: { ...home.streak, current: 0, today: 'pending' } })).toBe(
      'Focus today to start a streak',
    );
    for (const text of [
      streakLine(home),
      streakLine({ ...home, rest: { ...home.rest, today: true } }),
    ]) {
      assertCalmCopy(text, 'Home');
    }
  });

  it('hints at the next stage from the server’s progress, without numbers', () => {
    expect(stageHint('growing_tree', 0.2)).toBe('Growing Tree · growing toward Mature Tree');
    expect(stageHint('growing_tree', 0.8)).toBe('Growing Tree · almost a Mature Tree');
    expect(stageHint('final_form', null)).toBe('Final Form');
    expect(stageHint('sapling', 0.5)).toBe('Your tree');
  });
});
