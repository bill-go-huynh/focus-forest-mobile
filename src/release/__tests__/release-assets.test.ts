/**
 * @jest-environment node
 */
import { releaseBlockers, RELEASE_ASSETS } from '../release-assets';

/* eslint-disable @typescript-eslint/no-require-imports */
const { readdirSync, readFileSync, statSync } = require('node:fs') as {
  readdirSync: (path: string) => string[];
  readFileSync: (path: string, encoding: 'utf8') => string;
  statSync: (path: string) => { isDirectory: () => boolean };
};
const { join, relative } = require('node:path') as {
  join: (...parts: string[]) => string;
  relative: (from: string, to: string) => string;
};
/* eslint-enable @typescript-eslint/no-require-imports */
declare const __dirname: string;

const ROOT = join(__dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

/**
 * R7.1 The release asset audit (docs/12 Phase 20; owner decision 5). `npm run release:audit`
 * fails while anything is still a placeholder; the regular suite checks the list is complete.
 */
describe('release assets (R7.1)', () => {
  it('lists every file marked as a placeholder or provisional', () => {
    const marked = files(SRC)
      .filter((path) => !path.includes(`${join('src', 'release')}`))
      .filter((path) => /\b(PLACEHOLDERS?|PROVISIONAL)\b/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(ROOT, path))
      .sort();
    const listed = RELEASE_ASSETS.flatMap((asset) => asset.files).sort();
    expect(marked).toEqual(listed);
  });

  it('names what a public release still waits for (the art pass, docs/10)', () => {
    expect(releaseBlockers()).toEqual([
      'theme',
      'tab-icons',
      'topic-icons',
      'illustrations',
      'signature-tree',
      'species',
      'badges',
      'collection',
      'community-tree',
    ]);
    expect(releaseBlockers([{ ...RELEASE_ASSETS[0]!, status: 'final' }])).toEqual([]);
  });

  (process.env.RELEASE_AUDIT === '1' ? it : it.skip)(
    'has nothing left to replace (npm run release:audit)',
    () => {
      expect(releaseBlockers()).toEqual([]);
    },
  );
});
