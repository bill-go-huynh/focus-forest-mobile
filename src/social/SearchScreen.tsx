import { useState } from 'react';
import { Text, View } from 'react-native';

import { ErrorState } from '../components/ErrorState';
import { Input } from '../components/Input';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme';
import { useSearchPeople } from './queries';
import { PersonRow } from './TogetherScreen';

/**
 * Finding people by their unique username (A5.1). The server leaves out the user, people without
 * a username, and anyone blocked either way, so a block is never revealed.
 */
export function SearchScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const results = useSearchPeople(query);
  const people = results.data?.items ?? [];

  return (
    <Screen title="Find people" safeTop={false}>
      <Input
        label="Username"
        value={query}
        onChangeText={setQuery}
        helper="Search by the username your friend chose."
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
      />
      {query.trim() === '' ? null : results.isError ? (
        <ErrorState
          message="We couldn't search right now."
          onRetry={() => void results.refetch()}
        />
      ) : results.data && people.length === 0 ? (
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          No one has that username yet.
        </Text>
      ) : (
        <View>
          {people.map((person) => (
            <PersonRow key={person.id} person={person} />
          ))}
        </View>
      )}
    </Screen>
  );
}
