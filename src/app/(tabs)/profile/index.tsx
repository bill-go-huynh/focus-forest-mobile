import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { Avatar } from '../../../components/Avatar';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { ErrorState } from '../../../components/ErrorState';
import { ListRow } from '../../../components/ListRow';
import { Screen } from '../../../components/Screen';
import { Skeleton, SkeletonGroup } from '../../../components/Skeleton';
import { formatJoinDate, initialsOf, useProfile } from '../../../profile';
import { LifetimeStats } from '../../../profile/LifetimeStats';
import { useTheme } from '../../../theme';

/**
 * Profile (docs/05 §3): the user's identity from A4, then lifetime progress (A3.5), then the
 * entry points.
 */
export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: profile, isPending, isError, refetch } = useProfile();
  const openEdit = () => router.push('/profile/edit');

  return (
    <Screen title="Profile">
      {isPending ? (
        <SkeletonGroup label="Loading your profile">
          <Skeleton variant="circle" height={theme.avatar.lg} />
          <Skeleton variant="text" lines={3} />
        </SkeletonGroup>
      ) : isError ? (
        <ErrorState
          message="We couldn't load your profile right now."
          onRetry={() => void refetch()}
        />
      ) : (
        <Card testID="profile-card">
          <View style={{ gap: theme.space[3] }}>
            <Avatar initials={initialsOf(profile.displayName)} />
            {profile.displayName ? (
              <Text
                accessibilityRole="header"
                style={[theme.type.headline, { color: theme.colors.text.primary }]}
              >
                {profile.displayName}
              </Text>
            ) : (
              <View style={{ alignItems: 'flex-start' }}>
                <Button variant="tertiary" label="Add your name" onPress={openEdit} />
              </View>
            )}
            {profile.bio ? (
              <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
                {profile.bio}
              </Text>
            ) : null}
            <Text style={[theme.type.caption, { color: theme.colors.text.secondary }]}>
              {formatJoinDate(profile.joinDate, profile.timezone)}
            </Text>
          </View>
        </Card>
      )}
      {profile ? <Button variant="primary" label="Edit profile" onPress={openEdit} /> : null}
      {/* Lifetime progress (A3.5), under the identity; the join date stays in the card. */}
      <LifetimeStats />
      <ListRow
        title="Goals and rest days"
        onPress={() => router.push('/profile/goals')}
        accessibilityHint="Opens your daily and weekly goals, rest days, and streak."
      />
      <ListRow
        title="Topics"
        onPress={() => router.push('/profile/topics')}
        accessibilityHint="Opens your topics, to create, edit, archive, or restore them."
      />
      <ListRow
        title="Settings"
        onPress={() => router.push('/profile/settings')}
        accessibilityHint="Opens theme, sound, motion, and notification settings."
      />
    </Screen>
  );
}
