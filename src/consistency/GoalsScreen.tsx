import { useState } from 'react';
import { Text, View } from 'react-native';

import { useFontScale } from '../accessibility';
import type { Goals, RestDays, Streak, WeeklyGoal } from '../api';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { Confirmation } from '../components/Confirmation';
import { ErrorState } from '../components/ErrorState';
import { InlineStatus } from '../components/InlineStatus';
import { Input } from '../components/Input';
import { ProgressRing } from '../components/ProgressRing';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { dailyGoalLine, weeklyGoalLine } from '../core-loop/presentation';
import { useHome } from '../core-loop/queries';
import { useTheme } from '../theme';
import { DailyGoalPicker } from './DailyGoalPicker';
import {
  addDays,
  allowanceText,
  dailySavedText,
  formatGoalMinutes,
  goalErrorText,
  listDays,
  longDate,
  pendingDailyText,
  pendingWeeklyText,
  recoveryErrorText,
  restErrorText,
  shortDate,
  streakDaysText,
  streakTodayText,
  WEEKLY_HOUR_PRESETS,
  WEEKLY_MAX,
  WEEKLY_SESSION_PRESETS,
  weeklyGoalErrorText,
  weeklyGoalText,
  weeklySavedText,
} from './goal-format';
import {
  useAcceptRecovery,
  useGoals,
  useRestDayChange,
  useRestDays,
  useSetDailyGoal,
  useSetWeeklyGoal,
  useStreak,
} from './queries';

type Status = { tone: 'neutral' | 'attention'; message: string } | null;

/** How many days the planner lays out: this week and next, Monday to Sunday. */
const PLANNER_DAYS = 14;

/**
 * Goals, rest days, and recovery (docs/05 §3, M3.3), from Profile. The daily goal value is the
 * focal point; the weekly goal, rest-day planning, the streak with any recovery the server
 * offers, and how goals open blossoms follow. Every value is the server's: changes are saved
 * only when the server answers, and offline the last known goals and streak (Home's saved
 * answer) are shown read-only.
 */
export function GoalsScreen() {
  const theme = useTheme();
  const goalsQuery = useGoals();
  const streakQuery = useStreak();
  const { home } = useHome();
  const goals = goalsQuery.data ?? home?.goals ?? null;
  const streak = streakQuery.data ?? home?.streak ?? null;
  const fromDevice = goalsQuery.data === undefined && goals !== null && goalsQuery.failureCount > 0;
  const today = goals?.daily.today.date ?? home?.today ?? null;

  return (
    <Screen>
      {fromDevice ? (
        <InlineStatus tone="info" message="Showing your goals as last saved on this device." />
      ) : null}
      {goals ? (
        <DailyGoalSection goals={goals} />
      ) : goalsQuery.isError ? (
        <ErrorState
          message="We couldn't load your goals right now."
          onRetry={() => void goalsQuery.refetch()}
        />
      ) : (
        <SkeletonGroup label="Loading your goals">
          <Skeleton variant="text" lines={3} />
        </SkeletonGroup>
      )}
      <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
        Meeting your daily and weekly goals opens blossoms on this month’s tree.
      </Text>
      {goals ? <WeeklyGoalSection goals={goals} /> : null}
      <RestDaysSection today={today} savedAllowance={home?.rest.allowance ?? null} />
      {streak ? <StreakSection streak={streak} /> : null}
    </Screen>
  );
}

function SectionHeader({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[theme.type.headline, { color: theme.colors.text.primary }]}
    >
      {title}
    </Text>
  );
}

function StatusLine({ status }: { status: Status }) {
  return status ? <InlineStatus tone={status.tone} message={status.message} live /> : null;
}

