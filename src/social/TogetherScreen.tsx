import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import type { Person } from '../api';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { ListRow } from '../components/ListRow';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { useProfile } from '../profile';
import { useTheme } from '../theme';
import {
  useAcknowledgeWarning,
  useFollowers,
  useFollowing,
  useReceivedReactions,
  useWarnings,
} from './queries';
import { personName, REACTION_EMOJI, receivedTargetLabel, relationshipLine } from './social-format';

type List = 'following' | 'followers';

/**
 * The Together tab (docs/05 §1): the community hub. In Phase 11 it holds Following only: the
 * people the user follows and their followers, finding people, the reactions they received, and
 * any note from the moderators. Never a feed, never a comparison (docs/02 Social).
 */
export function TogetherScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [list, setList] = useState<List>('following');
  const profile = useProfile();

  return (
    <Screen title="Together">
      <Warnings />
      {profile.data && profile.data.username === null ? (
        <Card>
          <View style={{ gap: theme.space[3] }}>
            <Body>Choose a username so friends can find you.</Body>
            <Button
              variant="secondary"
              label="Choose a username"
              onPress={() => router.push('/profile/edit')}
            />
          </View>
        </Card>
      ) : null}
      <Button
        variant="secondary"
        label="Find people"
        onPress={() => router.push('/together/search')}
      />
      <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
        <Chip
          label="Following"
          selected={list === 'following'}
          onPress={() => setList('following')}
        />
        <Chip
          label="Followers"
          selected={list === 'followers'}
          onPress={() => setList('followers')}
        />
      </View>
      {list === 'following' ? <Following /> : <Followers />}
      <Received />
    </Screen>
  );
}

function Following() {
  const router = useRouter();
  const following = useFollowing();
  return (
    <People
      query={following}
      errorMessage="We couldn't load the people you follow right now."
      empty={
        <EmptyState
          illustration="clearing"
          message="Follow friends to visit their forests."
          action={{ label: 'Find people', onPress: () => router.push('/together/search') }}
        />
      }
    />
  );
}

function Followers() {
  const followers = useFollowers();
  return (
    <People
      query={followers}
      errorMessage="We couldn't load your followers right now."
      empty={
        <EmptyState
          illustration="seed-in-soil"
          message="Followers will appear here when someone follows you."
        />
      }
    />
  );
}

function People({
  query,
  errorMessage,
  empty,
}: {
  query: ReturnType<typeof useFollowing>;
  errorMessage: string;
  empty: ReactNode;
}) {
  if (query.isPending) {
    return (
      <SkeletonGroup label="Loading people">
        <Skeleton variant="text" lines={3} />
      </SkeletonGroup>
    );
  }
  if (query.isError)
    return <ErrorState message={errorMessage} onRetry={() => void query.refetch()} />;
  const people = query.data.pages.flatMap((page) => page.items);
  if (people.length === 0) return <>{empty}</>;
  return (
    <View>
      {people.map((person) => (
        <PersonRow key={person.id} person={person} />
      ))}
      {query.hasNextPage ? (
        <Button
          variant="tertiary"
          label="Show more"
          onPress={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        />
      ) : null}
    </View>
  );
}

export function PersonRow({ person }: { person: Person }) {
  const router = useRouter();
  const line = relationshipLine(person);
  return (
    <ListRow
      title={personName(person)}
      {...(line ? { subtitle: line } : {})}
      onPress={() => router.push(`/together/${person.id}`)}
    />
  );
}

/** Notes from the moderators (A5.3), shown until the user says they read them. */
function Warnings() {
  const theme = useTheme();
  const warnings = useWarnings();
  const acknowledge = useAcknowledgeWarning();
  const open = warnings.data?.items.filter((warning) => warning.acknowledgedAt === null) ?? [];
  if (open.length === 0) return null;
  return (
    <>
      {open.map((warning) => (
        <Card key={warning.id}>
          <View style={{ gap: theme.space[3] }}>
            <Text
              accessibilityRole="header"
              style={[theme.type.headline, { color: theme.colors.text.primary }]}
            >
              A note from the Focus Forest team
            </Text>
            <Body>{warning.message}</Body>
            <Button
              variant="secondary"
              label="I understand"
              disabled={acknowledge.isPending}
              onPress={() => acknowledge.mutate(warning.id)}
            />
          </View>
        </Card>
      ))}
    </>
  );
}

/** Reactions the user received: who, which, and where. Shown only when there are some. */
function Received() {
  const theme = useTheme();
  const received = useReceivedReactions();
  const items = received.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <View style={{ gap: theme.space[2] }}>
      <Text
        accessibilityRole="header"
        style={[theme.type.headline, { color: theme.colors.text.primary }]}
      >
        Reactions
      </Text>
      {items.map((item) => (
        <ListRow
          key={item.id}
          title={`${personName(item.from)} sent ${REACTION_EMOJI[item.reaction]}`}
          subtitle={receivedTargetLabel(item.target)}
        />
      ))}
    </View>
  );
}

function Body({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[theme.type.body, { color: theme.colors.text.primary }]}>{children}</Text>;
}
