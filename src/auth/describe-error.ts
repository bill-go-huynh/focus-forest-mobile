import { HttpError, NetworkError } from '../api';

/**
 * Turns an error from sign-up or sign-in into text for the form. Only messages the API is
 * known to send (A3 and A4, written for users) are shown as they are; anything else becomes
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
  'Enter a valid email address.',
  'Use at least 8 characters for your password.',
  'Use at most 128 characters for your password.',
]);
const EMAIL_TAKEN = 'An account with this email already exists.';

export const NETWORK_MESSAGE =
  "We couldn't reach Focus Forest. Check your connection and try again.";
export const GENERAL_MESSAGE = "We couldn't finish that just now. Please try again.";

export function describeAuthError(error: unknown): AuthErrorDescription {
  if (error instanceof NetworkError) return { message: NETWORK_MESSAGE };
  if (error instanceof HttpError && error.status < 500) {
    const known = error.messages.find(
      (message) => SAFE_API_MESSAGES.has(message) || message === EMAIL_TAKEN,
    );
    if (known === EMAIL_TAKEN) return { field: 'email', message: known };
    if (known) return { message: known };
  }
  return { message: GENERAL_MESSAGE };
}
