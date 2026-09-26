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
    expect(named.parse({ displayName: '  Mai ', bio: '  Reading at dawn. ' })).toEqual({
      displayName: 'Mai',
      bio: 'Reading at dawn.',
    });
  });

  it('keeps a name once it has one: A4 cannot clear it', () => {
    expect(errorsOf(named.safeParse({ displayName: '  ', bio: '' }))).toEqual({
      displayName: 'Add the name you would like to be called.',
    });
  });

  it('lets someone without a name leave it empty for now', () => {
    expect(unnamed.safeParse({ displayName: '', bio: 'Hello' }).success).toBe(true);
  });

  it('keeps the name within 50 characters and on one line', () => {
    expect(errorsOf(named.safeParse({ displayName: 'x'.repeat(51), bio: '' }))).toEqual({
      displayName: 'Keep your name to 50 characters or fewer.',
    });
    expect(errorsOf(named.safeParse({ displayName: 'Mai\tAnh', bio: '' }))).toEqual({
      displayName: 'Keep your name on one line.',
    });
  });

  it('keeps the bio within 160 characters after trimming, and allows line breaks', () => {
    expect(named.safeParse({ displayName: 'Mai', bio: ` ${'x'.repeat(160)} ` }).success).toBe(true);
    expect(errorsOf(named.safeParse({ displayName: 'Mai', bio: 'x'.repeat(161) }))).toEqual({
      bio: 'Keep your bio to 160 characters or fewer.',
    });
    expect(named.safeParse({ displayName: 'Mai', bio: 'Line one\nLine two' }).success).toBe(true);
  });
});

describe('profileChanges (only what changed is sent)', () => {
  const profile = { displayName: 'Mai', bio: 'Reading at dawn.' };

  it('sends nothing when nothing changed', () => {
    expect(profileChanges(profile, { displayName: 'Mai', bio: 'Reading at dawn.' })).toEqual({});
  });

  it('sends only the changed field', () => {
    expect(profileChanges(profile, { displayName: 'Mai Anh', bio: 'Reading at dawn.' })).toEqual({
      displayName: 'Mai Anh',
    });
    expect(profileChanges(profile, { displayName: 'Mai', bio: 'Tea and code.' })).toEqual({
      bio: 'Tea and code.',
    });
  });

  it('clears the bio with null', () => {
    expect(profileChanges(profile, { displayName: 'Mai', bio: '' })).toEqual({ bio: null });
  });

  it('does not send an empty name for someone who has none yet', () => {
    expect(
      profileChanges({ displayName: null, bio: null }, { displayName: '', bio: 'Hi' }),
    ).toEqual({
      bio: 'Hi',
    });
  });

  it('adds a name for someone who had none', () => {
    expect(
      profileChanges({ displayName: null, bio: null }, { displayName: 'Mai', bio: '' }),
    ).toEqual({
      displayName: 'Mai',
    });
  });
});
