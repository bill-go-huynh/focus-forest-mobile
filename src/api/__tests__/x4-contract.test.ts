import type { z } from 'zod';

import { unlockMoment } from '../../progression/unlocks';
import contract from '../../test-utils/x4/progression-contract.json';
import { collectionSchema } from '../collection';
import { currentTreeSchema } from '../core-loop';
import { HttpError } from '../errors';
import {
  achievementsSchema,
  badgesSchema,
  cosmeticsSchema,
  equipmentSchema,
  progressionErrorCode,
  speciesListSchema,
} from '../progression';
import { submittedSessionSchema } from '../sessions';

/**
 * X4 contract parity: every Progression answer captured from the real API (HTTP + PostgreSQL,
 * focus-forest-api test/x4/progression-contract.int-spec.ts, an identical copy of the same file)
 * is parsed with the schema the app uses for it. Fields the server sends that the app does not
 * read are listed exactly, so a new one is a deliberate decision. Refusals are read by `code`.
 */

type Name = keyof typeof contract;
const ERRORS = ['equipNotOwned', 'equipWrongSlot', 'speciesRefused'] as const;
type Answer = Exclude<Name, (typeof ERRORS)[number]>;

const SCHEMAS: Record<Answer, z.ZodType> = {
  achievements: achievementsSchema,
  badges: badgesSchema,
  showcase: badgesSchema,
  badgesAfter: badgesSchema,
  speciesOpen: speciesListSchema,
  speciesLocked: speciesListSchema,
  speciesSelected: currentTreeSchema,
  cosmetics: cosmeticsSchema,
  equipmentEmpty: equipmentSchema,
  equipped: equipmentSchema,
  unequipped: equipmentSchema,
  collectionBefore: collectionSchema,
  collectionAfter: collectionSchema,
  sessionUnlock: submittedSessionSchema,
  sessionReplay: submittedSessionSchema,
};

/** Paths of keys present in the server's answer and absent after parsing (not read by the app). */
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

const parse = <T>(schema: z.ZodType<T>, name: Answer): T => schema.parse(contract[name]);

describe('X4 contract: the captured Progression answers parse with the app’s schemas', () => {
  it('covers every captured answer', () => {
    expect(Object.keys(contract).sort()).toEqual([...Object.keys(SCHEMAS), ...ERRORS].sort());
  });

  it.each(Object.keys(SCHEMAS) as Answer[])('%s', (name) => {
    const result = SCHEMAS[name].safeParse(contract[name]);
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it('lists exactly the fields the app does not read', () => {
    const ignored = Object.fromEntries(
      (Object.keys(SCHEMAS) as Answer[]).map((name) => [
        name,
        unread(contract[name], SCHEMAS[name].parse(contract[name])),
      ]),
    );
    // Every field is read (M5.4 reads a session's `events`).
    expect(
      Object.fromEntries(Object.entries(ignored).filter(([, keys]) => keys.length > 0)),
    ).toEqual({});
  });

  it('reads each refusal by its code, never by its text', () => {
    expect(
      ERRORS.map((name) => {
        const body = contract[name];
        return [name, progressionErrorCode(new HttpError(body.statusCode, body))];
      }),
    ).toEqual([
      ['equipNotOwned', 'cosmetic_not_owned'],
      ['equipWrongSlot', 'cosmetic_wrong_slot'],
      ['speciesRefused', 'species_locked'],
    ]);
  });

  it('keeps the semantics each screen binds to', () => {
    // The session reports what it caused, the replay the same; one badge is featured.
    const session = parse(submittedSessionSchema, 'sessionUnlock');
    expect(parse(submittedSessionSchema, 'sessionReplay').progression).toEqual(session.progression);
    expect(unlockMoment([session.progression])).toEqual({
      featured: expect.objectContaining({ id: 'focus-hours:100' }),
      caption: 'New badge: 100 Hours',
      line: 'Also unlocked: the Fantasy Tree and Misty Hills.',
    });

    // The month's choice: open as a Seed, then locked once a session counted.
    expect(parse(speciesListSchema, 'speciesOpen').current).toMatchObject({ locked: false });
    expect(parse(speciesListSchema, 'speciesLocked').current).toMatchObject({
      speciesId: 'sakura',
      locked: true,
    });
    expect(parse(currentTreeSchema, 'speciesSelected').tree.species).toBe('sakura');

    // Progress shown for a visible achievement, hidden for one that keeps it hidden.
    const achievements = parse(achievementsSchema, 'achievements').items;
    expect(achievements.find((a) => a.id === 'focus-hours:100')).toMatchObject({
      unit: 'minutes',
      current: 5880,
      target: 6000,
      completed: false,
      progressVisible: true,
    });

    // The Collection Book agrees with the other reads.
    const collection = parse(collectionSchema, 'collectionAfter');
    const section = (kind: string) => collection.sections.find((s) => s.kind === kind)!.items;
    expect(
      section('badges')
        .filter((item) => item.owned)
        .map((item) => item.id),
    ).toEqual(
      expect.arrayContaining(parse(badgesSchema, 'badgesAfter').items.map((badge) => badge.id)),
    );
    const golden = section('species').find((item) => item.id === 'golden-sakura')!;
    expect(golden).toMatchObject({
      owned: false,
      unlock: { type: 'achievement', unit: 'minutes', target: 30000, current: 6010 },
    });
    const garden = parse(equipmentSchema, 'equipped').forest;
    expect([garden.background?.id, garden.decoration?.id]).toEqual(['meadow', 'stone-lantern']);
    expect(parse(equipmentSchema, 'unequipped').forest.decoration).toBeNull();
  });
});
