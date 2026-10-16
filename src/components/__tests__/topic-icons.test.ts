import { DEFAULT_TOPIC_ICON, TOPIC_ICONS, topicIcon } from '../topic-icons';

/**
 * ART.3 The curated topic icon set (docs/01 §5: ~40–60 rounded line icons, nature motifs
 * welcome; users pick from the set and never upload). Identifiers are content ids the API
 * stores as sent (focus-forest-api `isTopicIcon`); how they look is the client's (docs/07 §5).
 */

const API_IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

describe('topic icons (ART.3)', () => {
  const ids = TOPIC_ICONS.map((icon) => icon.id);

  it('is a curated set of 40–60 icons', () => {
    expect(TOPIC_ICONS.length).toBeGreaterThanOrEqual(40);
    expect(TOPIC_ICONS.length).toBeLessThanOrEqual(60);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses identifiers the API accepts, including the new-topic default', () => {
    for (const id of ids) {
      expect(id).toMatch(API_IDENTIFIER);
      expect(id.length).toBeLessThanOrEqual(64);
    }
    expect(ids).toContain('topic.default');
    expect(ids).toEqual(expect.arrayContaining(['book', 'music-note', 'code', 'pen']));
  });

  it('names every icon, for the picker and its screen reader labels', () => {
    const labels = TOPIC_ICONS.map((icon) => icon.label);
    for (const label of labels) expect(label).toMatch(/^[A-Z][a-z]+( [a-z]+)*$/);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('draws every icon inside the 24-unit grid, with distinct outlines', () => {
    for (const icon of TOPIC_ICONS) {
      expect(icon.paths.length).toBeGreaterThan(0);
      for (const d of icon.paths) {
        for (const n of (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)) {
          expect(Math.abs(n)).toBeLessThanOrEqual(24);
        }
      }
    }
    const outlines = TOPIC_ICONS.map((icon) => icon.paths.join(' '));
    expect(new Set(outlines).size).toBe(outlines.length);
  });

  it('falls back to the default icon for an identifier it does not know', () => {
    expect(topicIcon('a-future-icon')).toBe(DEFAULT_TOPIC_ICON);
    expect(topicIcon('book').id).toBe('book');
    expect(DEFAULT_TOPIC_ICON.id).toBe('topic.default');
  });
});
