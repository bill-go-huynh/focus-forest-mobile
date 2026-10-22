import { useState } from 'react';
import { Linking, Text, View } from 'react-native';

import type { NotificationCategory, Preferences } from '../api';
import { Button } from '../components/Button';
import { InlineStatus } from '../components/InlineStatus';
import { SwitchRow } from '../components/SwitchRow';
import { useTheme } from '../theme';
import { Input } from '../components/Input';
import {
  parseReminderTime,
  REMINDER_CATEGORIES,
  shiftTime,
  type ReminderCategory,
} from './reminder-times';
import { SectionCard } from '../components/SectionCard';

const LABELS: Record<NotificationCategory, string> = {
  dailyGoalReminder: 'Daily goal reminder',
  scheduledFocusReminder: 'Scheduled focus reminder',
  streakReminder: 'Streak reminder',
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
  friendInvite: 'When a friend invites you to a challenge.',
  focusRoomInvite: 'When a friend invites you to a focus room.',
  challengeUpdate: 'When a friend joins your challenge, or it is complete.',
  badgeUnlocked: 'When you earn a new badge.',
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
    <SectionCard title="Notifications">
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
    </SectionCard>
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
  // Any minute can be typed too (owner, 2026-10-23); Earlier and Later move by a quarter hour.
  const [typing, setTyping] = useState<string | null>(null);
  const [typingError, setTypingError] = useState<string | null>(null);
  const choose = (next: string) => {
    setPending({ from: time, to: next });
    onChange(next);
  };
  const move = (step: 15 | -15) => choose(shiftTime(shown, step));
  const saveTyped = () => {
    const parsed = parseReminderTime(typing ?? '');
    if (!parsed.ok) {
      setTypingError(parsed.message);
      return;
    }
    choose(parsed.time);
    setTyping(null);
    setTypingError(null);
  };
  return (
    <View style={{ gap: theme.space[2], paddingLeft: theme.space[4] }}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: theme.space[2],
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
        {typing === null ? (
          <Button
            variant="tertiary"
            label="Set time"
            accessibilityLabel={`${label}: Set time`}
            onPress={() => setTyping(shown)}
          />
        ) : null}
      </View>
      {typing !== null ? (
        <View style={{ gap: theme.space[2] }}>
          <Input
            label={`${label} time`}
            value={typing}
            onChangeText={(text) => {
              setTyping(text);
              setTypingError(null);
            }}
            error={typingError ?? undefined}
            helper="24-hour time, such as 7:05 or 19:30."
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            onSubmitEditing={saveTyped}
          />
          <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
            <Button variant="secondary" label="Save time" onPress={saveTyped} />
            <Button
              variant="tertiary"
              label="Cancel"
              onPress={() => {
                setTyping(null);
                setTypingError(null);
              }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
