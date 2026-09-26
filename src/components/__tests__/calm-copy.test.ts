import { assertCalmCopy, assertOneSentence } from '../calm-copy';

describe('assertCalmCopy (docs/02: no shame, no blame, no dying trees)', () => {
  it.each([
    "Your first session will plant this month's seed.",
    "We couldn't load this right now.",
    "Your session is saved on this device and will sync when you're back online.",
    "Your forest begins when this month's tree is planted.",
  ])('accepts calm copy: %s', (text) => {
    expect(() => assertCalmCopy(text, 'Test')).not.toThrow();
  });

  it.each([
    'You failed to focus today.',
    'Loading failed.',
    'Your tree died.',
    'Your tree is dead.',
    'The tree is wilting.',
    'Your plant withered away.',
    "That's your fault.",
    "You didn't focus today.",
    'FAILURE',
  ])('rejects shaming or dying-tree language: %s', (text) => {
    expect(() => assertCalmCopy(text, 'Test')).toThrow(/calm/);
  });
});

describe('assertOneSentence (docs/01 §9: one sentence)', () => {
  it.each([
    "Your first session will plant this month's seed.",
    'Nothing here yet',
    'Ready when you are!',
  ])('accepts one sentence: %s', (text) => {
    expect(() => assertOneSentence(text, 'Test')).not.toThrow();
  });

  it.each(['No sessions yet. Start one now.', 'Nothing here! Try again?'])(
    'rejects more than one sentence: %s',
    (text) => {
      expect(() => assertOneSentence(text, 'Test')).toThrow(/one sentence/);
    },
  );
});