function DailyGoalSection({ goals }: { goals: Goals }) {
  const theme = useTheme();
  const save = useSetDailyGoal();
  const [status, setStatus] = useState<Status>(null);
  const { daily } = goals;
  const pending = pendingDailyText(goals);
  const progress = dailyGoalLine(daily.today);
  // The choice opens on what will apply next: the pending goal, else the current one.
  const initial = daily.pending?.minutes ?? daily.minutes;

  const onSave = (minutes: number) => {
    const before = goals;
    setStatus(null);
    save.mutate(minutes, {
      onSuccess: (after) => setStatus({ tone: 'neutral', message: dailySavedText(before, after) }),
      onError: (error) => setStatus({ tone: 'attention', message: goalErrorText(error) }),
    });
  };

  return (
    <View testID="goals-daily" style={{ gap: theme.space[3] }}>
      <SectionHeader title="Daily goal" />
      <Text style={[theme.type.title, { color: theme.colors.text.primary }]}>
        {`${formatGoalMinutes(daily.minutes)} a day`}
      </Text>
      {daily.isDefault ? (
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          Suggested to start. Save it to make it your goal.
        </Text>
      ) : null}
      {pending ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.type.body, { color: theme.colors.text.secondary }]}
        >
          {pending}
        </Text>
      ) : null}
      <ProgressRing progress={progress.percent} label="Today" valueText={progress.valueText} />
      <DailyGoalPicker
        key={initial}
        initialMinutes={initial}
        saveLabel="Save daily goal"
        onSave={onSave}
        busy={save.isPending}
      >
        <StatusLine status={status} />
      </DailyGoalPicker>
    </View>
  );
}

function WeeklyGoalSection({ goals }: { goals: Goals }) {
  const theme = useTheme();
  const save = useSetWeeklyGoal();
  const [editing, setEditing] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const { goal, pending, thisWeek } = goals.weekly;
  const progress = weeklyGoalLine(thisWeek);
  const pendingText = pendingWeeklyText(goals);
  const ending = pending !== null && pending.goal === null;

  const send = (next: WeeklyGoal | null) => {
    setStatus(null);
    save.mutate(next, {
      onSuccess: (after) => {
        setEditing(false);
        setStatus({ tone: 'neutral', message: weeklySavedText(after) });
      },
      onError: (error) => setStatus({ tone: 'attention', message: weeklyGoalErrorText(error) }),
    });
  };

  return (
    <View testID="goals-weekly" style={{ gap: theme.space[3] }}>
      <SectionHeader title="Weekly goal" />
      {goal ? (
        <Text style={[theme.type.headline, { color: theme.colors.text.primary }]}>
          {weeklyGoalText(goal)}
        </Text>
      ) : (
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          {"A weekly goal is optional. This week's focus still shows on Home."}
        </Text>
      )}
      {progress ? (
        <ProgressRing
          progress={progress.percent}
          label="This week"
          valueText={progress.valueText}
          tone="accent"
        />
      ) : null}
      {pendingText ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.type.body, { color: theme.colors.text.secondary }]}
        >
          {pendingText}
        </Text>
      ) : null}
      {editing ? (
        <WeeklyGoalEditor
          initial={pending?.goal ?? goal}
          busy={save.isPending}
          onSave={send}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <Button
          variant="secondary"
          label={goal ? 'Change weekly goal' : 'Set a weekly goal'}
          onPress={() => {
            setStatus(null);
            setEditing(true);
          }}
        />
      )}
      {goal && !ending && !editing ? (
        <Button variant="tertiary" label="End weekly goal" onPress={() => setConfirmEnd(true)} />
      ) : null}
      <StatusLine status={status} />
      <Confirmation
        visible={confirmEnd}
        title="End your weekly goal?"
        message="It stays for this week and ends from next Monday."
        confirmLabel="End weekly goal"
        cancelLabel="Keep it"
        onConfirm={() => {
          setConfirmEnd(false);
          send(null);
        }}
        onCancel={() => setConfirmEnd(false)}
      />
    </View>
  );
}

type WeeklyKind = 'hours' | 'sessions';

function initialChoice(goal: WeeklyGoal | null): { kind: WeeklyKind; amount: number | null } {
  if (!goal) return { kind: 'hours', amount: null };
  if (goal.type === 'session_count') return { kind: 'sessions', amount: goal.target };
  return { kind: 'hours', amount: goal.target % 60 === 0 ? goal.target / 60 : null };
}

