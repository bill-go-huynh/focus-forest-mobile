import Constants from 'expo-constants';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useSystemReducedMotion } from '../../../accessibility';
import {
  NetworkError,
  useApi,
  type NotificationCategory,
  type PreferenceChanges,
  type Preferences,
} from '../../../api';
import { FormMessage } from '../../../auth';
import { Button } from '../../../components/Button';
import { Chip } from '../../../components/Chip';
import { ErrorState } from '../../../components/ErrorState';
import { ListRow } from '../../../components/ListRow';
import { Screen } from '../../../components/Screen';
import { Skeleton, SkeletonGroup } from '../../../components/Skeleton';
import { SwitchRow } from '../../../components/SwitchRow';
import {
  NotificationSettings,
  usePreferences,
  useUpdatePreferences,
  visibleNotificationCategories,
} from '../../../preferences';
import { useTheme, type ThemePreference } from '../../../theme';

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

type SwitchKey = 'sound' | 'haptics' | 'reducedMotion' | NotificationCategory;
type Flipped = Partial<Record<SwitchKey, boolean>>;

/** The saved preferences with the switches that are still saving shown as flipped. */
function withFlipped(data: Preferences, flipped: Flipped): Preferences {
  const shown = { ...data };
  const notifications: Record<string, { enabled: boolean }> = { ...data.notifications };
  for (const [key, value] of Object.entries(flipped) as [SwitchKey, boolean][]) {
    if (key === 'sound' || key === 'haptics' || key === 'reducedMotion') shown[key] = value;
    else notifications[key] = { ...notifications[key], enabled: value };
  }
  return { ...shown, notifications: notifications as Preferences['notifications'] };
}

const SAVE_NETWORK_MESSAGE = "We couldn't save that change. Check your connection and try again.";
const SAVE_GENERAL_MESSAGE = "We couldn't save that change. Please try again.";

/**
 * Settings, under Profile (docs/05 §4): theme, sound, haptics, reduced motion, the
 * notification categories that exist so far, and sign out. Each change saves on its own
 * (A5: PATCH /me/preferences). Sound and haptics are stored now; their behavior comes with
 * the timer in Phase 2.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const { auth } = useApi();
  const preferences = usePreferences();
  const save = useUpdatePreferences();
  const systemReducedMotion = useSystemReducedMotion();
  const [saveError, setSaveError] = useState<string | null>(null);
  const version = Constants.expoConfig?.version;

  // Switches that are saving. React Native's Switch sets the native view back to `value`
  // right after a flip, and the optimistic query update lands a tick later, so without this
  // the switch jumped back and forward. Each entry is set in the flip's own event and cleared
  // when its save settles; by then the cache holds the saved or restored value.
  const [flipped, setFlipped] = useState<Flipped>({});

  const change = (changes: PreferenceChanges, onSettled?: () => void) => {
    setSaveError(null);
    save.mutate(changes, {
      onError: (error) =>
        setSaveError(error instanceof NetworkError ? SAVE_NETWORK_MESSAGE : SAVE_GENERAL_MESSAGE),
      onSettled,
    });
  };
  const flip = (key: SwitchKey, value: boolean) => {
    setFlipped((current) => ({ ...current, [key]: value }));
    // Clear only this flip: a later flip of the same switch keeps its own entry.
    const settled = () =>
      setFlipped((current) => {
        if (current[key] !== value) return current;
        const { [key]: _done, ...rest } = current;
        return rest;
      });
    change(
      key === 'sound' || key === 'haptics' || key === 'reducedMotion'
        ? { [key]: value }
        : { notifications: { [key]: { enabled: value } } },
      settled,
    );
  };

  const data = preferences.data ? withFlipped(preferences.data, flipped) : undefined;

  return (
    <Screen title="Settings" safeTop={false}>
      {saveError ? <FormMessage message={saveError} /> : null}
      {preferences.isPending ? (
        <SkeletonGroup label="Loading your settings">
          <Skeleton variant="text" lines={5} />
        </SkeletonGroup>
      ) : preferences.isError || !data ? (
        <ErrorState
          message="We couldn't load your settings right now."
          onRetry={() => void preferences.refetch()}
        />
      ) : (
        <>
          <Section title="Appearance">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
              {THEMES.map(({ value, label }) => (
                <Chip
                  key={value}
                  label={label}
                  selected={data.theme === value}
                  onPress={() => {
                    if (data.theme !== value) change({ theme: value });
                  }}
                />
              ))}
            </View>
          </Section>
          <Section title="Sound and haptics">
            <SwitchRow
              label="Sound"
              description="Sounds for focus sessions, such as the end of a session."
              value={data.sound}
              onValueChange={(sound) => flip('sound', sound)}
            />
            <SwitchRow
              label="Haptics"
              description="Gentle vibrations for focus sessions."
              value={data.haptics}
              onValueChange={(haptics) => flip('haptics', haptics)}
            />
          </Section>
          <Section title="Motion">
            <SwitchRow
              label="Reduce motion"
              description={
                systemReducedMotion
                  ? 'Your device already reduces motion, so it stays reduced here too.'
                  : 'Uses gentle fades instead of movement.'
              }
              value={data.reducedMotion}
              onValueChange={(reducedMotion) => flip('reducedMotion', reducedMotion)}
            />
          </Section>
          <NotificationSettings
            categories={visibleNotificationCategories()}
            preferences={data}
            onChange={(category: NotificationCategory, enabled: boolean) => flip(category, enabled)}
          />
        </>
      )}
      <Section title="Account">
        <Button variant="secondary" label="Sign out" onPress={() => void auth.signOut()} />
      </Section>
      {version ? (
        <Section title="About">
          <ListRow title="Version" meta={version} />
        </Section>
      ) : null}
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[2] }}>
      <Text
        accessibilityRole="header"
        style={[theme.type.headline, { color: theme.colors.text.primary }]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}
