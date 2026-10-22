import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Share, View } from 'react-native';

import { useSystemReducedMotion } from '../../../accessibility';
import {
  exportMyData,
  NetworkError,
  useApi,
  type NotificationCategory,
  type PreferenceChanges,
  type Preferences,
} from '../../../api';
import { FormMessage } from '../../../auth';
import { Button, DestructiveButton } from '../../../components/Button';
import { Chip } from '../../../components/Chip';
import { ErrorState } from '../../../components/ErrorState';
import { ListRow } from '../../../components/ListRow';
import { Screen } from '../../../components/Screen';
import { Skeleton, SkeletonGroup } from '../../../components/Skeleton';
import { SwitchRow } from '../../../components/SwitchRow';
import { usePushRegistration, useSignOut } from '../../../notifications';
import {
  NotificationSettings,
  usePreferences,
  useUpdatePreferences,
  visibleNotificationCategories,
} from '../../../preferences';
import { SUGGESTED_TIMES, type ReminderCategory } from '../../../preferences/reminder-times';
import { SeasonSettings } from '../../../seasons/SeasonSettings';
import { useTheme, type ThemePreference } from '../../../theme';
import { SectionCard } from '../../../components/SectionCard';

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

type DisplaySwitch = 'sound' | 'reducedMotion' | 'shareUsageData';
type SwitchKey = DisplaySwitch | NotificationCategory;
const isDisplaySwitch = (key: SwitchKey): key is DisplaySwitch =>
  key === 'sound' || key === 'reducedMotion' || key === 'shareUsageData';
const isReminder = (key: SwitchKey): key is ReminderCategory => key in SUGGESTED_TIMES;
type Flipped = Partial<Record<SwitchKey, boolean>>;

/** The saved preferences with the switches that are still saving shown as flipped. */
function withFlipped(data: Preferences, flipped: Flipped): Preferences {
  const shown = { ...data };
  const notifications: Record<string, { enabled: boolean }> = { ...data.notifications };
  for (const [key, value] of Object.entries(flipped) as [SwitchKey, boolean][]) {
    if (isDisplaySwitch(key)) shown[key] = value;
    else notifications[key] = { ...notifications[key], enabled: value };
  }
  return { ...shown, notifications: notifications as Preferences['notifications'] };
}

const SAVE_NETWORK_MESSAGE = "We couldn't save that change. Check your connection and try again.";
const SAVE_GENERAL_MESSAGE = "We couldn't save that change. Please try again.";

/**
 * Settings, under Profile (docs/05 §4): theme, sound, reduced motion, the
 * notification categories with the reminders' times (M6.1), usage data sharing (CR.6), and sign
 * out, a copy of your data, and deleting the account (M7.1). Each change saves on its own (A5: PATCH /me/preferences). Turning a notification on asks
 * for the permission the first time (docs/02: in context, never at launch) and registers this
 * device; sign-out unregisters it first.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const push = usePushRegistration();
  const signOut = useSignOut();
  const { client } = useApi();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  /** A copy of everything stored about the person, through the share sheet (M7.1). */
  const download = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const data = await exportMyData(client);
      await Share.share({ title: 'Focus Forest data', message: JSON.stringify(data, null, 2) });
    } catch (error) {
      setExportError(
        error instanceof NetworkError
          ? "We couldn't prepare your data. Check your connection and try again."
          : "We couldn't prepare your data. Please try again.",
      );
    }
    setExporting(false);
  };
  // The phone's settings refuse notifications: said once something is on, or turned on.
  const [systemDenied, setSystemDenied] = useState(false);
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
  const flip = (key: SwitchKey, value: boolean, time?: string) => {
    setFlipped((current) => ({ ...current, [key]: value }));
    // Clear only this flip: a later flip of the same switch keeps its own entry.
    const settled = () =>
      setFlipped((current) => {
        if (current[key] !== value) return current;
        const { [key]: _done, ...rest } = current;
        return rest;
      });
    change(
      isDisplaySwitch(key)
        ? { [key]: value }
        : {
            notifications: {
              [key]: time === undefined ? { enabled: value } : { enabled: value, time },
            },
          },
      settled,
    );
  };

  const data = preferences.data ? withFlipped(preferences.data, flipped) : undefined;

  useEffect(() => {
    let current = true;
    void push.permission().then((status) => {
      if (current) setSystemDenied(status === 'denied');
    });
    return () => {
      current = false;
    };
  }, [push]);

  /** A notification switch: on asks (first time only) and registers; a reminder gets a time. */
  const flipNotification = (category: NotificationCategory, enabled: boolean) => {
    if (!enabled) {
      flip(category, false);
      return;
    }
    const stored = preferences.data?.notifications;
    const time =
      isReminder(category) && stored && stored[category].time === null
        ? SUGGESTED_TIMES[category]
        : undefined;
    flip(category, true, time);
    void push.enable().then((status) => setSystemDenied(status === 'denied'));
  };
  const anyNotificationOn = data
    ? Object.values(data.notifications).some((setting) => setting.enabled)
    : false;

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
          <Section title="Sound">
            <SwitchRow
              label="Sound"
              description="Sounds for focus sessions, such as the end of a session."
              value={data.sound}
              onValueChange={(sound) => flip('sound', sound)}
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
          <Section title="Privacy">
            <ListRow
              title="Privacy"
              subtitle="Who sees each part of your profile"
              onPress={() => router.push('/profile/privacy')}
            />
            <ListRow title="Blocked people" onPress={() => router.push('/profile/blocked')} />
            <SwitchRow
              label="Share usage data"
              description="Helps us see whether Focus Forest is useful: when the app is opened and which screens are used. Your notes and topic names are never shared."
              value={data.shareUsageData}
              onValueChange={(shareUsageData) => flip('shareUsageData', shareUsageData)}
            />
          </Section>
          <SeasonSettings />
          <NotificationSettings
            categories={visibleNotificationCategories()}
            preferences={data}
            onChange={flipNotification}
            onTimeChange={(category, time) => change({ notifications: { [category]: { time } } })}
            blockedBySystem={systemDenied && anyNotificationOn}
          />
        </>
      )}
      <Section title="Account">
        {/* Your data (M7.1): a copy to keep, and deletion. */}
        <Button
          variant="secondary"
          label="Download my data"
          disabled={exporting}
          onPress={() => void download()}
        />
        {exportError ? <FormMessage message={exportError} /> : null}
        <Button variant="secondary" label="Sign out" onPress={() => void signOut()} />
        <DestructiveButton
          label="Delete account"
          onRequestConfirm={() => router.push('/profile/delete-account')}
        />
      </Section>
      {version ? (
        <Section title="About">
          <ListRow title="Version" meta={version} />
        </Section>
      ) : null}
    </Screen>
  );
}

/** One group of settings, in a card (owner, 2026-10-22: one card per part). */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <SectionCard title={title}>{children}</SectionCard>;
}
