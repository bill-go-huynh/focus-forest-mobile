import { PushRegistration, type PushAdapter, type PushDevicesApi } from '../push-registration';
import type { NotificationPermission } from '../timer-notifications';

/**
 * M6.1 Device registration (A6.1 `PUT/DELETE /me/devices/:token`). Permission is asked only when
 * someone turns a notification on (docs/02: in context, never at launch); a device is
 * registered whenever permission is granted and a push token exists, and unregistered on
 * sign-out. Without an EAS project there is no token, and nothing is sent (owner decision 5).
 */

const TOKEN = 'ExponentPushToken[abcdef123456]';

function setup({
  permission = { status: 'undetermined', canAskAgain: true } as NotificationPermission,
  answer = { status: 'granted', canAskAgain: true } as NotificationPermission,
  token = TOKEN as string | null,
} = {}) {
  const state = { permission, answer, token, requests: 0, fail: false };
  const adapter: PushAdapter = {
    permission: async () => state.permission,
    requestPermission: async () => {
      state.requests += 1;
      state.permission = state.answer;
      return state.permission;
    },
    token: async () => state.token,
  };
  const calls: string[] = [];
  const api: PushDevicesApi = {
    register: jest.fn(
      async (pushToken: string, device: { platform: string; appVersion: string | null }) => {
        calls.push(`register ${pushToken} ${device.platform} ${device.appVersion}`);
        if (state.fail) throw new Error('offline');
      },
    ),
    unregister: jest.fn(async (pushToken: string) => {
      calls.push(`unregister ${pushToken}`);
      if (state.fail) throw new Error('offline');
    }),
  };
  const report = jest.fn();
  const push = new PushRegistration({
    adapter,
    api,
    platform: 'ios',
    appVersion: '1.4.0',
    report,
  });
  return { push, state, calls, report };
}

describe('PushRegistration (M6.1)', () => {
  it('never asks on its own: refreshing only registers when already allowed', async () => {
    const asked = setup();
    await asked.push.refresh();
    expect(asked.state.requests).toBe(0);
    expect(asked.calls).toEqual([]);

    const allowed = setup({ permission: { status: 'granted', canAskAgain: true } });
    await allowed.push.refresh();
    expect(allowed.calls).toEqual([`register ${TOKEN} ios 1.4.0`]);
  });

  it('asks the first time a notification is turned on, then registers', async () => {
    const app = setup();
    await expect(app.push.enable()).resolves.toBe('granted');
    expect(app.state.requests).toBe(1);
    expect(app.calls).toEqual([`register ${TOKEN} ios 1.4.0`]);

    // Already allowed: no second question.
    await app.push.enable();
    expect(app.state.requests).toBe(1);
  });

  it('says when notifications are off in the system, and registers nothing', async () => {
    const refused = setup({ answer: { status: 'denied', canAskAgain: false } });
    await expect(refused.push.enable()).resolves.toBe('denied');
    expect(refused.calls).toEqual([]);

    // Once the system says no for good, it is never asked again.
    const blocked = setup({ permission: { status: 'denied', canAskAgain: false } });
    await expect(blocked.push.enable()).resolves.toBe('denied');
    expect(blocked.state.requests).toBe(0);
  });

  it('registers nothing without a push token (no EAS project yet)', async () => {
    const app = setup({ permission: { status: 'granted', canAskAgain: true }, token: null });
    await expect(app.push.enable()).resolves.toBe('granted');
    expect(app.calls).toEqual([]);
  });

  it('unregisters the device it registered, on sign-out', async () => {
    const app = setup({ permission: { status: 'granted', canAskAgain: true } });
    await app.push.unregister();
    expect(app.calls).toEqual([]);

    await app.push.refresh();
    await app.push.unregister();
    expect(app.calls).toEqual([`register ${TOKEN} ios 1.4.0`, `unregister ${TOKEN}`]);
    // Only once.
    await app.push.unregister();
    expect(app.calls).toHaveLength(2);
  });

  it('never lets a failure stop sign-out or a setting', async () => {
    const app = setup({ permission: { status: 'granted', canAskAgain: true } });
    app.state.fail = true;
    await expect(app.push.enable()).resolves.toBe('granted');
    expect(app.report).toHaveBeenCalledWith({ code: 'register_failed' });

    app.state.fail = false;
    await app.push.refresh();
    app.state.fail = true;
    await expect(app.push.unregister()).resolves.toBeUndefined();
    expect(app.report).toHaveBeenCalledWith({ code: 'unregister_failed' });
  });
});
