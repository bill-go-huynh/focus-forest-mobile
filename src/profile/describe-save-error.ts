import { HttpError, NetworkError } from '../api';
import { NETWORK_MESSAGE } from '../auth/describe-error';

export const SAVE_GENERAL_MESSAGE = "We couldn't save your profile just now. Please try again.";

/**
 * Text for a failed profile save. A4 validation messages name internal fields
 * ("displayName cannot be empty."), and the form already checks the same rules, so no API
 * message is shown as it is.
 */
export function describeSaveError(error: unknown): string {
  if (error instanceof NetworkError) return NETWORK_MESSAGE;
  if (error instanceof HttpError) {
    // A5.1 username refusals, by code.
    if (error.code === 'username_taken') return 'That username is taken. Try another one.';
    if (error.code === 'username_reserved') return 'That username is reserved. Try another one.';
    if (error.code === 'username_invalid') return 'Use 3 to 20 letters, numbers, or underscores.';
  }
  return SAVE_GENERAL_MESSAGE;
}
