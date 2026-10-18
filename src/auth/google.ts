import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';

/**
 * W.2 Google's account chooser, for "Continue with Google" and for confirming a Google
 * account's deletion. The app asks for an ID token for our Web OAuth client
 * (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, public configuration); the API verifies it. Without that
 * client id Google sign-in is not offered.
 */

export type GoogleIdTokenResult =
  | { kind: 'token'; idToken: string }
  | { kind: 'cancelled' }
  | { kind: 'unavailable' }
  | { kind: 'failed' };

export function googleWebClientId(): string | null {
  return process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || null;
}

let configuredFor: string | null = null;

/** Configures Google for our client once; false when the app has no client id. */
function configure(): boolean {
  const webClientId = googleWebClientId();
  if (!webClientId) return false;
  if (configuredFor !== webClientId) {
    GoogleSignin.configure({ webClientId });
    configuredFor = webClientId;
  }
  return true;
}

/** Opens Google's chooser and answers the chosen account's ID token. */
export async function requestGoogleIdToken(): Promise<GoogleIdTokenResult> {
  if (!configure()) return { kind: 'unavailable' };
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) return { kind: 'cancelled' };
    const idToken = response.data.idToken;
    return idToken ? { kind: 'token', idToken } : { kind: 'failed' };
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS) {
        return { kind: 'cancelled' };
      }
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return { kind: 'unavailable' };
    }
    return { kind: 'failed' };
  }
}

/** Forgets the Google account chosen on this device (sign-out). Never fails the sign-out. */
export async function forgetGoogleAccount(): Promise<void> {
  try {
    if (configure()) await GoogleSignin.signOut();
  } catch {
    // Nothing to forget, or Google is not available: the app's own session is already gone.
  }
}
