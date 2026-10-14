import { avoidedWordProblems, renderedCopy } from '../avoided-words';

/**
 * FR.8 The docs/02 "Words we use / avoid" table, checked on everything a screen shows: its text
 * and the labels a screen reader reads.
 */

describe('avoidedWordProblems (docs/02 Words we use / avoid)', () => {
  it.each([
    'Welcome back',
    'Not reached yet',
    'Session ended early',
    'Rest day today · your 5-day streak is kept',
    'A quiet month',
    'You contributed 40 minutes together',
    'Nothing is lost.',
    'Take a break whenever you like',
  ])('accepts: %s', (text) => {
    expect(avoidedWordProblems(text)).toEqual([]);
  });

  it.each([
    ['You failed to focus today', 'fail'],
    ['You will lose your streak', 'lose'],
    ['Your tree died', 'die'],
    ['The tree is dead', 'die'],
    ['Your streak is broken', 'broken'],
    ['A bad month', 'bad month'],
    ['Inactive since Monday', 'inactive'],
    ['Lazy day?', 'lazy'],
    ['You skipped 3 days', 'skipped'],
    ['You missed 3 days', 'you missed'],
    ['Failed goal', 'fail'],
    ['Session abandoned', 'abandoned'],
    ['You beat Mai', 'beat'],
    ['Crushed it', 'crushed'],
    ['You lost to Kai', 'lose'],
    ['The tree wilted', 'wilt'],
  ])('refuses: %s', (text, word) => {
    expect(avoidedWordProblems(text)).toEqual([expect.stringContaining(word)]);
  });
});

describe('renderedCopy', () => {
  it('collects text and accessibility labels, skipping hidden subtrees', () => {
    const tree = {
      type: 'View',
      props: {},
      children: [
        { type: 'Text', props: {}, children: ['Hello'] },
        { type: 'View', props: { accessibilityLabel: 'Start Focus' }, children: null },
        {
          type: 'View',
          props: { accessibilityElementsHidden: true },
          children: [{ type: 'Text', props: {}, children: ['hidden'] }],
        },
      ],
    };
    expect(renderedCopy(tree)).toEqual(['Hello', 'Start Focus']);
  });
});
