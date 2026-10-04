import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useFontScale } from '../accessibility';
import type {
  DayCell,
  HistoryFilters,
  MonthInsights,
  PersonalRecord,
  TopicInsight,
  WeekInsights,
} from '../api';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { ErrorState } from '../components/ErrorState';
import { InlineStatus } from '../components/InlineStatus';
import { ListRow } from '../components/ListRow';
import { Screen } from '../components/Screen';
import { Sheet } from '../components/Sheet';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { TopicMark } from '../components/TopicMark';
import { HistoryContent } from '../history/HistoryScreen';
import { useTheme, type Theme } from '../theme';
import { useTopics } from '../topics/queries';
import {
  addDays,
  cellTotals,
  dailyRateText,
  dayLabel,
  formatFocused,
  intensity,
  longDate,
  monthsOf,
  monthTitle,
  narrative,
  nextMonth,
  plural,
  previousMonth,
  recordValue,
  recordWhen,
  topicLine,
  weeklyProgressText,
  weeklyRateText,
  weekTitle,
} from './insights-format';
import { useHeatmap, useMonthInsights, useRecords, useWeekInsights } from './queries';

type MonthRef = { year: number; month: number };
type Period =
  { kind: 'week'; weekStart: string | null } | { kind: 'month'; month: MonthRef | null };
type Scope =
  | { kind: 'day'; date: string }
  | { kind: 'week'; weekStart: string }
  | { kind: 'month'; year: number; month: number };
interface Filters {
  scope: Scope | null;
  topic: { id: string; name: string } | null;
}

const MINUTE = 60_000;

function toHistoryFilters({ scope, topic }: Filters): HistoryFilters | null {
  if (!scope && !topic) return null;
  return {
    ...(scope?.kind === 'day' && { from: scope.date, to: scope.date }),
    ...(scope?.kind === 'week' && { week: scope.weekStart }),
    ...(scope?.kind === 'month' && { month: { year: scope.year, month: scope.month } }),
    ...(topic && { topicId: topic.id }),
  };
}

function scopeText(scope: Scope): string {
  if (scope.kind === 'day') return longDate(scope.date);
  if (scope.kind === 'week') return `week of ${longDate(scope.weekStart)}`;
  // The month as sessions are attributed to it: said as "sessions of", not as dates.
  return `sessions of ${monthTitle(scope.year, scope.month)}`;
}

/**
 * Insights (docs/05 → Insights, docs/02; M3.5): reflection without anxiety. A Week/Month
 * selector, one narrative summary, the period's days (focus, rest, and the daily goal together),
 * then grouped supporting lines, topics, personal records, the year on request, and the focus
 * history with its filters. Every number is the server's for that exact period.
 */
