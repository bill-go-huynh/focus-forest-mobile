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
import { describeAuthError, type AuthErrorDescription } from './describe-error';
import { getDeviceTimeZone } from './device-time-zone';
import type { SignInValues, SignUpValues } from './validation';

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
