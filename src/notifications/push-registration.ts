import type { NotificationPermission } from './timer-notifications';

/**
 * This device as a push destination (M6.1; A6.1 devices). The permission is asked only when
 * someone turns a notification on (docs/02: in context, never at launch). A device is
 * registered whenever the permission is granted and a push token exists, and unregistered
 * before sign-out. Without an EAS project there is no token, so nothing is registered (owner
 * decision 5). No failure ever stops a setting or a sign-out; it is reported, and the next
 * launch registers again.
 */

/** The OS side: the notification permission and this device's Expo push token. */
export interface PushAdapter {
  permission(): Promise<NotificationPermission>;
  requestPermission(): Promise<NotificationPermission>;
  /** The Expo push token, or null where there is none (no EAS project, or unsupported). */
  token(): Promise<string | null>;
}

export interface PushDevicesApi {
  register(
    token: string,
    device: { platform: 'ios' | 'android'; appVersion: string | null },
  ): Promise<void>;
  unregister(token: string): Promise<void>;
}

export class PushRegistration {
  /** The token registered for the signed-in user, to unregister on sign-out. */
  private registered: string | null = null;

  constructor(
    private readonly options: {
      adapter: PushAdapter;
      api: PushDevicesApi;
      platform: 'ios' | 'android';
      appVersion: string | null;
      report: (issue: { code: string }) => void;
    },
  ) {}

  /** The permission as it stands, without asking (null when it cannot be read). */
  async permission(): Promise<NotificationPermission['status'] | null> {
    try {
      return (await this.options.adapter.permission()).status;
    } catch {
      return null;
    }
  }

  /** Registers when the permission is already granted. Never asks. */
  async refresh(): Promise<void> {
    let permission: NotificationPermission;
    try {
      permission = await this.options.adapter.permission();
    } catch {
      this.options.report({ code: 'permission_failed' });
      return;
    }
    if (permission.status === 'granted') await this.register();
  }

  /**
   * Someone turned a notification on: asks the first time (while the OS still may), then
   * registers. Answers the permission as it stands, for Settings to explain a refusal.
   */
  async enable(): Promise<NotificationPermission['status']> {
    let permission: NotificationPermission;
    try {
      permission = await this.options.adapter.permission();
      if (permission.status === 'undetermined' && permission.canAskAgain) {
        permission = await this.options.adapter.requestPermission();
      }
    } catch {
      this.options.report({ code: 'permission_failed' });
      return 'undetermined';
    }
    if (permission.status === 'granted') await this.register();
    return permission.status;
  }

  /** Before sign-out, while the session still holds: this device stops receiving them. */
  async unregister(): Promise<void> {
    const token = this.registered;
    if (!token) return;
    this.registered = null;
    try {
      await this.options.api.unregister(token);
    } catch {
      this.options.report({ code: 'unregister_failed' });
    }
  }

  private async register(): Promise<void> {
    // Two steps, two codes: the OS or Expo gave no token, or the server could not be reached.
    let token: string | null;
    try {
      token = await this.options.adapter.token();
    } catch {
      this.options.report({ code: 'token_failed' });
      return;
    }
    if (!token) return;
    try {
      await this.options.api.register(token, {
        platform: this.options.platform,
        appVersion: this.options.appVersion,
      });
      this.registered = token;
    } catch {
      this.options.report({ code: 'register_failed' });
    }
  }
}