export function InsightsScreen() {
  const theme = useTheme();
  const { isLargeText } = useFontScale();
  const [period, setPeriod] = useState<Period>({ kind: 'week', weekStart: null });
  const [filters, setFilters] = useState<Filters>({ scope: null, topic: null });
  const [showYear, setShowYear] = useState(false);
  const [currentWeek, setCurrentWeek] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<MonthRef | null>(null);

  const week = useWeekInsights(
    period.kind === 'week' ? period.weekStart : null,
    period.kind === 'week',
  );
  const month = useMonthInsights(
    period.kind === 'month' ? period.month : null,
    period.kind === 'month',
  );
  const active = period.kind === 'week' ? week : month;
  const data: WeekInsights | MonthInsights | undefined = active.data;
  const records = useRecords(data !== undefined);

  // The server names the current week and month; navigation moves from its identity.
  if (week.data?.period.current && week.data.period.from !== currentWeek) {
    setCurrentWeek(week.data.period.from);
  }
  if (
    month.data?.period.current &&
    (month.data.period.year !== currentMonth?.year ||
      month.data.period.month !== currentMonth.month)
  ) {
    setCurrentMonth({ year: month.data.period.year, month: month.data.period.month });
  }

  const goWeek = (from: string) =>
    setPeriod({ kind: 'week', weekStart: from === currentWeek ? null : from });
  const goMonth = (ref: MonthRef) =>
    setPeriod({
      kind: 'month',
      month:
        currentMonth && ref.year === currentMonth.year && ref.month === currentMonth.month
          ? null
          : ref,
    });

  const move = (step: -1 | 1) => {
    if (!data) return;
    if (data.period.kind === 'week') goWeek(addDays(data.period.from, step * 7));
    else {
      const { year, month: m } = data.period;
      goMonth(step < 0 ? previousMonth(year, m) : nextMonth(year, m));
    }
  };
  const unit = period.kind === 'week' ? 'week' : 'month';

  return (
    <Screen title="Insights">
      <View
        testID="period-selector"
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.space[2],
          alignItems: 'center',
        }}
      >
        <Chip
          label="Week"
          selected={period.kind === 'week'}
          onPress={() => setPeriod({ kind: 'week', weekStart: null })}
        />
        <Chip
          label="Month"
          selected={period.kind === 'month'}
          onPress={() => setPeriod({ kind: 'month', month: null })}
        />
        <Button
          variant="tertiary"
          label={`Previous ${unit}`}
          onPress={() => move(-1)}
          disabled={!data}
          disabledReason="Loading this period."
        />
        <Button
          variant="tertiary"
          label={`Next ${unit}`}
          onPress={() => move(1)}
          disabled={!data || data.period.current}
          disabledReason={
            data?.period.current ? `This is the current ${unit}.` : 'Loading this period.'
          }
        />
      </View>

      {data ? (
        <PeriodInsights
          data={data}
          stale={active.isRefetchError}
          onDay={(date) => setFilters({ ...filters, scope: { kind: 'day', date } })}
          onTopic={(topic) =>
            setFilters({ ...filters, topic: { id: topic.topicId, name: topic.name } })
          }
        />
      ) : active.isError ? (
        <ErrorState
          message="We couldn't load your insights right now."
          onRetry={() => void active.refetch()}
        />
      ) : (
        <SkeletonGroup label="Loading your insights">
          <Skeleton variant="text" lines={3} />
        </SkeletonGroup>
      )}

      <Records query={records} />

      {showYear ? (
        <YearHeatmap onMonth={goMonth} />
      ) : (
        <Button variant="secondary" label="Show your year" onPress={() => setShowYear(true)} />
      )}

      <View style={{ gap: theme.space[3] }}>
        <Text
          accessibilityRole="header"
          style={[theme.type.headline, { color: theme.colors.text.primary }]}
        >
          Focus history
        </Text>
        <HistoryFilterBar data={data} filters={filters} onChange={setFilters} wrap={isLargeText} />
        <HistoryContent filters={toHistoryFilters(filters)} />
      </View>
    </Screen>
  );
}

