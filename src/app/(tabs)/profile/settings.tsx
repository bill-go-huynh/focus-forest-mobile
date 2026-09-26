import Constants from 'expo-constants';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useSystemReducedMotion } from '../../../accessibility';
import {
  NetworkError,
  useApi,
  type NotificationCategory,
  type PreferenceChanges,
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

  const change = (changes: PreferenceChanges) => {
    setSaveError(null);
    save.mutate(changes, {
      onError: (error) =>
        setSaveError(error instanceof NetworkError ? SAVE_NETWORK_MESSAGE : SAVE_GENERAL_MESSAGE),
    });
  };

  const data = preferences.data;

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
              onValueChange={(sound) => change({ sound })}
            />
            <SwitchRow
              label="Haptics"
              description="Gentle vibrations for focus sessions."
              value={data.haptics}
              onValueChange={(haptics) => change({ haptics })}
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
              onValueChange={(reducedMotion) => change({ reducedMotion })}
            />
          </Section>
          <NotificationSettings
            categories={visibleNotificationCategories()}
            preferences={data}
            onChange={(category: NotificationCategory, enabled: boolean) =>
              change({ notifications: { [category]: { enabled } } })
            }
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
