import type { z } from 'zod';

import contract from '../../test-utils/x5/community-contract.json';
import { challengeListsSchema, challengeSchema } from '../challenges';
import { homeSchema } from '../core-loop';
import { communityTreeSchema, eventListSchema, eventSchema } from '../events';
import { leaderboardSchema } from '../leaderboards';
import { roomCompletionSchema, roomListSchema, roomSchema } from '../rooms';
import { seasonSchema } from '../seasons';
import { submittedSessionSchema } from '../sessions';
import {
  blockedPageSchema,
  peoplePageSchema,
  privacySchema,
  reactionSummarySchema,
  receivedReactionsSchema,
  visitedForestSchema,
  visitedProfileSchema,
  warningsSchema,
} from '../social';

/**
 * X5 contract parity: every Phase 5 answer the app reads, captured from the real API in a
 * three-person journey (focus-forest-api test/x5/community-journey.int-spec.ts, an identical copy
 * of the same file), parsed with the schema the app uses. Fields the app does not read are
 * listed exactly (none), and refusals are read by status and code.
 */

type Name = keyof typeof contract;
const ERRORS = ['profileBlocked'] as const;
type Answer = Exclude<Name, (typeof ERRORS)[number]>;

const SCHEMAS: Record<Answer, z.ZodType> = {
  searchBlocked: peoplePageSchema,
  lobbies: roomListSchema,
  followers: peoplePageSchema,
  friendProfile: visitedProfileSchema,
  friendForest: visitedForestSchema,
  reacted: reactionSummarySchema,
  received: receivedReactionsSchema,
  search: peoplePageSchema,
  privacy: privacySchema,
  warnings: warningsSchema,
  challengeCreated: challengeSchema,
  challengeAccepted: challengeSchema,
  roomCreated: roomSchema,
  roomJoined: roomSchema,
  roomCountdown: roomSchema,
  sessionInRoom: submittedSessionSchema,
  roomCompleted: roomCompletionSchema,
  event: eventSchema,
  events: eventListSchema,
  community: communityTreeSchema,
  challenges: challengeListsSchema,
  season: seasonSchema,
  home: homeSchema,
  boardFriends: leaderboardSchema,
  boardGlobal: leaderboardSchema,
  boardEvent: leaderboardSchema,
  blocks: blockedPageSchema,
};

function unread(input: unknown, parsed: unknown, path = ''): string[] {
  if (Array.isArray(input) && Array.isArray(parsed)) {
    return [...new Set(input.flatMap((item, i) => unread(item, parsed[i], `${path}[]`)))];
  }
  if (input && typeof input === 'object' && parsed && typeof parsed === 'object') {
    return Object.entries(input).flatMap(([key, value]) =>
      key in parsed
        ? unread(value, (parsed as Record<string, unknown>)[key], `${path}.${key}`)
        : [`${path}.${key}`],
    );
  }
  return [];
}

describe('X5 contract: the captured Phase 5 answers parse with the app’s schemas', () => {
  it('covers every captured answer', () => {
    expect(Object.keys(contract).sort()).toEqual([...Object.keys(SCHEMAS), ...ERRORS].sort());
  });

  it.each(Object.keys(SCHEMAS) as Answer[])('%s', (name) => {
    const result = SCHEMAS[name].safeParse(contract[name]);
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it('reads every field the server sends', () => {
    const ignored = Object.fromEntries(
      (Object.keys(SCHEMAS) as Answer[]).map((name) => [
        name,
        unread(contract[name], SCHEMAS[name].parse(contract[name])),
      ]),
    );
    expect(
      Object.fromEntries(Object.entries(ignored).filter(([, keys]) => keys.length > 0)),
    ).toEqual({});
  });

  it('reads a blocked person as missing, by status', () => {
    expect(contract.profileBlocked.statusCode).toBe(404);
  });

  it('keeps the journey the screens bind to', () => {
    // A block hides Kai from Mai everywhere; Linh's private statistics stay hidden from a friend.
    expect(peoplePageSchema.parse(contract.searchBlocked).items).toEqual([]);
    expect(roomListSchema.parse(contract.lobbies).items).toEqual([]);
    expect(visitedProfileSchema.parse(contract.friendProfile).statistics).toBeNull();
    // One session: the event mission, the Community Tree, and the season's reward.
    const session = submittedSessionSchema.parse(contract.sessionInRoom);
    expect(session.events?.[0]?.community).toEqual({
      minutes: 30,
      totalMinutes: 30,
      reachedStages: [],
    });
    expect(session.progression?.newlyUnlockedCosmetics.map((x) => x.id)).toEqual([
      'falling-leaves',
    ]);
    expect(communityTreeSchema.parse(contract.community)).toMatchObject({
      totalMinutes: 80,
      yourMinutes: 30,
      stage: 'seedling',
    });
    expect(roomSchema.parse(contract.roomCountdown).phase).toBe('countdown');
    expect(homeSchema.parse(contract.home).event?.id).toBe('autumn-study');
  });
});