function PeriodInsights({
  data,
  stale,
  onDay,
  onTopic,
}: {
  data: WeekInsights | MonthInsights;
  stale: boolean;
  onDay: (date: string) => void;
  onTopic: (topic: TopicInsight) => void;
}) {
  const theme = useTheme();
  const body = [theme.type.body, { color: theme.colors.text.primary }];
  const isWeek = data.period.kind === 'week';
  const title = isWeek
    ? weekTitle(data.period)
    : monthTitle((data as MonthInsights).period.year, (data as MonthInsights).period.month);
  const lines: string[] = [];
  const { summary } = data;
  if (summary.averageFocusedMillisecondsPerActiveDay !== null) {
    lines.push(
      `Average per active day: ${formatFocused(summary.averageFocusedMillisecondsPerActiveDay)}`,
    );
  }
  if (data.longestSession) {
    lines.push(
      `Longest session: ${formatFocused(data.longestSession.focusedMilliseconds)}, ${longDate(data.longestSession.localDate)}`,
    );
  }
  const goals: string[] = [];
  const daily = dailyRateText(data.goals.daily);
  if (daily) goals.push(daily);
  if (isWeek) {
    const weekly = (data as WeekInsights).goals.weekly;
    if (weekly) goals.push(weeklyProgressText(weekly));
  } else {
    const rate = weeklyRateText((data as MonthInsights).goals.weekly);
    if (rate) goals.push(rate);
  }
  const rest = [
    `Rest days: ${data.restDays}`,
    `Current streak: ${plural(data.streak.current, 'day')}`,
    `Longest streak this ${isWeek ? 'week' : 'month'}: ${plural(data.streak.longestInPeriod, 'day')}`,
  ];
  const month = isWeek ? null : (data as MonthInsights);
  const highlights: string[] = [];
  if (month?.mostProductiveDay) {
    highlights.push(
      `Your best day: ${longDate(month.mostProductiveDay.date)} · ${formatFocused(month.mostProductiveDay.focusedMinutes * MINUTE)}`,
    );
  }
  if (month?.mostProductiveWeek) {
    highlights.push(
      `Your best week: Week of ${longDate(month.mostProductiveWeek.weekStart)} · ${formatFocused(month.mostProductiveWeek.focusedMinutes * MINUTE)}`,
    );
  }
  if (month?.topTopic) highlights.push(`Top topic: ${month.topTopic.name}`);
  const archived = month?.archivedStats ?? null;
  const laterSessions =
    archived !== null &&
    (Math.floor(summary.focusedMilliseconds / MINUTE) !== archived.focusedMinutes ||
      summary.sessionCount !== archived.sessionCount);

  return (
    <>
      {stale ? <InlineStatus tone="info" message="Showing the numbers last loaded." /> : null}
      <Text
        testID="insights-summary"
        accessible
        style={[theme.type.headline, { color: theme.colors.text.primary }]}
      >
        {narrative(title, summary, data.period.current)}
      </Text>
      {laterSessions ? (
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          Insights include sessions synced later. Your archived tree stays as it was saved.
        </Text>
      ) : null}
      <DayPattern days={data.days} onDay={onDay} />
      <Group title="Focus" lines={[...lines, ...highlights]} style={body} />
      <Group title="Goals" lines={goals} style={body} />
      <Group title="Rest and streak" lines={rest} style={body} />
      {data.newRecords.length > 0 ? (
        <Group
          title="New bests"
          lines={data.newRecords.map(
            (record) => `New this ${isWeek ? 'week' : 'month'}: ${recordValue(record)}`,
          )}
          style={body}
        />
      ) : null}
      {data.topics.length > 0 ? (
        <View testID="insights-topics" style={{ gap: theme.space[1] }}>
          <Text
            accessibilityRole="header"
            style={[theme.type.headline, { color: theme.colors.text.primary }]}
          >
            Topics
          </Text>
          {data.topics.map((topic) => (
            <ListRow
              key={topic.topicId}
              title={topic.name}
              subtitle={topicLine(topic)}
              leading={() => <TopicMark color={topic.color} icon={topic.icon} />}
              onPress={() => onTopic(topic)}
              accessibilityHint="Shows this topic's sessions in the history below."
            />
          ))}
        </View>
      ) : null}
    </>
  );
}

