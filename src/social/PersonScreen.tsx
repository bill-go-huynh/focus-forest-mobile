import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { HttpError, type EarnedBadge, type VisitedProfile } from '../api';
import { BadgeMark } from '../progression/BadgeMark';
import { useCurrentRoom, useLeaveRoomById } from '../rooms/queries';
import { Button, DestructiveButton } from '../components/Button';
import { Confirmation } from '../components/Confirmation';
import { InlineStatus } from '../components/InlineStatus';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Screen } from '../components/Screen';
import { Sheet } from '../components/Sheet';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { formatFocused } from '../history/history-format';
import { useTheme } from '../theme';
import { TreeScene } from '../tree/TreeScene';
import { toTreeVisualState } from '../tree/visual-state';
import { useBlock, useFollow, useVisitedProfile } from './queries';
import { ReactionBar } from './ReactionBar';
import { ReportSheet } from './ReportSheet';
import { personName, relationshipLine, socialRefusal, treeTarget } from './social-format';
import { SectionCard } from '../components/SectionCard';

const MINUTE = 60_000;

/**
 * Another person's profile (docs/05 → Profile of a followed user): their tree is the hero, then
 * what their privacy lets this viewer see. Follow, react, visit the forest, block, or report.
 * A missing and a blocked person read the same, so a block is never revealed (A5.1).
 */
export function PersonScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const profile = useVisitedProfile(userId);

  if (profile.isPending) {
    return (
      <Screen safeTop={false}>
        <SkeletonGroup label="Loading their profile">
          <Skeleton variant="text" lines={4} />
        </SkeletonGroup>
      </Screen>
    );
  }
  if (profile.isError) {
    if (profile.error instanceof HttpError && profile.error.status === 404) {
      return (
        <Screen safeTop={false}>
          <EmptyState illustration="clearing" message="This person isn't available." />
        </Screen>
      );
    }
    return (
      <Screen safeTop={false}>
        <ErrorState
          message="We couldn't load this profile right now."
          onRetry={() => void profile.refetch()}
        />
      </Screen>
    );
  }
  return <Profile userId={userId} profile={profile.data} />;
}

