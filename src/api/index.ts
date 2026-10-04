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
export {
  acceptRecovery,
  cancelRestDay,
  clearWeeklyGoal,
  consistencyErrorCode,
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
  submitSession,
  submittedSessionSchema,
  updateSessionNote,
  type FocusSession,
  type SessionErrorCode,
} from './sessions';
export type { SessionSnapshot, SessionStatus, SessionUser } from './session';
export { secureTokenStore } from './token-store';
