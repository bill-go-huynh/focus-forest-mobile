import { appRouteForLink } from '../notification-links';

/**
 * M6.2 Where a notification opens (A6.1 `notification-links.ts`, docs/05 §4): the five places the
 * API links to; anything else opens Home.
 */
describe('appRouteForLink (M6.2)', () => {
  const ROOM = '0192f1a2-3b4c-7d5e-8f60-718293000001';

  it.each([
    ['/', '/'],
    ['/recap/2026/9', '/recap/2026/9'],
    [`/together/room/${ROOM}`, `/together/room/${ROOM}`],
    [`/together/challenges/${ROOM}`, `/together/challenges/${ROOM}`],
    ['/profile/achievements', '/profile/achievements'],
  ])('opens %s', (link, route) => {
    expect(appRouteForLink(link)).toBe(route);
  });

  it.each([
    ['an unknown path', '/settings/danger'],
    ['a month out of range', '/recap/2026/13'],
    ['a room that is not an id', '/together/room/not-a-room'],
    ['an event (events were removed, 2026-10-22)', '/together/events/autumn-focus'],
    ['another app', 'https://example.com/'],
    ['nothing', undefined],
    ['a number', 42],
  ])('opens Home for %s', (_case, link) => {
    expect(appRouteForLink(link)).toBe('/');
  });
});
