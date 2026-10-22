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
import { SectionCard } from '../components/SectionCard';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { useProfile } from '../profile';
import { ChallengesSection } from '../challenges/ChallengesSection';
import { RoomsSection } from '../rooms/RoomsSection';
import { useTheme } from '../theme';
import {
  useAcknowledgeWarning,
  useFollowers,
  useFollowing,
  useReceivedReactions,
  useWarnings,
} from './queries';
import { personName, REACTION_EMOJI, receivedTargetLabel, relationshipLine } from './social-format';

export type PeopleList = 'following' | 'followers';

/** How many people and reactions a card shows before "See all" (owner, 2026-10-22). */
const PEOPLE_PREVIEW = 5;
const REACTIONS_PREVIEW = 3;

/**
 * The Together tab (docs/05 §1): the community hub, one card per part (owner, 2026-10-22): your
 * people (the first few, everyone a tap away), focus rooms, challenges, events, leaderboards,
 * and the reactions you received, with any note from the moderators first. Never a feed, never
 * a comparison (docs/02 Social).
 */
export function TogetherScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [list, setList] = useState<PeopleList>('following');
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
      <SectionCard
        title="Your people"
        footer={
          <Button
            variant="tertiary"
            label="Find people"
            onPress={() => router.push('/together/search')}
          />
        }
      >
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
        {list === 'following' ? <Following preview /> : <Followers preview />}
      </SectionCard>
      <RoomsSection />
      <ChallengesSection />
      <SectionCard>
        <ListRow
          title="Leaderboards"
          subtitle="Friends first, fair scores, opt-in"
          onPress={() => router.push('/together/leaderboards')}
        />
      </SectionCard>
      <Received />
    </Screen>
  );
}

export function Following({ preview = false }: { preview?: boolean }) {
  const router = useRouter();
  const following = useFollowing();
  return (
    <People
      query={following}
      {...(preview
        ? { seeAll: { label: 'See everyone you follow', href: '/together/people/following' } }
        : {})}
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

export function Followers({ preview = false }: { preview?: boolean }) {
  const followers = useFollowers();
  return (
    <People
      query={followers}
      {...(preview
        ? { seeAll: { label: 'See all your followers', href: '/together/people/followers' } }
        : {})}
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

/**
 * A list of people. With `seeAll` it is a preview: the first few, then a way to everyone; without
 * it, the whole list, page by page.
 */
function People({
  query,
  errorMessage,
  empty,
  seeAll,
}: {
  query: ReturnType<typeof useFollowing>;
  errorMessage: string;
  empty: ReactNode;
  seeAll?: { label: string; href: '/together/people/following' | '/together/people/followers' };
}) {
  const router = useRouter();
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
  if (seeAll) {
    const more = people.length > PEOPLE_PREVIEW || query.hasNextPage;
    return (
      <View>
        {people.slice(0, PEOPLE_PREVIEW).map((person) => (
          <PersonRow key={person.id} person={person} />
        ))}
        {more ? (
          <Button
            variant="tertiary"
            label={seeAll.label}
            onPress={() => router.push(seeAll.href)}
          />
        ) : null}
      </View>
    );
  }
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
  const received = useReceivedReactions();
  const [all, setAll] = useState(false);
  const items = received.data?.items ?? [];
  if (items.length === 0) return null;
  const shown = all ? items : items.slice(0, REACTIONS_PREVIEW);
  return (
    <SectionCard
      title="Reactions"
      footer={
        items.length > REACTIONS_PREVIEW && !all ? (
          <Button
            variant="tertiary"
            label={`Show all ${items.length} reactions`}
            onPress={() => setAll(true)}
          />
        ) : undefined
      }
    >
      {shown.map((item) => (
        <ListRow
          key={item.id}
          title={`${personName(item.from)} sent ${REACTION_EMOJI[item.reaction]}`}
          subtitle={receivedTargetLabel(item.target)}
        />
      ))}
    </SectionCard>
  );
}

function Body({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[theme.type.body, { color: theme.colors.text.primary }]}>{children}</Text>;
}
