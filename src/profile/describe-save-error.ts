import { NetworkError } from '../api';
import { NETWORK_MESSAGE } from '../auth/describe-error';

export const SAVE_GENERAL_MESSAGE = "We couldn't save your profile just now. Please try again.";

/**
 * Text for a failed profile save. A4 validation messages name internal fields
 * ("displayName cannot be empty."), and the form already checks the same rules, so no API
 * message is shown as it is.
 */
export function describeSaveError(error: unknown): string {
  return error instanceof NetworkError ? NETWORK_MESSAGE : SAVE_GENERAL_MESSAGE;
}
