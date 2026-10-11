import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import {
  NetworkError,
  PRIVACY_CATEGORIES,
  PRIVACY_LEVELS,
  type PrivacyCategory,
  type PrivacyChanges,
  type PrivacyLevel,
} from '../api';
import { FormMessage } from '../auth';
import { Chip } from '../components/Chip';
import { ErrorState } from '../components/ErrorState';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { SwitchRow } from '../components/SwitchRow';
import { useTheme } from '../theme';
import { usePrivacy, useUpdatePrivacy } from './queries';

const CATEGORY: Record<PrivacyCategory, { title: string; description: string }> = {
  profile: { title: 'Profile', description: 'Your bio and when you joined.' },
  forest: { title: 'Forest', description: 'Your planted trees, for visits.' },
  statistics: { title: 'Focus statistics', description: 'Your focus time and streaks.' },
  badges: { title: 'Badges', description: 'Your showcase and recent badges.' },
  currentTree: { title: 'Current tree', description: "This month's tree as it grows." },
};

const LEVEL: Record<PrivacyLevel, string> = {
  public: 'Public',
  friends: 'Friends',
  private: 'Private',
};

/**
 * Privacy (docs/02 Privacy, spec §19.1): who sees each part of the profile, Public, Friends (mutual
 * follows), or Private, and whether the user appears on leaderboards (A5.8, opt-in). Each change
 * saves on its own; the server's answer is what is shown.
 */
export function PrivacyScreen() {
  const theme = useTheme();
  const privacy = usePrivacy();
  const save = useUpdatePrivacy();
  const [error, setError] = useState<string | null>(null);

  const change = (changes: PrivacyChanges) => {
    setError(null);
    save.mutate(changes, {
      onError: (caught) =>
        setError(
          caught instanceof NetworkError
            ? "We couldn't save that change. Check your connection and try again."
            : "We couldn't save that change. Please try again.",
        ),
    });
  };

  return (
    <Screen title="Privacy" safeTop={false}>
      {error ? <FormMessage message={error} /> : null}
      {privacy.isPending ? (
        <SkeletonGroup label="Loading your privacy settings">
          <Skeleton variant="text" lines={5} />
        </SkeletonGroup>
      ) : privacy.isError ? (
        <ErrorState
          message="We couldn't load your privacy settings right now."
          onRetry={() => void privacy.refetch()}
        />
      ) : (
        <>
          <Muted>Friends means people you follow who follow you back.</Muted>
          {PRIVACY_CATEGORIES.map((category) => (
            <View key={category} testID={`privacy-${category}`} style={{ gap: theme.space[2] }}>
              <Text
                accessibilityRole="header"
                style={[theme.type.headline, { color: theme.colors.text.primary }]}
              >
                {CATEGORY[category].title}
              </Text>
              <Muted>{CATEGORY[category].description}</Muted>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
                {PRIVACY_LEVELS.map((level) => (
                  <Chip
                    key={level}
                    label={LEVEL[level]}
                    selected={privacy.data[category] === level}
                    onPress={() => {
                      if (privacy.data[category] !== level) change({ [category]: level });
                    }}
                  />
                ))}
              </View>
            </View>
          ))}
          <SwitchRow
            label="Appear on leaderboards"
            description="Off by default. You can read leaderboards either way."
            value={privacy.data.leaderboards}
            onValueChange={(leaderboards) => change({ leaderboards })}
          />
        </>
      )}
    </Screen>
  );
}

function Muted({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>{children}</Text>;
}
