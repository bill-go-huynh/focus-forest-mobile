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
export type { SessionSnapshot, SessionStatus, SessionUser } from './session';
export { secureTokenStore } from './token-store';
