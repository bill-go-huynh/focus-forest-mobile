import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import {
  acknowledgeWarning,
  block,
  fileReport,
  follow,
  getBlocked,
  getFollowers,
  getFollowing,
  getPrivacy,
  getReactions,
  getReceivedReactions,
  getVisitedForest,
  getVisitedMonth,
  getVisitedProfile,
  getWarnings,
  searchPeople,
  setReaction,
  unblock,
  unfollow,
  updatePrivacy,
  useApi,
  type Privacy,
  type PrivacyChanges,
  type ReactionKind,
  type ReactionSummary,
  type ReportCategory,
  type VisitedProfile,
} from '../api';

/** Query keys for Social (A5.1–A5.3). Everything under `social` is the server's truth. */
export const socialKeys = {
  all: ['social'] as const,
  following: ['social', 'following'] as const,
  followers: ['social', 'followers'] as const,
  search: (q: string) => ['social', 'search', q] as const,
  person: (userId: string) => ['social', 'person', userId] as const,
  forest: (userId: string) => ['social', 'person', userId, 'forest'] as const,
  month: (userId: string, year: number, month: number) =>
    ['social', 'person', userId, 'month', year, month] as const,
  reactions: (userId: string, target: string) =>
    ['social', 'person', userId, 'reactions', target] as const,
  received: ['social', 'received'] as const,
  privacy: ['social', 'privacy'] as const,
  blocked: ['social', 'blocked'] as const,
  warnings: ['social', 'warnings'] as const,
};

/** The lists that change when a follow or a block does. */
function refreshPeople(queryClient: QueryClient) {
  for (const key of [socialKeys.following, socialKeys.followers, socialKeys.blocked]) {
    void queryClient.invalidateQueries({ queryKey: key }).catch(() => undefined);
  }
}

const pages = <T extends { nextCursor: string | null }>() => ({
  initialPageParam: null as string | null,
  getNextPageParam: (page: T) => page.nextCursor,
});

export function useFollowing() {
  const { client } = useApi();
  return useInfiniteQuery({
    queryKey: socialKeys.following,
    queryFn: ({ pageParam }) => getFollowing(client, pageParam),
    ...pages(),
  });
}

export function useFollowers() {
  const { client } = useApi();
  return useInfiniteQuery({
    queryKey: socialKeys.followers,
    queryFn: ({ pageParam }) => getFollowers(client, pageParam),
    ...pages(),
  });
}

/** Username search (A5.1): a prefix, read once it has a character. */
export function useSearchPeople(q: string) {
  const { client } = useApi();
  const prefix = q.trim().toLowerCase();
  return useQuery({
    queryKey: socialKeys.search(prefix),
    queryFn: () => searchPeople(client, prefix),
    enabled: prefix.length > 0,
  });
}

export function useVisitedProfile(userId: string) {
  const { client } = useApi();
  return useQuery({
    queryKey: socialKeys.person(userId),
    queryFn: () => getVisitedProfile(client, userId),
  });
}

/**
 * Follows or unfollows. The profile's relationship follows the answer: following comes back
 * from the server; unfollowing has no body, so the known relationship drops `following`.
 */
export function useFollow(userId: string) {
  const { client } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (on: boolean) => {
      if (on) return (await follow(client, userId)).relationship;
      await unfollow(client, userId);
      return null;
    },
    onSuccess: (relationship, on) => {
      queryClient.setQueryData<VisitedProfile>(socialKeys.person(userId), (old) => {
        if (!old) return old;
        const followedBy = old.user.relationship.followedBy;
        const next = relationship ?? { following: on, followedBy, friends: on && followedBy };
        return { ...old, user: { ...old.user, relationship: next } };
      });
      refreshPeople(queryClient);
    },
  });
}

export function useVisitedForest(userId: string) {
  const { client } = useApi();
  return useInfiniteQuery({
    queryKey: socialKeys.forest(userId),
    queryFn: ({ pageParam }) => getVisitedForest(client, userId, pageParam),
    ...pages(),
  });
}

export function useVisitedMonth(userId: string, month: { year: number; month: number } | null) {
  const { client } = useApi();
  return useQuery({
    queryKey: socialKeys.month(userId, month?.year ?? 0, month?.month ?? 0),
    queryFn: () => getVisitedMonth(client, userId, month!.year, month!.month),
    enabled: month !== null,
  });
}

export function useReactions(userId: string, target: string) {
  const { client } = useApi();
  return useQuery({
    queryKey: socialKeys.reactions(userId, target),
    queryFn: () => getReactions(client, userId, target),
  });
}

/** Adds or takes back one reaction; the answer is the target's summary. */
export function useReact(userId: string, target: string) {
  const { client } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reaction, on }: { reaction: ReactionKind; on: boolean }) =>
      setReaction(client, userId, target, reaction, on),
    onSuccess: (summary: ReactionSummary) =>
      queryClient.setQueryData(socialKeys.reactions(userId, target), summary),
  });
}

export function useReceivedReactions() {
  const { client } = useApi();
  return useQuery({ queryKey: socialKeys.received, queryFn: () => getReceivedReactions(client) });
}

export function usePrivacy() {
  const { client } = useApi();
  return useQuery({ queryKey: socialKeys.privacy, queryFn: () => getPrivacy(client) });
}

/** Saves one change; the answer is the whole settings, which replaces the cached ones. */
export function useUpdatePrivacy() {
  const { client } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: PrivacyChanges) => updatePrivacy(client, changes),
    onSuccess: (privacy: Privacy) => queryClient.setQueryData(socialKeys.privacy, privacy),
  });
}

export function useBlocked() {
  const { client } = useApi();
  return useQuery({ queryKey: socialKeys.blocked, queryFn: () => getBlocked(client) });
}

export function useBlock() {
  const { client } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, on }: { userId: string; on: boolean }) =>
      on ? block(client, userId) : unblock(client, userId),
    onSuccess: (_, { userId }) => {
      queryClient.removeQueries({ queryKey: socialKeys.person(userId) });
      refreshPeople(queryClient);
    },
  });
}

export function useReport() {
  const { client } = useApi();
  return useMutation({
    mutationFn: (report: { userId: string; category: ReportCategory; details: string | null }) =>
      fileReport(client, report),
  });
}

export function useWarnings() {
  const { client } = useApi();
  return useQuery({ queryKey: socialKeys.warnings, queryFn: () => getWarnings(client) });
}

export function useAcknowledgeWarning() {
  const { client } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => acknowledgeWarning(client, id),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: socialKeys.warnings }).catch(() => undefined),
  });
}
