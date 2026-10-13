import RootLayout from '../app/_layout';
import AuthLayout from '../app/(auth)/_layout';
import SignInScreen from '../app/(auth)/sign-in';
import SignUpScreen from '../app/(auth)/sign-up';
import TabsLayout from '../app/(tabs)/_layout';
import ForestScreen from '../app/(tabs)/forest';
import HomeScreen from '../app/(tabs)/index';
import InsightsScreen from '../app/(tabs)/insights';
import TogetherLayout, {
  unstable_settings as togetherSettings,
} from '../app/(tabs)/together/_layout';
import TogetherScreen from '../app/(tabs)/together/index';
import SearchRoute from '../app/(tabs)/together/search';
import PersonRoute from '../app/(tabs)/together/[userId]/index';
import VisitedForestRoute from '../app/(tabs)/together/[userId]/forest';
import RoomRoute from '../app/(tabs)/together/room/[roomId]';
import NewChallengeRoute from '../app/(tabs)/together/challenges/new';
import ChallengeRoute from '../app/(tabs)/together/challenges/[challengeId]';
import EventRoute from '../app/(tabs)/together/events/[eventId]';
import CommunityRoute from '../app/(tabs)/together/community/[eventId]';
import LeaderboardsRoute from '../app/(tabs)/together/leaderboards';
import PrivacyRoute from '../app/(tabs)/profile/privacy';
import BlockedRoute from '../app/(tabs)/profile/blocked';
import ProfileLayout, { unstable_settings as profileSettings } from '../app/(tabs)/profile/_layout';
import AchievementsRoute from '../app/(tabs)/profile/achievements';
import EditProfileScreen from '../app/(tabs)/profile/edit';
import GoalsRoute from '../app/(tabs)/profile/goals';
import ProfileScreen from '../app/(tabs)/profile/index';
import SettingsScreen from '../app/(tabs)/profile/settings';
import TopicsRoute from '../app/(tabs)/profile/topics';
import DeleteAccountRoute from '../app/(tabs)/profile/delete-account';
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
import NotFoundRoute from '../app/+not-found';

/** The app's real routes, for renderRouter from expo-router/testing-library. */
export const appRoutes = {
  _layout: RootLayout,
  '(auth)/_layout': AuthLayout,
  '(auth)/sign-up': SignUpScreen,
  '(auth)/sign-in': SignInScreen,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': HomeScreen,
  '(tabs)/forest': ForestScreen,
  '(tabs)/together/_layout': { default: TogetherLayout, unstable_settings: togetherSettings },
  '(tabs)/together/index': TogetherScreen,
  '(tabs)/together/search': SearchRoute,
  '(tabs)/together/[userId]/index': PersonRoute,
  '(tabs)/together/[userId]/forest': VisitedForestRoute,
  '(tabs)/together/room/[roomId]': RoomRoute,
  '(tabs)/together/challenges/new': NewChallengeRoute,
  '(tabs)/together/challenges/[challengeId]': ChallengeRoute,
  '(tabs)/together/events/[eventId]': EventRoute,
  '(tabs)/together/community/[eventId]': CommunityRoute,
  '(tabs)/together/leaderboards': LeaderboardsRoute,
  '(tabs)/insights': InsightsScreen,
  '(tabs)/profile/_layout': { default: ProfileLayout, unstable_settings: profileSettings },
  '(tabs)/profile/index': ProfileScreen,
  '(tabs)/profile/edit': EditProfileScreen,
  '(tabs)/profile/achievements': AchievementsRoute,
  '(tabs)/profile/goals': GoalsRoute,
  '(tabs)/profile/topics': TopicsRoute,
  '(tabs)/profile/settings': SettingsScreen,
  '(tabs)/profile/privacy': PrivacyRoute,
  '(tabs)/profile/blocked': BlockedRoute,
  '(tabs)/profile/delete-account': DeleteAccountRoute,
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
  '+not-found': NotFoundRoute,
};
