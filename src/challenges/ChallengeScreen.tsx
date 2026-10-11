import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { HttpError, useSession, type Challenge } from '../api';
import { FormMessage } from '../auth';
import { Button } from '../components/Button';
import { Confirmation } from '../components/Confirmation';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { ProgressBar } from '../components/ProgressBar';
import { Screen } from '../components/Screen';
import { Sheet } from '../components/Sheet';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { personName } from '../social/social-format';
import { useTheme } from '../theme';
import {
  challengeTitle,
  kindLabel,
  participantValue,
  phaseText,
  progressText,
  windowText,
} from './challenge-format';
import { FriendPicker } from './FriendPicker';
import { describeChallengeError } from './NewChallengeScreen';
import {
  useAcceptChallenge,
  useChallenge,
  useDropChallenge,
  useInviteToChallenge,
} from './queries';

/**
 * One challenge (docs/05 → Challenge detail): the window, shared progress from everyone's normal
 * focus, who takes part, inviting friends, and leaving without a trace or a penalty. A challenge
 * not reached simply ends (docs/02: never "failed").
 */
export function ChallengeScreen() {
  const { challengeId } = useLocalSearchParams<{ challengeId: string }>();
  const challenge = useChallenge(challengeId);

  if (challenge.isPending) {
    return (
      <Screen safeTop={false}>
        <SkeletonGroup label="Loading the challenge">
          <Skeleton variant="text" lines={4} />
        </SkeletonGroup>
      </Screen>
    );
  }
  if (challenge.isError) {
    if (challenge.error instanceof HttpError && challenge.error.status === 404) {
      return (
        <Screen safeTop={false}>
          <EmptyState illustration="clearing" message="This challenge isn't available." />
        </Screen>
      );
    }
    return (
      <Screen safeTop={false}>
        <ErrorState
          message="We couldn't load the challenge right now."
          onRetry={() => void challenge.refetch()}
        />
      </Screen>
    );
  }
  return <ChallengeView challenge={challenge.data} />;
}

function ChallengeView({ challenge }: { challenge: Challenge }) {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useSession();
  const invite = useInviteToChallenge(challenge.id);
  const accept = useAcceptChallenge();
  const drop = useDropChallenge();
  const [inviting, setInviting] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [leaving, setLeaving] = useState(false);
  const { template } = challenge;
  const open = challenge.phase === 'upcoming' || challenge.phase === 'active';
  const joined = challenge.you.status === 'joined';
  const progress = progressText(template, challenge.progress.value, challenge.progress.target);

  return (
    <Screen title={challengeTitle(template)} safeTop={false}>
      <Muted>{kindLabel(template.kind)}</Muted>
      <Muted>{windowText(challenge)}</Muted>
      <Body>{phaseText(challenge)}</Body>
      <ProgressBar
        ratio={challenge.progress.value / challenge.progress.target}
        label="Challenge progress"
        valueText={progress}
      />

      <View style={{ gap: theme.space[1] }}>
        {challenge.participants.map((place) => {
          const name = personName(place.user);
          const parts = [
            place.user.id === user?.id ? `${name} (you)` : name,
            participantValue(template, place.value),
            ...(place.reached && template.goal === 'each' ? ['Reached'] : []),
          ];
          return <Body key={place.user.id}>{parts.join(' · ')}</Body>;
        })}
        {challenge.invited.map((person) => (
          <Muted key={person.id}>{`${personName(person)} · Invited`}</Muted>
        ))}
      </View>

      {!joined && open ? (
        <Button
          variant="primary"
          label="Accept"
          disabled={accept.isPending}
          onPress={() => accept.mutate(challenge.id)}
        />
      ) : null}
      {joined && open && template.kind !== 'personal' ? (
        <Button variant="secondary" label="Invite friends" onPress={() => setInviting(true)} />
      ) : null}
      {joined && open ? (
        <Button variant="tertiary" label="Leave challenge" onPress={() => setLeaving(true)} />
      ) : null}

      <Sheet visible={inviting} title="Invite friends" onRequestClose={() => setInviting(false)}>
        <View style={{ gap: theme.space[3] }}>
          <FriendPicker
            selected={chosen}
            onChange={setChosen}
            exclude={[
              ...challenge.participants.map((place) => place.user.id),
              ...challenge.invited.map((person) => person.id),
            ]}
          />
          {invite.isError ? <FormMessage message={describeChallengeError(invite.error)} /> : null}
          <Button
            variant="primary"
            label="Send invitations"
            disabled={chosen.length === 0 || invite.isPending}
            onPress={() =>
              invite.mutate(chosen, {
                onSuccess: () => {
                  setChosen([]);
                  setInviting(false);
                },
              })
            }
          />
        </View>
      </Sheet>
      <Confirmation
        visible={leaving}
        title="Leave this challenge?"
        message="Your place is removed. Nothing is counted against you."
        confirmLabel="Leave"
        onConfirm={() => {
          setLeaving(false);
          drop.mutate(
            { id: challenge.id, how: 'leave' },
            { onSuccess: () => router.navigate('/together') },
          );
        }}
        onCancel={() => setLeaving(false)}
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
