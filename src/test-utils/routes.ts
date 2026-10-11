import RootLayout from '../app/_layout';
import AuthLayout from '../app/(auth)/_layout';
import SignInScreen from '../app/(auth)/sign-in';
import SignUpScreen from '../app/(auth)/sign-up';
import TabsLayout from '../app/(tabs)/_layout';
import ForestScreen from '../app/(tabs)/forest';
import HomeScreen from '../app/(tabs)/index';
import InsightsScreen from '../app/(tabs)/insights';
import TogetherLayout from '../app/(tabs)/together/_layout';
import TogetherScreen from '../app/(tabs)/together/index';
import SearchRoute from '../app/(tabs)/together/search';
import PersonRoute from '../app/(tabs)/together/[userId]/index';
import VisitedForestRoute from '../app/(tabs)/together/[userId]/forest';
import PrivacyRoute from '../app/(tabs)/profile/privacy';
import BlockedRoute from '../app/(tabs)/profile/blocked';
import ProfileLayout from '../app/(tabs)/profile/_layout';
import AchievementsRoute from '../app/(tabs)/profile/achievements';
import EditProfileScreen from '../app/(tabs)/profile/edit';
import GoalsRoute from '../app/(tabs)/profile/goals';
import ProfileScreen from '../app/(tabs)/profile/index';
import SettingsScreen from '../app/(tabs)/profile/settings';
import TopicsRoute from '../app/(tabs)/profile/topics';
import CompletionRoute from '../app/completion/[sessionId]';
import FocusRoute from '../app/focus';
import CeremonyRoute from '../app/ceremony/[year]/[month]';
import CollectionItemRoute from '../app/collection/[kind]/[id]';
import CollectionRoute from '../app/collection/index';
import MonthRoute from '../app/month/[year]/[month]';
import OnboardingRoute from '../app/onboarding';
import RecapRoute from '../app/recap/[year]/[month]';
import SpeciesRoute from '../app/species';
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
  '(tabs)/together/_layout': TogetherLayout,
  '(tabs)/together/index': TogetherScreen,
  '(tabs)/together/search': SearchRoute,
  '(tabs)/together/[userId]/index': PersonRoute,
  '(tabs)/together/[userId]/forest': VisitedForestRoute,
  '(tabs)/insights': InsightsScreen,
  '(tabs)/profile/_layout': ProfileLayout,
  '(tabs)/profile/index': ProfileScreen,
  '(tabs)/profile/edit': EditProfileScreen,
  '(tabs)/profile/achievements': AchievementsRoute,
  '(tabs)/profile/goals': GoalsRoute,
  '(tabs)/profile/topics': TopicsRoute,
  '(tabs)/profile/settings': SettingsScreen,
  '(tabs)/profile/privacy': PrivacyRoute,
  '(tabs)/profile/blocked': BlockedRoute,
  focus: FocusRoute,
  'completion/[sessionId]': CompletionRoute,
  species: SpeciesRoute,
  tree: TreeRoute,
  onboarding: OnboardingRoute,
  'month/[year]/[month]': MonthRoute,
  'recap/[year]/[month]': RecapRoute,
  'ceremony/[year]/[month]': CeremonyRoute,
  'collection/index': CollectionRoute,
  'collection/[kind]/[id]': CollectionItemRoute,
};
