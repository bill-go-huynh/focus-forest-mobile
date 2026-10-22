import { useLocalSearchParams } from 'expo-router';

import { Screen } from '../components/Screen';
import { Followers, Following } from './TogetherScreen';

/** The whole list of people, page by page, from the Together card's "See all". */
export function PeopleListScreen() {
  const { list } = useLocalSearchParams<{ list: string }>();
  const followers = list === 'followers';
  return (
    <Screen title={followers ? 'Followers' : 'Following'} safeTop={false}>
      {followers ? <Followers /> : <Following />}
    </Screen>
  );
}
