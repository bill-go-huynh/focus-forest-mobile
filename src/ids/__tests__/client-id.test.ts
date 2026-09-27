import { createClientId } from '../client-id';

// expo-crypto is a native module; under jest its generated mock returns undefined. The Web
// Crypto generator of the test runtime stands in for the native one, so the wiring and real
// randomness are tested.
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => globalThis.crypto.randomUUID()) }));

const LOWERCASE_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('createClientId', () => {
  it('returns a lowercase version 4 UUID from expo-crypto', () => {
    const { randomUUID: native } = jest.requireMock<{ randomUUID: jest.Mock }>('expo-crypto');

    const id = createClientId();

    expect(id).toMatch(LOWERCASE_UUID_V4);
    expect(native).toHaveBeenCalled();
  });

  it('returns a different id every time', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createClientId()));
    expect(ids.size).toBe(100);
  });

  it('lowercases an uppercase UUID, as iOS generators write them', () => {
    const upper = globalThis.crypto.randomUUID().toUpperCase();
    expect(createClientId(() => upper)).toBe(upper.toLowerCase());
  });

  it.each([undefined, '', 'not-a-uuid', '0192f1a2-3b4c-7d5e-8f60'])(
    'refuses a generator result that is not a UUID: %j',
    (value) => {
      expect(() => createClientId(() => value as unknown as string)).toThrow(/UUID/);
    },
  );
});
