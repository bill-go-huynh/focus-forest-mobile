import type { z } from 'zod';

import contract from '../../test-utils/x6/notifications-contract.json';
import { appRouteForLink } from '../../navigation/notification-links';
import { foregroundPresentation } from '../../notifications/foreground';
import { NOTIFICATION_CATEGORIES } from '../../preferences/notification-categories';
import { challengeSchema } from '../challenges';
import { preferencesSchema } from '../preferences';
import { roomInviteListSchema, roomSchema } from '../rooms';

/**
 * X6 contract parity: the Phase 6 answers the app reads and the pushes it receives, captured
 * from the real API in a one-day journey (focus-forest-api test/x6/notifications-journey.int-spec.ts,
 * an identical copy of the same file). Answers parse with the app's schemas and every field is
 * read; every push links somewhere the app opens, in a category Settings offers.
 */

type Name = keyof typeof contract;
/** Answers the app sends for and does not read (M6.1: it only needs the call to go through). */
const NOT_READ = ['deviceRegistered', 'leaseSet'] as const;
const PUSHES = 'pushes';
type Answer = Exclude<Name, (typeof NOT_READ)[number] | typeof PUSHES>;

const SCHEMAS: Record<Answer, z.ZodType> = {
  preferences: preferencesSchema,
  challengeCreated: challengeSchema,
  roomInvited: roomSchema,
  roomInvites: roomInviteListSchema,
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

describe('X6 contract: the captured Phase 6 answers and pushes', () => {
  it('covers every captured answer', () => {
    expect(Object.keys(contract).sort()).toEqual(
      [...Object.keys(SCHEMAS), ...NOT_READ, PUSHES].sort(),
    );
  });

  it.each(Object.keys(SCHEMAS) as Answer[])('%s parses', (name) => {
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

  it('opens every push where it links, in a category Settings offers, shown when not focusing', () => {
    expect(contract.pushes).toHaveLength(5);
    for (const push of contract.pushes) {
      // A known link opens as itself; only Home falls back to Home.
      expect(appRouteForLink(push.data.link)).toBe(push.data.link);
      expect(NOTIFICATION_CATEGORIES).toContain(push.data.category);
      expect(foregroundPresentation(push.data, false).shouldShowBanner).toBe(true);
      expect(foregroundPresentation(push.data, true).shouldShowBanner).toBe(false);
    }
  });

  it('keeps the journey the screens bind to', () => {
    const preferences = preferencesSchema.parse(contract.preferences);
    expect(preferences.notifications.dailyGoalReminder).toEqual({ enabled: true, time: '20:00' });
    const invites = roomInviteListSchema.parse(contract.roomInvites).items;
    expect(invites.map((invite) => [invite.from.username, invite.room.name])).toEqual([
      ['linh', 'Evening study'],
    ]);
  });
});
