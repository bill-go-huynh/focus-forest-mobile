/**
 * @jest-environment node
 */
import { ASSET_SOURCES } from '../asset-sources';
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
    ]);
    expect(releaseBlockers([{ ...RELEASE_ASSETS[0]!, status: 'final' }])).toEqual([]);
  });

  it('records the source of every asset that is no longer a placeholder (docs/10 §4)', () => {
    const recorded = new Set(ASSET_SOURCES.flatMap((source) => source.files));
    for (const asset of RELEASE_ASSETS.filter((a) => a.status !== 'placeholder')) {
      if (asset.id === 'theme') continue; // Values, not art: decided by the owner (docs/01).
      for (const file of asset.files) expect(recorded).toContain(file);
    }
    for (const source of ASSET_SOURCES) {
      expect(RELEASE_ASSETS.map((a) => a.id)).toContain(source.asset);
      expect(source.made).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(source.license.length).toBeGreaterThan(10);
      for (const file of source.files) expect(statSync(join(ROOT, file)).isDirectory()).toBe(false);
    }
  });

  it('records every bundled art file', () => {
    const art = readdirSync(join(ROOT, 'assets', 'art')).map((name) => `assets/art/${name}`);
    const recorded = ASSET_SOURCES.flatMap((source) => source.files);
    for (const file of art) expect(recorded).toContain(file);
  });

  it('keeps the signature tree provisional until the owner passes the quality gate', () => {
    expect(RELEASE_ASSETS.find((a) => a.id === 'signature-tree')?.status).toBe('provisional');
  });

  (process.env.RELEASE_AUDIT === '1' ? it : it.skip)(
    'has nothing left to replace (npm run release:audit)',
    () => {
      expect(releaseBlockers()).toEqual([]);
    },
  );
});
