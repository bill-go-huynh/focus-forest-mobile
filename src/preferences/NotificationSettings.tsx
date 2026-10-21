import { useState } from 'react';
import { Linking, Text, View } from 'react-native';

import type { NotificationCategory, Preferences } from '../api';
import { Button } from '../components/Button';
import { InlineStatus } from '../components/InlineStatus';
import { SwitchRow } from '../components/SwitchRow';
import { useTheme } from '../theme';
import { REMINDER_CATEGORIES, shiftTime, type ReminderCategory } from './reminder-times';
import { useHaptic } from '../haptics/haptics';

const LABELS: Record<NotificationCategory, string> = {
  dailyGoalReminder: 'Daily goal reminder',
  scheduledFocusReminder: 'Scheduled focus reminder',
  streakReminder: 'Streak reminder',
  eventStart: 'Event starts',
  eventEndingSoon: 'Event ending soon',
  friendInvite: 'Friend invites',
  focusRoomInvite: 'Focus room invites',
  challengeUpdate: 'Challenge updates',
  badgeUnlocked: 'Badge unlocked',
  monthlyRecapReady: 'Monthly recap ready',
};

/** What each one sends, in plain words (M6.1; what the API sends: A6.2, A6.3). */
const DESCRIPTIONS: Record<NotificationCategory, string> = {
  dailyGoalReminder: 'At a time you choose, if today’s goal is still open.',
  scheduledFocusReminder: 'At a time you choose, to start your planned focus.',
  streakReminder: 'At a time you choose, on days without focus yet.',
  eventStart: 'When an event begins.',
  eventEndingSoon: 'Two days before an event you joined ends.',
  friendInvite: 'When a friend invites you to a challenge.',
  focusRoomInvite: 'When a friend invites you to a focus room.',
  challengeUpdate: 'When a friend joins your challenge, or it is complete.',
  badgeUnlocked: 'When a Community Tree you helped grow earns you a badge.',
  monthlyRecapReady: 'When last month’s recap is ready.',
};

const isReminder = (category: NotificationCategory): category is ReminderCategory =>
  (REMINDER_CATEGORIES as readonly string[]).includes(category);

/**
 * One switch per available notification category (A5), each saying what it sends and saved on
 * its own. The three reminders show their time while on, moved by quarter hours (docs/11:
 * reminder times are user-set). When the phone's settings keep notifications off, a calm note
 * says so and opens them. With no category available it renders nothing.
 */
export function NotificationSettings({
  categories,
  preferences,
  onChange,
  onTimeChange,
  blockedBySystem = false,
}: {
  categories: readonly NotificationCategory[];
  preferences: Preferences;
  onChange: (category: NotificationCategory, enabled: boolean) => void;
  onTimeChange?: (category: ReminderCategory, time: string) => void;
  /** The phone's settings refuse notifications for the app. */
  blockedBySystem?: boolean;
}) {
  const theme = useTheme();
  if (categories.length === 0) return null;
  return (
    <View style={{ gap: theme.space[2] }}>
      <Text
        accessibilityRole="header"
        style={[theme.type.headline, { color: theme.colors.text.primary }]}
      >
        Notifications
      </Text>
      {blockedBySystem ? (
        <InlineStatus
          tone="attention"
          live
          message="Notifications are off for Focus Forest in your phone’s settings, so none can arrive yet."
          action={{ label: 'Open phone settings', onPress: () => void Linking.openSettings() }}
        />
      ) : null}
      {categories.map((category) => {
        const setting = preferences.notifications[category];
        const time = isReminder(category) ? preferences.notifications[category].time : null;
        return (
          <View key={category} style={{ gap: theme.space[1] }}>
            <SwitchRow
              label={LABELS[category]}
              description={DESCRIPTIONS[category]}
              value={setting.enabled}
              onValueChange={(enabled) => onChange(category, enabled)}
            />
            {isReminder(category) && setting.enabled && time && onTimeChange ? (
              <ReminderTime
                label={LABELS[category]}
                time={time}
                onChange={(next) => onTimeChange(category, next)}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function ReminderTime({
  label,
  time,
  onChange,
}: {
  label: string;
  time: string;
  onChange: (time: string) => void;
}) {
  const theme = useTheme();
  // The time just chosen, while the saved one is still what it was when pressed: the optimistic
  // update lands a tick later, so two quick presses would otherwise move from the same time.
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null);
  const shown = pending && pending.from === time ? pending.to : time;
  const haptic = useHaptic();
  const move = (step: 15 | -15) => {
    haptic('select');
    const next = shiftTime(shown, step);
    setPending({ from: time, to: next });
    onChange(next);
  };
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: theme.space[2],
        paddingLeft: theme.space[4],
      }}
    >
      <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
        {`Reminder at ${shown}`}
      </Text>
      <Button
        variant="tertiary"
        label="Earlier"
        accessibilityLabel={`${label} 15 minutes earlier`}
        onPress={() => move(-15)}
      />
      <Button
        variant="tertiary"
        label="Later"
        accessibilityLabel={`${label} 15 minutes later`}
        onPress={() => move(15)}
      />
    </View>
  );
}
