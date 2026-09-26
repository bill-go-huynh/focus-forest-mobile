import { signInSchema, signUpSchema } from '../validation';

const valid = { email: 'mai@example.com', password: 'correct horse', displayName: 'Mai' };
const errorsOf = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) =>
  Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [String(issue.path[0]), issue.message]),
  );

describe('sign-up validation (mirrors the A3 and A4 rules, in kind words)', () => {
  it('accepts valid details and trims them', () => {
    expect(
      signUpSchema.parse({ ...valid, email: '  mai@example.com ', displayName: '  Mai ' }),
    ).toEqual(valid);
  });

  it('asks for every field when the form is empty', () => {
    expect(errorsOf(signUpSchema.safeParse({ email: '', password: '', displayName: '' }))).toEqual({
      email: 'Enter your email address.',
      password: 'Use at least 8 characters for your password.',
      displayName: 'Add the name you would like to be called.',
    });
  });

  it.each(['mai', 'mai@', '@example.com', 'mai example.com'])(
    'asks for a valid email (%p)',
    (email) => {
      expect(errorsOf(signUpSchema.safeParse({ ...valid, email }))).toEqual({
        email: 'Enter a valid email address.',
      });
    },
  );

  it('asks for a password of 8 to 128 characters', () => {
    expect(errorsOf(signUpSchema.safeParse({ ...valid, password: 'short' }))).toEqual({
      password: 'Use at least 8 characters for your password.',
    });
    expect(errorsOf(signUpSchema.safeParse({ ...valid, password: 'x'.repeat(129) }))).toEqual({
      password: 'Use at most 128 characters for your password.',
    });
  });

  it('keeps a password exactly as typed, spaces included', () => {
    expect(signUpSchema.parse({ ...valid, password: '  spaced out  ' }).password).toBe(
      '  spaced out  ',
    );
  });

  it('keeps the display name within 50 characters and on one line', () => {
    expect(errorsOf(signUpSchema.safeParse({ ...valid, displayName: 'x'.repeat(51) }))).toEqual({
      displayName: 'Keep your name to 50 characters or fewer.',
    });
    expect(errorsOf(signUpSchema.safeParse({ ...valid, displayName: 'Mai\nAnh' }))).toEqual({
      displayName: 'Keep your name on one line.',
    });
  });

  it('never blames the user in its messages', () => {
    const messages = Object.values(
      errorsOf(signUpSchema.safeParse({ email: 'x', password: '', displayName: '' })),
    );
    for (const message of messages) {
      expect(message).not.toMatch(/invalid|wrong|fail|error|must/i);
    }
  });
});

describe('sign-in validation', () => {
  it('asks for the email and the password', () => {
    expect(errorsOf(signInSchema.safeParse({ email: '', password: '' }))).toEqual({
      email: 'Enter your email address.',
      password: 'Enter your password.',
    });
  });

  it('does not apply the sign-up length rule to an existing password', () => {
    expect(signInSchema.safeParse({ email: 'mai@example.com', password: 'short' }).success).toBe(
      true,
    );
  });
});
