import { useState } from 'react';
import { Text, View } from 'react-native';

import { useFontScale } from '../accessibility';
import { NetworkError, SHOWCASE_MAX, type Achievement, type EarnedBadge } from '../api';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { InlineStatus } from '../components/InlineStatus';
import { ProgressBar } from '../components/ProgressBar';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { useTheme } from '../theme';
import { BadgeMark } from './BadgeMark';
import { useAchievements, useBadges, useSetShowcase } from './queries';
import { badgeSections, progressRatio, progressText } from './unlocks';

const SHOWCASE_FULL_TEXT = `Your showcase holds ${SHOWCASE_MAX} badges. Unpin one to pin another.`;

/**
 * Achievements and badge showcase (docs/05 §3, Profile → Achievements): the showcase row is the
 * focal point, then the earned badges by category, then quiet progress toward the achievements
 * still in progress ("10 Hours · 3.5 / 10 h"). Everything is the server's: ownership, progress,
 * and the showcase. Pinning is the user's choice (docs/02); it is sent whole and in order, and
 * only the server's answer is shown. No percentages, no urgency, nothing celebrated here.
 */
export function AchievementsScreen() {
  const theme = useTheme();
  const badges = useBadges();
  const achievements = useAchievements();
  const save = useSetShowcase();
  const [status, setStatus] = useState<string | null>(null);

  if (badges.isError || achievements.isError) {
    return (
      <Screen>
        <ErrorState
          message="We couldn't load your achievements right now."
          onRetry={() => {
            void badges.refetch();
            void achievements.refetch();
          }}
        />
      </Screen>
    );
  }
  if (!badges.data || !achievements.data) {
    return (
      <Screen>
        <SkeletonGroup label="Loading your achievements">
          <Skeleton variant="text" lines={4} />
        </SkeletonGroup>
      </Screen>
    );
  }

  const owned = badges.data.items;
  const showcase = badges.data.showcase.map((badge) => badge.id);
  const full = showcase.length >= SHOWCASE_MAX;
  const inProgress = achievements.data.items.filter((achievement) => !achievement.completed);

  const send = (badgeIds: string[]) => {
    setStatus(null);
    save.mutate(badgeIds, {
      onError: (error) =>
        setStatus(
          error instanceof NetworkError
            ? 'Changing your showcase needs a connection. Nothing was changed.'
            : "That badge can't be pinned right now.",
        ),
    });
  };
  const move = (from: number, to: number) => {
    const next = [...showcase];
    [next[from], next[to]] = [next[to]!, next[from]!];
    send(next);
  };

  return (
    <Screen>
      <SectionHeader title="Showcase" />
      <Card testID="showcase">
        {badges.data.showcase.length === 0 ? (
          <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
            {`Pin up to ${SHOWCASE_MAX} badges to show them here.`}
          </Text>
        ) : (
          <View style={{ gap: theme.space[3] }}>
            {badges.data.showcase.map((badge, index, all) => (
              <View key={badge.id} style={{ gap: theme.space[2] }}>
                <BadgeLine badge={badge} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
                  {index > 0 ? (
                    <Button
                      variant="tertiary"
                      label="Earlier"
                      accessibilityLabel={`Move ${badge.name} earlier`}
                      onPress={() => move(index, index - 1)}
                      disabled={save.isPending}
                    />
                  ) : null}
                  {index < all.length - 1 ? (
                    <Button
                      variant="tertiary"
                      label="Later"
                      accessibilityLabel={`Move ${badge.name} later`}
                      onPress={() => move(index, index + 1)}
                      disabled={save.isPending}
                    />
                  ) : null}
                  <Button
                    variant="tertiary"
                    label="Unpin"
                    accessibilityLabel={`Unpin ${badge.name}`}
                    onPress={() => send(showcase.filter((id) => id !== badge.id))}
                    disabled={save.isPending}
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>
      {status ? <InlineStatus tone="attention" message={status} live /> : null}
      {full ? (
        <Text style={[theme.type.caption, { color: theme.colors.text.secondary }]}>
          {SHOWCASE_FULL_TEXT}
        </Text>
      ) : null}

      {badgeSections(owned).map((section) => (
        <View key={section.title} style={{ gap: theme.space[3] }}>
          <SectionHeader title={section.title} />
          {section.badges.map((badge) => (
            <View key={badge.id} style={{ gap: theme.space[2] }}>
              <BadgeLine badge={badge} detail />
              {showcase.includes(badge.id) ? null : (
                <View style={{ alignItems: 'flex-start' }}>
                  <Button
                    variant="tertiary"
                    label="Pin"
                    accessibilityLabel={`Pin ${badge.name} to your showcase`}
                    onPress={() => send([...showcase, badge.id])}
                    disabled={full || save.isPending}
                    disabledReason={full ? SHOWCASE_FULL_TEXT : 'Saving your showcase.'}
                  />
                </View>
              )}
            </View>
          ))}
        </View>
      ))}

      {inProgress.length > 0 ? (
        <View style={{ gap: theme.space[3] }}>
          <SectionHeader title="In progress" />
          {inProgress.map((achievement) => (
            <AchievementLine key={achievement.id} achievement={achievement} />
          ))}
        </View>
      ) : null}
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

/** A badge's art beside its name (and, in the lists, what it marks). */
function BadgeLine({ badge, detail = false }: { badge: EarnedBadge; detail?: boolean }) {
  const theme = useTheme();
  const { isLargeText } = useFontScale();
  return (
    <View
      style={{
        flexDirection: isLargeText ? 'column' : 'row',
        alignItems: isLargeText ? 'flex-start' : 'center',
        gap: theme.space[3],
      }}
    >
      <BadgeMark badge={badge} />
      <View style={{ flexShrink: 1, gap: theme.space[1] }}>
        <Text style={[theme.type.bodyStrong, { color: theme.colors.text.primary }]}>
          {badge.name}
        </Text>
        {detail ? (
          <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
            {badge.description}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** An achievement still in progress: its badge, and the server's progress when it shows one. */
function AchievementLine({ achievement }: { achievement: Achievement }) {
  const theme = useTheme();
  const { isLargeText } = useFontScale();
  const { badge } = achievement;
  const text = progressText(achievement);
  return (
    <View
      style={{
        flexDirection: isLargeText ? 'column' : 'row',
        alignItems: isLargeText ? 'flex-start' : 'center',
        gap: theme.space[3],
      }}
    >
      <BadgeMark badge={badge} />
      <View style={{ flex: 1, gap: theme.space[1] }}>
        <Text style={[theme.type.bodyStrong, { color: theme.colors.text.primary }]}>
          {badge.name}
        </Text>
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          {badge.description}
        </Text>
        {text ? (
          <ProgressBar ratio={progressRatio(achievement)} label={badge.name} valueText={text} />
        ) : null}
      </View>
    </View>
  );
}