function Profile({ userId, profile }: { userId: string; profile: VisitedProfile }) {
  const theme = useTheme();
  const router = useRouter();
  const followChange = useFollow(userId);
  const blockChange = useBlock();
  const [badge, setBadge] = useState<EarnedBadge | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  // SO-62: blocking ends follows and invitations, not a room both are in; the user chooses.
  const currentRoom = useCurrentRoom();
  const leaveRoom = useLeaveRoomById();
  const [sharedRoom, setSharedRoom] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const { user } = profile;
  const name = personName(user);
  const line = relationshipLine(user);
  const somethingHidden = Object.values(user.visible).some((visible) => !visible);
  const showcase = profile.badges?.showcase ?? [];

  const leaveProfile = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/together');
  };

  const doBlock = () => {
    setConfirmBlock(false);
    blockChange.mutate(
      { userId, on: true },
      {
        onSuccess: () => {
          void currentRoom.refetch().then(({ data }) => {
            const room = data?.room ?? null;
            if (room?.you && room.participants.some((place) => place.user.id === userId)) {
              setSharedRoom(room.id);
            } else leaveProfile();
          });
        },
      },
    );
  };

  return (
    <Screen title={name} safeTop={false}>
      {/* Who they are and the one action with them (owner, 2026-10-22: one card per part). */}
      <SectionCard>
        {line ? <Muted>{line}</Muted> : null}
        {user.bio ? <Body>{user.bio}</Body> : null}
        <Button
          variant={user.relationship.following ? 'secondary' : 'primary'}
          label={user.relationship.following ? 'Unfollow' : 'Follow'}
          disabled={followChange.isPending}
          onPress={() => followChange.mutate(!user.relationship.following)}
        />
        {socialRefusal(followChange.error, 'follow') ? (
          <InlineStatus
            tone="attention"
            message={socialRefusal(followChange.error, 'follow')!}
            live
          />
        ) : null}
      </SectionCard>

      {profile.currentTree ? (
        <View style={{ gap: theme.space[3] }}>
          <TreeScene tree={toTreeVisualState(profile.currentTree)} testID="person-tree" />
          <ReactionBar userId={userId} target={treeTarget(profile.currentTree)} />
        </View>
      ) : null}

      {profile.statistics || showcase.length > 0 || profile.forest ? (
        <SectionCard
          title="Focus"
          footer={
            profile.forest ? (
              <Button
                variant="secondary"
                label="Visit forest"
                accessibilityLabel={`Visit forest, ${profile.forest.treeCount} ${profile.forest.treeCount === 1 ? 'tree' : 'trees'}`}
                onPress={() => router.push(`/together/${userId}/forest`)}
              />
            ) : undefined
          }
        >
          {profile.statistics ? (
            <View style={{ gap: theme.space[1] }}>
              <Body>
                {`${formatFocused(profile.statistics.focusedMinutes * MINUTE)} focused · ${profile.statistics.sessionCount} sessions`}
              </Body>
              <Body>{`Longest streak ${profile.statistics.longestStreak} days`}</Body>
            </View>
          ) : null}
          {showcase.length > 0 ? (
            <View style={{ gap: theme.space[2] }}>
              <Header>Badges</Header>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[4] }}>
                {showcase.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                    onPress={() => setBadge(item)}
                    style={{ alignItems: 'center', gap: theme.space[1] }}
                  >
                    <BadgeMark badge={item} />
                    <Text style={[theme.type.caption, { color: theme.colors.text.secondary }]}>
                      {item.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </SectionCard>
      ) : null}

      {somethingHidden ? <Muted>{`Some of ${name}'s profile is private.`}</Muted> : null}

      {/* Safety at the end, apart from everything else. */}
      <SectionCard>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          <Button variant="tertiary" label="Report" onPress={() => setReporting(true)} />
          <DestructiveButton label="Block" onRequestConfirm={() => setConfirmBlock(true)} />
        </View>
      </SectionCard>

      <Sheet
        visible={badge !== null}
        title={badge?.name ?? 'Badge'}
        onRequestClose={() => setBadge(null)}
      >
        {badge ? (
          <View style={{ gap: theme.space[3], alignItems: 'center' }}>
            <BadgeMark badge={badge} size="reveal" />
            <Body>{badge.description}</Body>
            <ReactionBar userId={userId} target={`badge:${badge.id}`} />
          </View>
        ) : null}
      </Sheet>
      <Confirmation
        visible={confirmBlock}
        title={`Block ${name}?`}
        message="They won't be able to find you or see your forest, and you won't see theirs. Follows between you end."
        confirmLabel={`Block ${name}`}
        destructive
        onConfirm={doBlock}
        onCancel={() => setConfirmBlock(false)}
      />
      <Confirmation
        visible={sharedRoom !== null}
        title={`${name} is in your focus room`}
        message={`You blocked ${name}, so they can't follow you, invite you, or react to you. Blocking doesn't remove anyone from a room. Do you want to stay in the room?`}
        confirmLabel="Leave the room"
        cancelLabel="Stay in the room"
        onConfirm={() => {
          const roomId = sharedRoom;
          setSharedRoom(null);
          if (roomId) leaveRoom.mutate(roomId, { onSettled: leaveProfile });
        }}
        onCancel={() => {
          setSharedRoom(null);
          leaveProfile();
        }}
      />
      <ReportSheet
        visible={reporting}
        userId={userId}
        name={name}
        onClose={() => setReporting(false)}
      />
    </Screen>
  );
}

function Body({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[theme.type.body, { color: theme.colors.text.primary }]}>{children}</Text>;
}

function Muted({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>{children}</Text>;
}

function Header({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[theme.type.headline, { color: theme.colors.text.primary }]}
    >
      {children}
    </Text>
  );
}