function Group({ title, lines, style }: { title: string; lines: string[]; style: object[] }) {
  const theme = useTheme();
  if (lines.length === 0) return null;
  return (
    <View style={{ gap: theme.space[1] }}>
      <Text
        accessibilityRole="header"
        style={[theme.type.bodyStrong, { color: theme.colors.text.secondary }]}
      >
        {title}
      </Text>
      {lines.map((line) => (
        <Text key={line} style={style}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function cellColor(theme: Theme, cell: DayCell): string {
  // Presence, not absence: an empty day is neutral; more focus is a deeper green. Never red.
  return [
    theme.colors.surface.sunken,
    theme.colors.forest.soft,
    theme.colors.forest.primary,
    theme.colors.forest.deep,
  ][intensity(cell)]!;
}

/** The period's days, Monday first; each says its date, focus, rest, and daily goal. */
function DayPattern({ days, onDay }: { days: DayCell[]; onDay: (date: string) => void }) {
  const theme = useTheme();
  return (
    <View
      testID="period-days"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[1] }}
    >
      {days.map((cell) => (
        <Pressable
          key={cell.date}
          testID={`day-${cell.date}`}
          accessibilityRole="button"
          accessibilityLabel={dayLabel(cell)}
          accessibilityHint="Shows this day's sessions in the history below."
          onPress={() => onDay(cell.date)}
          style={{
            width: theme.space[10],
            height: theme.space[10],
            borderRadius: theme.radius.sm,
            backgroundColor: cellColor(theme, cell),
            alignItems: 'flex-end',
            padding: theme.space[1],
          }}
        >
          {cell.rest ? (
            // Rest is its own mark, separate from the focus shade: a day can be both.
            <View
              testID={`day-${cell.date}-rest`}
              style={{
                width: theme.space[2],
                height: theme.space[2],
                borderRadius: theme.radius.full,
                borderWidth: theme.control.borderWidth,
                borderColor: theme.colors.text.secondary,
                backgroundColor: theme.colors.surface.primary,
              }}
            />
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

function Records({ query }: { query: ReturnType<typeof useRecords> }) {
  const theme = useTheme();
  const body = [theme.type.body, { color: theme.colors.text.primary }];
  return (
    <View testID="insights-records" style={{ gap: theme.space[2] }}>
      <Text
        accessibilityRole="header"
        style={[theme.type.headline, { color: theme.colors.text.primary }]}
      >
        Personal records
      </Text>
      {query.data === undefined ? (
        query.isError ? (
          <InlineStatus
            tone="info"
            message="Your records aren't available right now."
            action={{ label: 'Try again', onPress: () => void query.refetch() }}
          />
        ) : null
      ) : query.data.length === 0 ? (
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          Your personal records appear as you focus.
        </Text>
      ) : (
        query.data.map((record: PersonalRecord) => (
          <View
            key={record.kind}
            accessible
            accessibilityLabel={`${recordValue(record)}, ${recordWhen(record)}`}
          >
            <Text style={body}>{recordValue(record)}</Text>
            <Text style={[theme.type.caption, { color: theme.colors.text.secondary }]}>
              {recordWhen(record)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

/**
 * The last year (GET /me/insights/heatmap, asked only when opened). The grid is visual only and
 * hidden from screen readers; a summary and one line per month carry the same story, and a
 * month opens its own period, where each day can be read.
 */
function YearHeatmap({ onMonth }: { onMonth: (month: MonthRef) => void }) {
  const theme = useTheme();
  const heatmap = useHeatmap(true);
  if (!heatmap.data) {
    return heatmap.isError ? (
      <InlineStatus
        tone="info"
        message="Your year isn't available right now."
        action={{ label: 'Try again', onPress: () => void heatmap.refetch() }}
      />
    ) : (
      <SkeletonGroup label="Loading your year">
        <Skeleton variant="block" />
      </SkeletonGroup>
    );
  }
  const totals = cellTotals(heatmap.data.days);
  return (
    <View style={{ gap: theme.space[3] }}>
      <Text
        accessibilityRole="header"
        style={[theme.type.headline, { color: theme.colors.text.primary }]}
      >
        Your year
      </Text>
      <Text style={[theme.type.body, { color: theme.colors.text.primary }]}>
        {`Over the last year: ${plural(totals.activeDays, 'active day')}, ${plural(totals.restDays, 'rest day')}, daily goal met on ${plural(totals.goalMet, 'day')}.`}
      </Text>
      <View
        testID="year-heatmap"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[0] + 2 }}
      >
        {heatmap.data.days.map((cell) => (
          <View
            key={cell.date}
            style={{
              width: theme.space[2],
              height: theme.space[2],
              borderRadius: theme.radius.sm / 4,
              backgroundColor: cellColor(theme, cell),
              borderWidth: cell.rest ? theme.control.borderWidth : 0,
              borderColor: theme.colors.text.secondary,
            }}
          />
        ))}
      </View>
      {monthsOf(heatmap.data.days)
        .reverse()
        .map(({ year, month, cells }) => {
          const m = cellTotals(cells);
          const label = `${monthTitle(year, month)}: ${formatFocused(m.focusedMilliseconds)} focused, ${plural(m.activeDays, 'active day')}, ${plural(m.restDays, 'rest day')}`;
          return (
            <Pressable
              key={`${year}-${month}`}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityHint="Opens this month's insights."
              onPress={() => onMonth({ year, month })}
            >
              <Text style={[theme.type.body, { color: theme.colors.text.primary }]}>{label}</Text>
            </Pressable>
          );
        })}
    </View>
  );
}

/**
 * History filters as explicit state: the selected period (its week by Monday, or its month as
 * sessions are attributed), a day tapped above, and a topic (archived ones included). Each
 * change shows a new filtered list from its first page.
 */
function HistoryFilterBar({
  data,
  filters,
  onChange,
  wrap,
}: {
  data: WeekInsights | MonthInsights | undefined;
  filters: Filters;
  onChange: (filters: Filters) => void;
  wrap: boolean;
}) {
  const theme = useTheme();
  const [choosing, setChoosing] = useState(false);
  const topics = useTopics({}, { enabled: choosing });
  const periodScope: Scope | null = !data
    ? null
    : data.period.kind === 'week'
      ? { kind: 'week', weekStart: data.period.from }
      : { kind: 'month', year: data.period.year, month: data.period.month };
  const periodLabel = !data
    ? null
    : data.period.kind === 'week'
      ? data.period.current
        ? 'This week only'
        : `Week of ${longDate(data.period.from)} only`
      : data.period.current
        ? 'This month only'
        : `${monthTitle(data.period.year, data.period.month)} only`;
  const scopeSelected =
    periodScope !== null && JSON.stringify(filters.scope) === JSON.stringify(periodScope);
  const showing = [
    ...(filters.scope ? [scopeText(filters.scope)] : []),
    ...(filters.topic ? [filters.topic.name] : []),
  ];

  return (
    <View style={{ gap: theme.space[2] }}>
      <View
        testID="history-filters"
        style={{ flexDirection: wrap ? 'column' : 'row', flexWrap: 'wrap', gap: theme.space[2] }}
      >
        {periodScope && periodLabel ? (
          <Chip
            label={periodLabel}
            selected={scopeSelected}
            onPress={() => onChange({ ...filters, scope: scopeSelected ? null : periodScope })}
          />
        ) : null}
        <Chip
          label={filters.topic ? `Topic: ${filters.topic.name}` : 'All topics'}
          selected={filters.topic !== null}
          onPress={() => setChoosing(true)}
        />
      </View>
      {showing.length > 0 ? (
        <>
          <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
            {`Showing: ${showing.join(' · ')}`}
          </Text>
          <Button
            variant="tertiary"
            label="Clear filters"
            onPress={() => onChange({ scope: null, topic: null })}
          />
        </>
      ) : null}
      <Sheet visible={choosing} onRequestClose={() => setChoosing(false)} title="Choose a topic">
        <View style={{ gap: theme.space[1] }}>
          <ListRow
            title="All topics"
            onPress={() => {
              setChoosing(false);
              onChange({ ...filters, topic: null });
            }}
          />
          {(topics.data ?? []).map((topic) => (
            <ListRow
              key={topic.id}
              title={topic.name}
              subtitle={topic.status === 'archived' ? 'archived topic' : undefined}
              leading={() => <TopicMark color={topic.color} icon={topic.icon} />}
              onPress={() => {
                setChoosing(false);
                onChange({ ...filters, topic: { id: topic.id, name: topic.name } });
              }}
            />
          ))}
          {topics.isError ? (
            <InlineStatus tone="info" message="Topics aren't available right now." />
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}
