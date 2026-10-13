/**
 * How a notification arriving while the app is open is shown (M6.1). A push shows as a banner,
 * unless someone is focusing (docs/02: nothing during an active focus session; the server holds
 * them too, this covers one already on its way). The timer's own notifications never show in
 * the app: the Focus screen shows the end itself (M2.10).
 */
export interface ForegroundPresentation {
  shouldShowBanner: boolean;
  shouldShowList: boolean;
  shouldPlaySound: boolean;
  shouldSetBadge: boolean;
}

export function foregroundPresentation(data: unknown, focusing: boolean): ForegroundPresentation {
  const timer =
    typeof data === 'object' &&
    data !== null &&
    (data as { kind?: unknown }).kind === 'focus-timer';
  const show = !timer && !focusing;
  return {
    shouldShowBanner: show,
    shouldShowList: show,
    shouldPlaySound: show,
    shouldSetBadge: false,
  };
}
