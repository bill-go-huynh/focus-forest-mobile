import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '../components/Button';
import { ListRow } from '../components/ListRow';
import { useTheme } from '../theme';
import { challengeTitle, progressText } from './challenge-format';
import { useAcceptChallenge, useChallengeLists, useDropChallenge } from './queries';

/**
 * Challenges in Together (docs/05 → Challenges): invitations to accept or decline, the user's
 * current challenges with their shared progress, and starting a new one.
 */
export function ChallengesSection() {
  const theme = useTheme();
  const router = useRouter();
  const lists = useChallengeLists();
  const accept = useAcceptChallenge();
  const drop = useDropChallenge();
  const invitations = lists.data?.invitations ?? [];
  const current = lists.data?.current ?? [];

  return (
    <View style={{ gap: theme.space[2] }}>
      <Text
        accessibilityRole="header"
        style={[theme.type.headline, { color: theme.colors.text.primary }]}
      >
        Challenges
      </Text>
      {invitations.length > 0 ? (
        <View style={{ gap: theme.space[2] }}>
          <Text style={[theme.type.label, { color: theme.colors.text.secondary }]}>
            Invitations
          </Text>
          {invitations.map((challenge) => {
            const title = challengeTitle(challenge.template);
            return (
              <View key={challenge.id} style={{ gap: theme.space[2] }}>
                <Text style={[theme.type.body, { color: theme.colors.text.primary }]}>{title}</Text>
                <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
                  <Button
                    variant="secondary"
                    label="Accept"
                    accessibilityLabel={`Accept ${title}`}
                    disabled={accept.isPending}
                    onPress={() => accept.mutate(challenge.id)}
                  />
                  <Button
                    variant="tertiary"
                    label="Decline"
                    accessibilityLabel={`Decline ${title}`}
                    disabled={drop.isPending}
                    onPress={() => drop.mutate({ id: challenge.id, how: 'decline' })}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
      {current.map((challenge) => (
        <ListRow
          key={challenge.id}
          title={challengeTitle(challenge.template)}
          subtitle={progressText(
            challenge.template,
            challenge.progress.value,
            challenge.progress.target,
          )}
          onPress={() => router.push(`/together/challenges/${challenge.id}`)}
        />
      ))}
      <Button
        variant="secondary"
        label="Start a challenge"
        onPress={() => router.push('/together/challenges/new')}
      />
    </View>
  );
}
