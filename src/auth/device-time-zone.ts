/**
 * The device's IANA time zone, for the profile (A4: PATCH /me/profile `timezone`).
 * Uses the same rule as the API ("UTC" or Area/Location), so the server never gets a value
 * it would refuse. Runtimes may report a legacy alias (Asia/Saigon); the API accepts it.
 */
const IANA_NAME = /^(?:UTC|[A-Z][A-Za-z_-]*(?:\/[A-Z0-9][A-Za-z0-9_+-]*)+)$/;
const MAX_LENGTH = 64;

export function isIanaTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_LENGTH || !IANA_NAME.test(value)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The device time zone, or null when the platform cannot report a valid one. */
export function getDeviceTimeZone(
  resolve: () => string | undefined = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
): string | null {
  try {
    const zone = resolve();
    return isIanaTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}
