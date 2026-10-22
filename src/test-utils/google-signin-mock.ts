/**
 * Google Sign-In is native: tests get its JS surface in memory (W.2). `nextGoogleSignIn` decides
 * what the next account chooser answers; by default the person picks their Google account.
 */

export const GOOGLE_ID_TOKEN = 'google-id-token-1';

type Answer = () => Promise<unknown>;
const success: Answer = async () => ({
  type: 'success',
  data: {
    idToken: GOOGLE_ID_TOKEN,
    serverAuthCode: null,
    scopes: [],
    user: {
      id: 'google-ada',
      email: 'ada@gmail.com',
      name: 'Ada Lovelace',
      givenName: 'Ada',
      familyName: 'Lovelace',
      photo: null,
    },
  },
});
let answer: Answer = success;
let playServices = true;
/**
 * Like the native library, the account chosen last is remembered until sign-out: `signIn` then
 * answers it again without showing the chooser. `chooserShown` counts the choosers shown.
 */
let remembered: unknown = null;
let chooserShown = 0;
/** How many account choosers were shown since the last reset. */
export const googleChoosersShown = () => chooserShown;

export const statusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
} as const;

export const googleSignInMock = {
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => {
      if (!playServices) {
        throw Object.assign(new Error('Play services not available'), {
          code: statusCodes.PLAY_SERVICES_NOT_AVAILABLE,
        });
      }
      return true;
    }),
    signIn: jest.fn(async () => {
      if (remembered) return remembered;
      chooserShown += 1;
      const response = await answer();
      if ((response as { type?: string }).type === 'success') remembered = response;
      return response;
    }),
    signOut: jest.fn(async () => {
      remembered = null;
      return null;
    }),
  },
  statusCodes,
  isSuccessResponse: (response: { type: string }) => response.type === 'success',
  isCancelledResponse: (response: { type: string }) => response.type === 'cancelled',
  isErrorWithCode: (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error,
};

/** What the account chooser does next: pick the account, back out, or fail with a code. */
export function nextGoogleSignIn(next: 'success' | 'cancelled' | { code: string }): void {
  if (next === 'success') answer = success;
  else if (next === 'cancelled') answer = async () => ({ type: 'cancelled', data: null });
  else answer = async () => Promise.reject(Object.assign(new Error(next.code), next));
}

export function setPlayServicesAvailable(available: boolean): void {
  playServices = available;
}

export function resetGoogleSignInMock(): void {
  answer = success;
  playServices = true;
  remembered = null;
  chooserShown = 0;
  for (const fn of Object.values(googleSignInMock.GoogleSignin)) fn.mockClear();
}
