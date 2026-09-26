import { getDeviceTimeZone, isIanaTimeZone } from '../device-time-zone';

describe('device time zone (A4: PATCH /me/profile accepts an IANA name)', () => {
  it.each([
    'Europe/Zurich',
    'Asia/Ho_Chi_Minh',
    'Asia/Saigon',
    'America/Argentina/Buenos_Aires',
    'Etc/GMT-7',
    'UTC',
  ])('reports %s', (zone) => {
    expect(getDeviceTimeZone(() => zone)).toBe(zone);
  });

  it.each([undefined, '', '+07:00', 'EST', 'europe/zurich', 'Not/A_Zone', 'A'.repeat(65)])(
    'reports nothing for %p, so the server never gets a value it would refuse',
    (zone) => {
      expect(getDeviceTimeZone(() => zone)).toBeNull();
    },
  );

  it('reports nothing when the platform cannot tell', () => {
    expect(
      getDeviceTimeZone(() => {
        throw new Error('Intl is not available');
      }),
    ).toBeNull();
  });

  it('reads the zone from Intl by default', () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(getDeviceTimeZone()).toBe(isIanaTimeZone(zone) ? zone : null);
  });
});
