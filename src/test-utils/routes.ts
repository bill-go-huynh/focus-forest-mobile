import RootLayout from '../app/_layout';
import AuthLayout from '../app/(auth)/_layout';
import SignInScreen from '../app/(auth)/sign-in';
import SignUpScreen from '../app/(auth)/sign-up';
import TabsLayout from '../app/(tabs)/_layout';
import ForestScreen from '../app/(tabs)/forest';
import HomeScreen from '../app/(tabs)/index';
import InsightsScreen from '../app/(tabs)/insights';
import ProfileLayout from '../app/(tabs)/profile/_layout';
import EditProfileScreen from '../app/(tabs)/profile/edit';
import ProfileScreen from '../app/(tabs)/profile/index';
import SettingsScreen from '../app/(tabs)/profile/settings';
import TopicsRoute from '../app/(tabs)/profile/topics';
import CompletionRoute from '../app/completion/[sessionId]';
import FocusRoute from '../app/focus';
import TreeRoute from '../app/tree';

/** The app's real routes, for renderRouter from expo-router/testing-library. */
export const appRoutes = {
  _layout: RootLayout,
  '(auth)/_layout': AuthLayout,
  '(auth)/sign-up': SignUpScreen,
  '(auth)/sign-in': SignInScreen,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': HomeScreen,
  '(tabs)/forest': ForestScreen,
  '(tabs)/insights': InsightsScreen,
  '(tabs)/profile/_layout': ProfileLayout,
  '(tabs)/profile/index': ProfileScreen,
  '(tabs)/profile/edit': EditProfileScreen,
  '(tabs)/profile/topics': TopicsRoute,
  '(tabs)/profile/settings': SettingsScreen,
  focus: FocusRoute,
  'completion/[sessionId]': CompletionRoute,
  tree: TreeRoute,
};
