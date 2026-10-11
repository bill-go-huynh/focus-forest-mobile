import { useState } from 'react';
import { Text, View } from 'react-native';

import type { BlockedPerson } from '../api';
import { Button } from '../components/Button';
import { Confirmation } from '../components/Confirmation';
import { ErrorState } from '../components/ErrorState';
import { ListRow } from '../components/ListRow';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { useTheme } from '../theme';
import { useBlock, useBlocked } from './queries';
import { personName } from './social-format';

/**
 * Blocked people (docs/05 Settings → blocked users): unblocking asks first. Follows ended by the
 * block are not restored (A5.1).
 */
export function BlockedPeopleScreen() {
  const theme = useTheme();
  const blocked = useBlocked();
  const change = useBlock();
  const [unblocking, setUnblocking] = useState<BlockedPerson | null>(null);
  const people = blocked.data?.items ?? [];

  return (
    <Screen title="Blocked people" safeTop={false}>
      {blocked.isPending ? (
        <SkeletonGroup label="Loading blocked people">
          <Skeleton variant="text" lines={3} />
        </SkeletonGroup>
      ) : blocked.isError ? (
        <ErrorState
          message="We couldn't load this list right now."
          onRetry={() => void blocked.refetch()}
        />
      ) : people.length === 0 ? (
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          You have not blocked anyone.
        </Text>
      ) : (
        <View>
          {people.map((person) => (
            <ListRow
              key={person.id}
              title={personName(person)}
              {...(person.username ? { subtitle: `@${person.username}` } : {})}
              action={
                <Button
                  variant="tertiary"
                  label="Unblock"
                  accessibilityLabel={`Unblock ${personName(person)}`}
                  onPress={() => setUnblocking(person)}
                />
              }
            />
          ))}
        </View>
      )}
      <Confirmation
        visible={unblocking !== null}
        title={unblocking ? `Unblock ${personName(unblocking)}?` : 'Unblock?'}
        message="They can find you again and see what your privacy settings allow. Follows are not restored."
        confirmLabel="Unblock"
        onConfirm={() => {
          if (unblocking) change.mutate({ userId: unblocking.id, on: false });
          setUnblocking(null);
        }}
        onCancel={() => setUnblocking(null)}
      />
    </Screen>
  );
}
