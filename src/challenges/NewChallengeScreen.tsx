import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { NetworkError, challengeErrorCode, type ChallengeTemplate } from '../api';
import { FormMessage } from '../auth';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { ListRow } from '../components/ListRow';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { challengeTitle, templateDetail } from './challenge-format';
import { FriendPicker } from './FriendPicker';
import { useChallengeTemplates, useCreateChallenge } from './queries';

/** Why a challenge could not be started or friends invited, by the server's code (A5.5). */
export function describeChallengeError(error: unknown): string {
  if (error instanceof NetworkError) return "We couldn't reach the server. Check your connection.";
  switch (challengeErrorCode(error)) {
    case 'not_a_friend':
      return 'Only friends (people who follow you back) can be invited.';
    case 'challenge_full':
      return 'This challenge has no room for more people.';
    case 'challenge_finished':
      return 'This challenge has finished.';
    case 'timezone_required':
      return 'Set your time zone first, so the challenge knows your days.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

/**
 * Starting a challenge (docs/05 → Challenges): cooperative and consistency templates only, never a
 * race (docs/02 rule 13). Friend and group challenges can invite friends at the start.
 */
export function NewChallengeScreen() {
  const router = useRouter();
  const templates = useChallengeTemplates();
  const create = useCreateChallenge();
  const [chosen, setChosen] = useState<ChallengeTemplate | null>(null);
  const [invite, setInvite] = useState<string[]>([]);

  return (
    <Screen title="Start a challenge" safeTop={false}>
      {templates.isPending ? (
        <SkeletonGroup label="Loading challenges">
          <Skeleton variant="text" lines={4} />
        </SkeletonGroup>
      ) : templates.isError ? (
        <ErrorState
          message="We couldn't load the challenges right now."
          onRetry={() => void templates.refetch()}
        />
      ) : (
        <View>
          {templates.data.items.map((template) => (
            <ListRow
              key={template.id}
              title={challengeTitle(template)}
              subtitle={templateDetail(template)}
              {...(chosen?.id === template.id ? { meta: 'Chosen' } : {})}
              onPress={() => {
                setChosen(template);
                setInvite([]);
              }}
            />
          ))}
        </View>
      )}
      {chosen && chosen.kind !== 'personal' ? (
        <FriendPicker selected={invite} onChange={setInvite} />
      ) : null}
      {create.isError ? <FormMessage message={describeChallengeError(create.error)} /> : null}
      <Button
        variant="primary"
        label="Start challenge"
        disabled={chosen === null || create.isPending}
        disabledReason="Choose a challenge first."
        onPress={() => {
          if (!chosen) return;
          create.mutate(
            { templateId: chosen.id, invite },
            { onSuccess: (challenge) => router.replace(`/together/challenges/${challenge.id}`) },
          );
        }}
      />
    </Screen>
  );
}
