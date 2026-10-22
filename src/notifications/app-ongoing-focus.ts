import { requireOptionalNativeModule } from 'expo';

import type { ActiveTimerStore } from '../timer/active-timer-store';
import {
  createOngoingFocusAdapter,
  OngoingFocusNotification,
  type OngoingFocusNative,
} from './ongoing-focus';

/** The Focus screen, by the app's scheme (app.json `scheme`), as the other deep links. */
export const ONGOING_FOCUS_URL = 'focusforest:///focus';

/**
 * The local module (`modules/focus-ongoing-notification`), or null where it is not in the build
 * (Expo Go, iOS, an APK made before it): then nothing is shown and the timer works the same.
 */
function loadNative(): OngoingFocusNative | null {
  const native = requireOptionalNativeModule<Partial<OngoingFocusNative>>(
    'FocusOngoingNotification',
  );
  return native && typeof native.show === 'function' && typeof native.hide === 'function'
    ? (native as OngoingFocusNative)
    : null;
}

/** The app's ongoing focus notification. Issues are reported by code only. */
export function createAppOngoingFocus(timers: ActiveTimerStore): OngoingFocusNotification {
  return new OngoingFocusNotification({
    timers,
    adapter: createOngoingFocusAdapter(loadNative),
    url: ONGOING_FOCUS_URL,
    report: (issue) => console.warn(`[notifications] ongoing focus: ${issue.code}`),
  });
}
