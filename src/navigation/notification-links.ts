/**
 * Where a notification opens the app (M6.2; docs/05 §4). The API links only to these shapes
 * (focus-forest-api `notification-links.ts`); the app checks a link against the same shapes
 * before following it, and anything else opens Home.
 */

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const KNOWN = [
  /^\/$/,
  /^\/recap\/\d{4}\/(?:[1-9]|1[0-2])$/,
  new RegExp(`^/together/room/${UUID}$`),
  new RegExp(`^/together/challenges/${UUID}$`),
  /^\/profile\/achievements$/,
];

/** The app route for a notification's link: the link itself when known, else Home. */
export function appRouteForLink(link: unknown): string {
  return typeof link === 'string' && KNOWN.some((pattern) => pattern.test(link)) ? link : '/';
}
