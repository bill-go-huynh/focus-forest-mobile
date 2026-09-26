import { Text, View } from 'react-native';

import type { NotificationCategory, Preferences } from '../api';
import { SwitchRow } from '../components/SwitchRow';
import { useTheme } from '../theme';

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

/**
 * One switch per available notification category (A5), each saved on its own. With no
 * category available it renders nothing: no empty or "coming soon" section.
 */
export function NotificationSettings({
  categories,
  preferences,
  onChange,
}: {
  categories: readonly NotificationCategory[];
  preferences: Preferences;
  onChange: (category: NotificationCategory, enabled: boolean) => void;
}) {
  const theme = useTheme();
  if (categories.length === 0) return null;
  return (
    <View>
      <Text
        accessibilityRole="header"
        style={[theme.type.headline, { color: theme.colors.text.primary }]}
      >
        Notifications
      </Text>
      {categories.map((category) => (
        <SwitchRow
          key={category}
          label={LABELS[category]}
          value={preferences.notifications[category].enabled}
          onValueChange={(enabled) => onChange(category, enabled)}
        />
      ))}
    </View>
  );
}
