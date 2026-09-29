import { canonicalNote, NOTE_MAX_LENGTH, noteError } from '../session-note';

describe('canonicalNote (as the API stores a note, A2.6)', () => {
  it('trims the outside, keeps the inside, and uses NFC', () => {
    expect(canonicalNote('  Read ch. 4\n\n  then notes  ')).toBe('Read ch. 4\n\n  then notes');
    // "e" + combining acute becomes the single "é".
    expect(canonicalNote('café')).toBe('café');
  });

  it('makes a blank note null', () => {
    expect(canonicalNote('')).toBeNull();
    expect(canonicalNote('   \n\t ')).toBeNull();
  });
});

describe('noteError', () => {
  it('accepts 500 characters and refuses 501, counting code points', () => {
    expect(NOTE_MAX_LENGTH).toBe(500);
    expect(noteError('a'.repeat(500))).toBeNull();
    expect(noteError('a'.repeat(501))).toBe('A note can be at most 500 characters.');
  });

  it('counts an emoji as one character, not two UTF-16 units', () => {
    const emoji = '🌱'.repeat(500);
    expect(emoji.length).toBe(1000);
    expect(noteError(emoji)).toBeNull();
    expect(noteError(`${emoji}🌱`)).not.toBeNull();
  });

  it('measures after trimming and NFC', () => {
    expect(noteError(`  ${'a'.repeat(500)}  `)).toBeNull();
    expect(noteError('é'.repeat(500))).toBeNull();
  });
});
