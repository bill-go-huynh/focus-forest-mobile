export { deleteAccount, exportMyData } from './account';
export { sendClientErrors } from './client-errors';
export { analyticsBatchSchema, sendAnalyticsEvents } from './analytics';
export { createApi, type Api } from './api';
export { ApiProvider, useApi, useSession } from './ApiProvider';
export type { Credentials } from './auth';
export type { ApiClient, RequestOptions } from './client';
export { readApiBaseUrl } from './config';
export {
  ApiError,
  ConfigurationError,
  HttpError,
  InvalidResponseError,
  NetworkError,
  UnauthenticatedError,
  type ApiErrorKind,
} from './errors';
export {
  getProfile,
  profileSchema,
  updateProfile,
  type Profile,
  type ProfileChanges,
} from './profile';
export {
  getPreferences,
  preferencesSchema,
  updatePreferences,
  type NotificationCategory,
  type PreferenceChanges,
  type Preferences,
} from './preferences';
export { clearFocusLease, registerDevice, setFocusLease, unregisterDevice } from './notifications';
export {
  acceptRecovery,
  cancelRestDay,
  clearWeeklyGoal,
  consistencyErrorCode,
  recoveryResultSchema,
  type RecoveryResult,
  getGoals,
  getRestDays,
  getStreak,
  restDaysSchema,
  scheduleRestDay,
  setDailyGoal,
  setWeeklyGoal,
  type Goals,
  type RestDays,
  type WeeklyGoal,
  type WeeklyGoalType,
} from './consistency';
export {
  forestPageSchema,
  getForest,
  getRecap,
  getTreeDetails,
  markCeremonySeen,
  markRecapSeen,
  recapSchema,
  seenStateSchema,
  treeDetailsSchema,
  type ForestItem,
  type ForestPage,
  type MonthRef,
  type Recap,
  type SeenState,
  type TreeDetails,
} from './forest';
export {
  DAILY_GOAL_STATES,
  getHeatmap,
  getLifetimeStats,
  getMonthInsights,
  getRecords,
  getWeekInsights,
  type DayCell,
  type GoalRate,
  type Heatmap,
  type LifetimeStats,
  type MonthInsights,
  type PersonalRecord,
  type TopicInsight,
  type WeekInsights,
} from './insights';
export {
  achievementsSchema,
  badgesSchema,
  cosmeticsSchema,
  equipCosmetic,
  equipmentSchema,
  getAchievements,
  getBadges,
  getCosmetics,
  getEquipment,
  getSpecies,
  progressionErrorCode,
  progressionResultSchema,
  selectSpecies,
  setShowcase,
  SHOWCASE_MAX,
  speciesListSchema,
  unequipSlot,
  unlockedAnything,
  type Achievement,
  type Achievements,
  type Badge,
  type Badges,
  type Cosmetic,
  type Cosmetics,
  type EarnedBadge,
  type Equipment,
  type EquipmentSlot,
  type OwnedSpecies,
  type ProgressionResult,
  type SpeciesList,
} from './progression';
export {
  collectionSchema,
  getCollection,
  type Collection,
  type CollectionItem,
  type CollectionItemKind,
  type CollectionSection,
  type UnlockHint,
} from './collection';
export { createQueryClient } from './query-client';
export {
  archiveTopic,
  createTopic,
  listTopics,
  restoreTopic,
  TOPIC_COLORS,
  topicErrorCode,
  topicSchema,
  updateTopic,
  type NewTopicFields,
  type Topic,
  type TopicChanges,
  type TopicErrorCode,
  type TopicListFilter,
  type TopicStatus,
} from './topics';
export {
  getSessionHistory,
  HISTORY_PAGE_SIZE,
  historyPageSchema,
  sessionHistoryItemSchema,
  storedHistoryItemSchema,
  type HistoryFilters,
  type HistoryTopic,
  type SessionHistoryItem,
  type SessionHistoryPage,
} from './history';
export {
  currentTreeSchema,
  getCurrentTree,
  getHome,
  growthResultSchema,
  homeSchema,
  treeStateSchema,
  type CurrentTreeResponse,
  type DailyProgress,
  type GrowthResult,
  type HomeResponse,
  type Streak,
  type TreeStateResponse,
  type WeeklyProgress,
} from './core-loop';
export { getSessionRules, sessionRulesSchema, type SessionRulesResponse } from './session-rules';
export {
  sessionErrorCode,
  sessionSchema,
  sessionSubmissionBodySchema,
  setSessionNoteHighlight,
  storedSessionSchema,
  submitSession,
  submittedSessionSchema,
  updateSessionNote,
  type FocusSession,
  type SessionErrorCode,
} from './sessions';
export type { SessionSnapshot, SessionStatus, SessionUser } from './session';
export { secureTokenStore } from './token-store';
export * from './social';
export * from './rooms';
export * from './challenges';
export * from './events';
export * from './leaderboards';
export * from './seasons';
