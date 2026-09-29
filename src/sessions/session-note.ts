/** A2.6 technical limit, in Unicode code points after NFC and trimming. */
export const NOTE_MAX_LENGTH = 500;

/**
 * A note as the API stores it (A2.6): NFC, trimmed outside, inner spaces and line breaks kept,
 * and a blank note is null.
 */
export function canonicalNote(text: string): string | null {
  const note = text.normalize('NFC').trim();
  return note === '' ? null : note;
}

/** Why the API would refuse this note, or null. Counts code points, not UTF-16 units. */
export function noteError(text: string): string | null {
  const note = canonicalNote(text);
  return note !== null && [...note].length > NOTE_MAX_LENGTH
    ? `A note can be at most ${NOTE_MAX_LENGTH} characters.`
    : null;
}
