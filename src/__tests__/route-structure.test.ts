/**
 * @jest-environment node
 */
// The app has no Node type definitions; these are the few fs and path calls used here.
/* eslint-disable @typescript-eslint/no-require-imports */
const {
  readdirSync,
  readFileSync: readRaw,
  statSync,
} = require('node:fs') as {
  readdirSync: (path: string) => string[];
  readFileSync: (path: string, encoding: 'utf8') => string;
  statSync: (path: string) => { isDirectory: () => boolean };
};
const { join, relative, sep } = require('node:path') as {
  join: (...parts: string[]) => string;
  relative: (from: string, to: string) => string;
  sep: string;
};
/* eslint-enable @typescript-eslint/no-require-imports */
declare const __dirname: string;
const readFileSync = (path: string) => readRaw(path, 'utf8');

// docs/05 §4: at most three levels deep from a tab. Tabs appear with the phase that fills
// them. Settings live under Profile only.
const APP = join(__dirname, '..', 'app');
const TABS = join(APP, '(tabs)');
const AUTH = join(APP, '(auth)');

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return /\.tsx?$/.test(entry) && !entry.startsWith('_') ? [path] : [];
  });
}

/** Levels from the tab: the tab's own screen is level 1. Groups "(x)" are not levels. */
function depthFromTab(file: string): number {
  const segments = relative(TABS, file)
    .replace(/\.tsx?$/, '')
    .split(sep)
    .filter((segment) => !/^\(.*\)$/.test(segment));
  const withoutIndex = segments.at(-1) === 'index' ? segments.slice(0, -1) : segments;
  return Math.max(1, withoutIndex.length);
}

describe('route structure', () => {
  it('has exactly the four Phase 1 tabs', () => {
    const tabs = readdirSync(TABS)
      .filter((entry) => !entry.startsWith('_'))
      .map((entry) => entry.replace(/\.tsx?$/, ''))
      .sort();
    expect(tabs).toEqual(['forest', 'index', 'insights', 'profile']);
  });

  it('keeps every screen within three levels of its tab', () => {
    for (const file of routeFiles(TABS)) {
      expect({ file: relative(APP, file), depth: depthFromTab(file) }).toEqual({
        file: relative(APP, file),
        depth: expect.any(Number),
      });
      expect(depthFromTab(file)).toBeLessThanOrEqual(3);
    }
  });

  it('puts Settings under Profile and nowhere else', () => {
    const settings = routeFiles(APP).filter((file) => /settings/i.test(relative(APP, file)));
    expect(settings.map((file) => relative(APP, file))).toEqual([
      join('(tabs)', 'profile', 'settings.tsx'),
    ]);
  });

  it('puts Focus outside the tabs, as a full-screen takeover with no tab bar (docs/05 §1)', () => {
    expect(routeFiles(APP).filter((file) => /focus/i.test(relative(APP, file)))).toEqual([
      join(APP, 'focus.tsx'),
    ]);
    expect(readFileSync(join(APP, '_layout.tsx'))).toMatch(/name="focus"/);
  });

  it('turns off the swipe back on Focus: the native gesture cannot ask to end the session first', () => {
    expect(readFileSync(join(APP, '_layout.tsx'))).toMatch(
      /name="focus"\s+options=\{\{\s*gestureEnabled: false\s*\}\}/,
    );
  });

  it('keeps every screen inside the tabs or the auth group, so there is no stray route', () => {
    // Focus is the one screen outside them: it replaces the tabs while it runs.
    const outside = routeFiles(APP).filter(
      (file) => !file.startsWith(TABS) && !file.startsWith(AUTH) && file !== join(APP, 'focus.tsx'),
    );
    expect(outside).toEqual([]);
  });

  it('has exactly the sign-up and sign-in screens in the auth group (M11)', () => {
    expect(
      routeFiles(AUTH)
        .map((file) => relative(AUTH, file))
        .sort(),
    ).toEqual(['sign-in.tsx', 'sign-up.tsx']);
  });

  it('asks for no notification permission at launch (docs/02: ask in context)', () => {
    // Local timer notifications arrive in Phase 2 (M2.10): only their adapter may use
    // expo-notifications, and permission is asked when a timer first needs it, never by a route.
    const SRC = join(APP, '..');
    const users = routeFiles(SRC).filter(
      (file) =>
        !file.includes(`${sep}__tests__${sep}`) &&
        !file.includes(`${sep}test-utils${sep}`) &&
        /expo-notifications/.test(readFileSync(file)),
    );
    expect(users.map((file) => relative(SRC, file))).toEqual([
      join('notifications', 'expo-timer-notifications.ts'),
    ]);
    for (const file of routeFiles(APP)) {
      expect(readFileSync(file)).not.toMatch(/requestPermission|expo-notifications/);
    }
    // Phase 2 asks for no exact alarms: the OS may deliver a little late in Doze; the timer's
    // truth is its timestamps either way.
    expect(readFileSync(join(SRC, '..', 'app.json'))).not.toMatch(/EXACT_ALARM/);
  });
});