/** Focus time (in hours) or sessions, presets plus custom; sends the backend's type exactly. */
function WeeklyGoalEditor({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: WeeklyGoal | null;
  busy: boolean;
  onSave: (goal: WeeklyGoal) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const start = initialChoice(initial);
  const [kind, setKind] = useState<WeeklyKind>(start.kind);
  const presets: readonly number[] =
    kind === 'hours' ? WEEKLY_HOUR_PRESETS : WEEKLY_SESSION_PRESETS;
  const [preset, setPreset] = useState<number | null>(
    start.amount !== null && presets.includes(start.amount) ? start.amount : (presets[1] ?? null),
  );
  const [customText, setCustomText] = useState(start.amount !== null ? String(start.amount) : '');
  const [customError, setCustomError] = useState<string | null>(null);
  const max = WEEKLY_MAX[kind];
  const unit = kind === 'hours' ? 'hour' : 'session';
  const spoken = (n: number) => `${n} ${unit}${n === 1 ? '' : 's'} a week`;

  const save = () => {
    const amount = preset ?? (/^\d+$/.test(customText.trim()) ? Number(customText.trim()) : NaN);
    if (!(amount >= 1 && amount <= max)) {
      setCustomError(`Enter a whole number from 1 to ${max}.`);
      return;
    }
    onSave(
      kind === 'hours'
        ? { type: 'focused_minutes', target: amount * 60 }
        : { type: 'session_count', target: amount },
    );
  };

  const chooseKind = (next: WeeklyKind) => {
    if (next === kind) return;
    setKind(next);
    const nextPresets = next === 'hours' ? WEEKLY_HOUR_PRESETS : WEEKLY_SESSION_PRESETS;
    setPreset(nextPresets[1]);
    setCustomError(null);
  };

  return (
    <Card>
      <View style={{ gap: theme.space[3] }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          <Chip
            label="Focus time"
            accessibilityLabel="Weekly goal by focus time"
            selected={kind === 'hours'}
            onPress={() => chooseKind('hours')}
          />
          <Chip
            label="Sessions"
            accessibilityLabel="Weekly goal by sessions"
            selected={kind === 'sessions'}
            onPress={() => chooseKind('sessions')}
          />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          {presets.map((amount) => (
            <Chip
              key={`${kind}-${amount}`}
              label={kind === 'hours' ? `${amount} h` : `${amount} sessions`}
              accessibilityLabel={spoken(amount)}
              selected={preset === amount}
              onPress={() => {
                setPreset(amount);
                setCustomError(null);
              }}
            />
          ))}
          <Chip
            label="Custom"
            accessibilityLabel="Custom weekly goal"
            selected={preset === null}
            onPress={() => setPreset(null)}
          />
        </View>
        {preset === null ? (
          <Input
            label={kind === 'hours' ? 'Hours per week' : 'Sessions per week'}
            value={customText}
            onChangeText={(text) => {
              setCustomText(text);
              setCustomError(null);
            }}
            error={customError ?? undefined}
            helper={`A whole number, from 1 to ${max}.`}
            keyboardType="number-pad"
            inputMode="numeric"
            returnKeyType="done"
            onSubmitEditing={save}
          />
        ) : null}
        <Button
          variant="primary"
          label="Save weekly goal"
          onPress={save}
          disabled={busy}
          disabledReason="Saving your goal."
        />
        <Button variant="tertiary" label="Cancel" onPress={onCancel} />
      </View>
    </Card>
  );
}

function RestDaysSection({
  today,
  savedAllowance,
}: {
  today: string | null;
  savedAllowance: RestDays['allowance'] | null;
}) {
  const theme = useTheme();
  const rest = useRestDays();
  const change = useRestDayChange();
  const [status, setStatus] = useState<Status>(null);
  const allowance = rest.data?.allowance ?? savedAllowance;
  const body = [theme.type.body, { color: theme.colors.text.primary }];

  const toggle = (date: string, planned: boolean) => {
    setStatus(null);
    change.mutate(
      { date, rest: !planned },
      { onError: (error) => setStatus({ tone: 'attention', message: restErrorText(error) }) },
    );
  };

  return (
    <View testID="goals-rest" style={{ gap: theme.space[3] }}>
      <SectionHeader title="Rest days" />
      <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
        {
          "A rest day keeps your streak and your tree's vitality. If you focus on a rest day, it still counts, and the day stays a rest day."
        }
      </Text>
      {allowance ? <Text style={body}>{allowanceText(allowance)}</Text> : null}
      {rest.data && today ? (
        <RestPlanner rest={rest.data} today={today} busy={change.isPending} onToggle={toggle} />
      ) : rest.isPending && rest.failureCount === 0 ? (
        <SkeletonGroup label="Loading your rest days">
          <Skeleton variant="text" lines={2} />
        </SkeletonGroup>
      ) : (
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          {"Planned rest days show when you're online."}
        </Text>
      )}
      <StatusLine status={status} />
    </View>
  );
}

/**
 * This week and next, Monday to Sunday, from the server's week start. Each day says its date
 * and state to screen readers; past days are shown but not offered (the server would refuse
 * them anyway, and stays the judge of every other day). At large text, one day per row.
 */
function RestPlanner({
  rest,
  today,
  busy,
  onToggle,
}: {
  rest: RestDays;
  today: string;
  busy: boolean;
  onToggle: (date: string, planned: boolean) => void;
}) {
  const theme = useTheme();
  const { isLargeText } = useFontScale();
  const planned = new Set(rest.restDays.map((day) => day.date));
  const days = Array.from({ length: PLANNER_DAYS }, (_, i) => addDays(rest.allowance.weekStart, i));
  const later = rest.restDays.filter((day) => day.date > days[days.length - 1]!);

  return (
    <>
      <View
        testID="rest-planner"
        style={
          isLargeText
            ? { flexDirection: 'column', gap: theme.space[2] }
            : { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }
        }
      >
        {days.map((date) => {
          const isPlanned = planned.has(date);
          const past = date < today;
          const state = past
            ? isPlanned
              ? 'past rest day'
              : 'past'
            : isPlanned
              ? 'rest day planned'
              : 'not planned';
          return (
            <Chip
              key={date}
              label={isLargeText ? longDate(date) : shortDate(date)}
              accessibilityLabel={`${longDate(date)}${date === today ? ', today' : ''}, ${state}`}
              selected={isPlanned}
              disabled={past || busy}
              disabledReason={past ? 'This day has passed.' : 'Saving your rest days.'}
              onPress={() => onToggle(date, isPlanned)}
            />
          );
        })}
      </View>
      {later.length > 0 ? (
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          {`Also planned: ${later.map((day) => longDate(day.date)).join('; ')}`}
        </Text>
      ) : null}
    </>
  );
}

function StreakSection({ streak }: { streak: Streak }) {
  const theme = useTheme();
  const body = [theme.type.body, { color: theme.colors.text.primary }];
  const { reached, next } = streak.milestones;
  return (
    <View testID="goals-streak" style={{ gap: theme.space[2] }}>
      <SectionHeader title="Streak" />
      <Text style={body}>{streakDaysText('Current streak', streak.current)}</Text>
      <Text style={body}>{streakDaysText('Longest streak', streak.longest)}</Text>
      <Text style={body}>{streakTodayText(streak.today, streak.current)}</Text>
      {next !== null ? <Text style={body}>{`Next milestone: ${next} days.`}</Text> : null}
      {reached.length > 0 ? (
        <Text style={body}>{`Milestones reached: ${listDays(reached)}.`}</Text>
      ) : null}
      <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
        One focus session a day keeps a streak. The daily goal is separate.
      </Text>
      <RecoveryOffer streak={streak} />
    </View>
  );
}

/**
 * The server's recovery offer, only when it makes one. Accepting asks first (a modal), then
 * posts the offered day; it shows as kept only once the server says so.
 */
function RecoveryOffer({ streak }: { streak: Streak }) {
  const theme = useTheme();
  const accept = useAcceptRecovery();
  const [asking, setAsking] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const offer = streak.recovery.offer;

  const confirm = () => {
    if (!offer) return;
    setAsking(false);
    setStatus(null);
    accept.mutate(offer.missedDate, {
      onSuccess: () => setStatus({ tone: 'neutral', message: 'Your streak is kept.' }),
      onError: (error) => setStatus({ tone: 'attention', message: recoveryErrorText(error) }),
    });
  };

  return (
    <>
      {offer ? (
        <Card>
          <View style={{ gap: theme.space[3] }}>
            <Text style={[theme.type.bodyStrong, { color: theme.colors.text.primary }]}>
              {`Want to keep your ${offer.previousStreak}-day streak?`}
            </Text>
            <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
              {`You came back after ${longDate(offer.missedDate)}. Keeping your streak bridges that day.`}
            </Text>
            <Button
              variant="secondary"
              label="Keep my streak"
              onPress={() => setAsking(true)}
              disabled={accept.isPending}
              disabledReason="Keeping your streak."
            />
          </View>
        </Card>
      ) : null}
      <StatusLine status={status} />
      <Confirmation
        visible={asking && offer !== null}
        presentation="modal"
        title={offer ? `Keep your ${offer.previousStreak}-day streak?` : 'Keep your streak?'}
        message={
          offer
            ? `${longDate(offer.missedDate)} will bridge your streak. It adds no focus time or growth. This uses ${streak.recovery.perMonth === 1 ? 'your streak recovery' : 'one streak recovery'} for this month.`
            : undefined
        }
        confirmLabel="Keep my streak"
        cancelLabel="Not now"
        onConfirm={confirm}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}
