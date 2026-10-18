import { useRef, useState } from 'react';

import {
  NetworkError,
  UnauthenticatedError,
  updateProfile,
  useApi,
  type ProfileChanges,
} from '../api';
import { useOnboardingStore } from '../onboarding/OnboardingProvider';
import { useAuthFlow } from './AuthFlowProvider';
import {
  describeAuthError,
  GOOGLE_FAILED_MESSAGE,
  GOOGLE_UNAVAILABLE_MESSAGE,
  type AuthErrorDescription,
} from './describe-error';
import { googleWebClientId, requestGoogleIdToken } from './google';
import { getDeviceTimeZone } from './device-time-zone';
import type { ResetConfirmValues, SignInValues, SignUpValues } from './validation';

const PROFILE_NETWORK_MESSAGE =
  "Your account is ready, but we couldn't save your name yet. Check your connection and try again.";
const PROFILE_GENERAL_MESSAGE =
  "Your account is ready, but we couldn't save your name yet. Please try again.";

/**
 * Sign up (M11): create the account (A3), then save the display name and the device time
 * zone in one PATCH /me/profile (A4), then let the app open. The new account is marked
 * onboarding-pending as soon as it exists (M3.3), so a kill before onboarding ends resumes it.
 * If the profile step fails, the account exists: `retryProfile` repeats only that step.
 */
export function useSignUp() {
  const { auth, client } = useApi();
  const { setCompletingSignUp } = useAuthFlow();
  const onboarding = useOnboardingStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorDescription | null>(null);
  const [profilePending, setProfilePending] = useState(false);
  const pendingChanges = useRef<ProfileChanges | null>(null);
  const inFlight = useRef(false);

  async function saveProfile(changes: ProfileChanges) {
    try {
      await updateProfile(client, changes);
      pendingChanges.current = null;
      setProfilePending(false);
      setCompletingSignUp(false);
    } catch (cause) {
      if (cause instanceof UnauthenticatedError) {
        // The new session ended; the app returns to the auth screens on its own.
        setCompletingSignUp(false);
        return;
      }
      setProfilePending(true);
      setError({
        message: cause instanceof NetworkError ? PROFILE_NETWORK_MESSAGE : PROFILE_GENERAL_MESSAGE,
      });
    }
  }

  async function run(task: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await task();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const submit = (values: SignUpValues) =>
    run(async () => {
      setCompletingSignUp(true);
      try {
        const user = await auth.signUp({ email: values.email, password: values.password });
        // Only a new account is ever marked: existing ones never go through onboarding.
        await onboarding.markPending(user.id);
      } catch (cause) {
        setCompletingSignUp(false);
        setError(describeAuthError(cause));
        return;
      }
      const timezone = getDeviceTimeZone();
      const changes: ProfileChanges = {
        displayName: values.displayName,
        ...(timezone ? { timezone } : {}),
      };
      pendingChanges.current = changes;
      await saveProfile(changes);
    });

  const retryProfile = () =>
    run(async () => {
      if (pendingChanges.current) await saveProfile(pendingChanges.current);
    });

  return { submit, retryProfile, busy, error, profilePending };
}

/** Sign in (M11): A3 sign-in; the app opens Home once the session is authenticated. */
export function useSignIn() {
  const { auth } = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorDescription | null>(null);
  const inFlight = useRef(false);

  async function submit(values: SignInValues) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await auth.signIn(values);
    } catch (cause) {
      setError(describeAuthError(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return { submit, busy, error };
}

/**
 * W.2 "Continue with Google", on sign up and sign in: Google's chooser, then POST /auth/google. A
 * new account is created by the server with its Google name and the device time zone, so it only
 * needs marking onboarding-pending (M3.3) before the app opens, like a sign-up. Backing out of the
 * chooser changes nothing. `available` is false when the app has no Google client configured.
 */
export function useGoogleSignIn() {
  const { auth } = useApi();
  const { setCompletingSignUp } = useAuthFlow();
  const onboarding = useOnboardingStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorDescription | null>(null);
  const inFlight = useRef(false);

  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const google = await requestGoogleIdToken();
      if (google.kind === 'cancelled') return;
      if (google.kind !== 'token') {
        setError({
          message:
            google.kind === 'unavailable' ? GOOGLE_UNAVAILABLE_MESSAGE : GOOGLE_FAILED_MESSAGE,
        });
        return;
      }
      // The auth screens stay up until a new account is marked, so it opens on onboarding.
      setCompletingSignUp(true);
      try {
        const { user, created } = await auth.signInWithGoogle(google.idToken, getDeviceTimeZone());
        if (created) await onboarding.markPending(user.id);
      } catch (cause) {
        setError(describeAuthError(cause));
      } finally {
        setCompletingSignUp(false);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return { submit, busy, error, available: googleWebClientId() !== null };
}

/**
 * W.3 Forgot password: send a code to the email, then the code and a new password sign in (the
 * app opens Home on its own). `sentTo` is the email the last code went to.
 */
export function usePasswordReset() {
  const { auth } = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorDescription | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function run(task: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (cause) {
      setError(describeAuthError(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const sendCode = (email: string) =>
    run(async () => {
      await auth.requestPasswordReset(email);
      setSentTo(email);
    });

  const confirm = (values: ResetConfirmValues) =>
    run(async () => {
      if (!sentTo) return;
      await auth.resetPassword({ email: sentTo, code: values.code, password: values.password });
    });

  return { sendCode, confirm, sentTo, busy, error };
}
