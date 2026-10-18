import { HttpError, NetworkError } from '../api';

/**
 * Turns an error from sign-up or sign-in into text for the form. Only messages the API is
 * known to send (A3, A4, and A5.3, written for users) are shown as they are; anything else becomes
 * a calm general message, so no internal detail ever reaches the screen.
 */
export interface AuthErrorDescription {
  message: string;
  /** Set when the message belongs to one field rather than the whole form. */
  field?: 'email';
}

const SAFE_API_MESSAGES = new Set([
  'Email or password is incorrect.',
  'This account is suspended.',
  'This account is banned.',
  'Enter a valid email address.',
  'Use at least 8 characters for your password.',
  'Use at most 128 characters for your password.',
  // W.3 Forgot password.
  'That code is not right, or it has expired. Ask for a new one.',
  'Enter the 6-digit code from the email.',
]);
const EMAIL_TAKEN = 'An account with this email already exists.';
/** W.2 Google sign-in's own refusals (POST /auth/google). */
const GOOGLE_API_MESSAGES = new Set([
  'This email already has a Focus Forest account. Sign in with your password.',
  'This email already belongs to another Focus Forest account.',
  'Google sign-in could not be confirmed.',
]);
export const GOOGLE_UNAVAILABLE_MESSAGE = "Google sign-in isn't available on this device.";
export const GOOGLE_FAILED_MESSAGE = "We couldn't sign you in with Google. Please try again.";

export const NETWORK_MESSAGE =
  "We couldn't reach Focus Forest. Check your connection and try again.";
export const GENERAL_MESSAGE = "We couldn't finish that just now. Please try again.";
/** A7.2: too many attempts in a short time; calm, and says what to do. */
export const RATE_LIMITED_MESSAGE =
  'Too many attempts for now. Please wait a few minutes and try again.';

export function describeAuthError(error: unknown): AuthErrorDescription {
  if (error instanceof NetworkError) return { message: NETWORK_MESSAGE };
  if (error instanceof HttpError && error.status === 429) return { message: RATE_LIMITED_MESSAGE };
  if (error instanceof HttpError && error.status < 500) {
    const known = error.messages.find(
      (message) =>
        SAFE_API_MESSAGES.has(message) ||
        GOOGLE_API_MESSAGES.has(message) ||
        message === EMAIL_TAKEN,
    );
    if (known === EMAIL_TAKEN) return { field: 'email', message: known };
    if (known) return { message: known };
  }
  return { message: GENERAL_MESSAGE };
}
