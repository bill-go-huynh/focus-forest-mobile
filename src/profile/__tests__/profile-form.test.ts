import { formatJoinDate, initialsOf, profileChanges, profileFormSchema } from '../profile-form';

const errorsOf = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) =>
  Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [String(issue.path[0]), issue.message]),
  );

describe('initialsOf (the avatar fallback until upload exists)', () => {
  it.each([
    ['Mai', 'M'],
    ['Mai Anh', 'MA'],
    ['  mai   anh  nguyen ', 'MA'],
    ['Ánh', 'Á'],
    ['đức', 'Đ'],
    ['😀 Smile', '😀S'],
  ])('%p → %p', (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });

  it.each([null, '', '   '])('has no initials for %p', (name) => {
    expect(initialsOf(name)).toBeNull();
  });
});

describe('formatJoinDate', () => {
  it('shows the month and year the user joined', () => {
    expect(formatJoinDate('2026-09-26T10:00:00.000Z', 'Europe/Zurich')).toBe(
      'Joined September 2026',
    );
  });

  it("uses the profile's time zone, so a late-night sign-up keeps its local month", () => {
    expect(formatJoinDate('2026-09-30T23:30:00.000Z', 'Asia/Ho_Chi_Minh')).toBe(
      'Joined October 2026',
    );
    expect(formatJoinDate('2026-09-30T23:30:00.000Z', 'America/New_York')).toBe(
      'Joined September 2026',
    );
  });

  it('falls back to the device time zone when the profile has none or an unknown one', () => {
    expect(formatJoinDate('2026-06-15T12:00:00.000Z', null)).toBe('Joined June 2026');
    expect(formatJoinDate('2026-06-15T12:00:00.000Z', 'Not/AZone')).toBe('Joined June 2026');
  });
});

describe('profile form validation (A4: PATCH /me/profile)', () => {
  const named = profileFormSchema({ hasName: true });
  const unnamed = profileFormSchema({ hasName: false });

  it('accepts a name and a bio, trimmed', () => {
    expect(
      named.parse({ displayName: '  Mai ', bio: '  Reading at dawn. ', username: ' mai ' }),
    ).toEqual({
      displayName: 'Mai',
      bio: 'Reading at dawn.',
      username: 'mai',
    });
  });

  it('keeps a name once it has one: A4 cannot clear it', () => {
    expect(errorsOf(named.safeParse({ displayName: '  ', bio: '', username: '' }))).toEqual({
      displayName: 'Add the name you would like to be called.',
    });
  });

  it('lets someone without a name leave it empty for now', () => {
    expect(unnamed.safeParse({ displayName: '', bio: 'Hello', username: '' }).success).toBe(true);
  });

  it('keeps the name within 50 characters and on one line', () => {
    expect(
      errorsOf(named.safeParse({ displayName: 'x'.repeat(51), bio: '', username: '' })),
    ).toEqual({
      displayName: 'Keep your name to 50 characters or fewer.',
    });
    expect(errorsOf(named.safeParse({ displayName: 'Mai\tAnh', bio: '', username: '' }))).toEqual({
      displayName: 'Keep your name on one line.',
    });
  });

  it('keeps the bio within 160 characters after trimming, and allows line breaks', () => {
    expect(
      named.safeParse({ displayName: 'Mai', bio: ` ${'x'.repeat(160)} `, username: '' }).success,
    ).toBe(true);
    expect(
      errorsOf(named.safeParse({ displayName: 'Mai', bio: 'x'.repeat(161), username: '' })),
    ).toEqual({
      bio: 'Keep your bio to 160 characters or fewer.',
    });
    expect(
      named.safeParse({ displayName: 'Mai', bio: 'Line one\nLine two', username: '' }).success,
    ).toBe(true);
  });
});

describe('usernames (A5.1)', () => {
  const schema = profileFormSchema({ hasName: true });
  const values = (username: string) => ({ displayName: 'Mai', bio: '', username });

  it('accepts 3 to 20 letters, numbers, or underscores, and blank (unchanged)', () => {
    for (const username of ['mai', 'Mai_Anh', 'a'.repeat(20), '']) {
      expect(schema.safeParse(values(username)).success).toBe(true);
    }
    for (const username of ['ma', 'a'.repeat(21), 'mai anh', 'mai!']) {
      expect(schema.safeParse(values(username)).error?.issues[0]?.message).toBe(
        'Use 3 to 20 letters, numbers, or underscores.',
      );
    }
  });

  it('sends a new username lowercase, and never a blank or unchanged one', () => {
    const current = { displayName: 'Mai', bio: null, username: 'mai' };
    expect(profileChanges(current, values('Mai_Anh'))).toEqual({ username: 'mai_anh' });
    expect(profileChanges(current, values('MAI'))).toEqual({});
    expect(profileChanges(current, values(''))).toEqual({});
  });
});

describe('profileChanges (only what changed is sent)', () => {
  const profile = { displayName: 'Mai', bio: 'Reading at dawn.', username: null };

  it('sends nothing when nothing changed', () => {
    expect(
      profileChanges(profile, { displayName: 'Mai', bio: 'Reading at dawn.', username: '' }),
    ).toEqual({});
  });

  it('sends only the changed field', () => {
    expect(
      profileChanges(profile, { displayName: 'Mai Anh', bio: 'Reading at dawn.', username: '' }),
    ).toEqual({
      displayName: 'Mai Anh',
    });
    expect(
      profileChanges(profile, { displayName: 'Mai', bio: 'Tea and code.', username: '' }),
    ).toEqual({
      bio: 'Tea and code.',
    });
  });

  it('clears the bio with null', () => {
    expect(profileChanges(profile, { displayName: 'Mai', bio: '', username: '' })).toEqual({
      bio: null,
    });
  });

  it('does not send an empty name for someone who has none yet', () => {
    expect(
      profileChanges(
        { displayName: null, bio: null, username: null },
        { displayName: '', bio: 'Hi', username: '' },
      ),
    ).toEqual({
      bio: 'Hi',
    });
  });

  it('adds a name for someone who had none', () => {
    expect(
      profileChanges(
        { displayName: null, bio: null, username: null },
        { displayName: 'Mai', bio: '', username: '' },
      ),
    ).toEqual({
      displayName: 'Mai',
    });
  });
});
