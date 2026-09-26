import { Tabs } from 'expo-router/tabs';

import { TabBar } from '../../components/TabBar';
import { TABS } from '../../navigation/tabs';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      {TABS.map(({ name, title }) => (
        <Tabs.Screen key={name} name={name} options={{ title }} />
      ))}
    </Tabs>
  );
}
