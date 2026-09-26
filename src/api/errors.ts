/**
 * Errors from the API layer. `kind` lets callers tell them apart without instanceof:
 * - network: the server could not be reached (offline, timeout). The session is kept.
 * - unauthenticated: the session has ended; the app returns to signed out.
 * - http: the server answered with an error status; `messages` holds its user-facing text.
 * - invalid-response: the server answered with something that does not match the contract.
 * - configuration: the app is not set up to reach an API (EXPO_PUBLIC_API_URL).
 *
 * No error ever carries a token, a password, or request headers.
 */
export type ApiErrorKind =
  'network' | 'unauthenticated' | 'http' | 'invalid-response' | 'configuration';

export abstract class ApiError extends Error {
  abstract readonly kind: ApiErrorKind;
}

export class NetworkError extends ApiError {
  readonly kind = 'network';
  constructor(message = 'The server could not be reached.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class UnauthenticatedError extends ApiError {
  readonly kind = 'unauthenticated';
  constructor(message = 'Sign in to continue.') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

/** Reads the message(s) out of a Nest error body: `{ statusCode, message, error }`. */
function messagesFrom(body: unknown): string[] {
  if (typeof body !== 'object' || body === null || !('message' in body)) return [];
  const { message } = body as { message: unknown };
  if (typeof message === 'string') return [message];
  if (Array.isArray(message)) return message.filter((m): m is string => typeof m === 'string');
  return [];
}

export class HttpError extends ApiError {
  readonly kind = 'http';
  readonly messages: string[];
  constructor(
    readonly status: number,
    body: unknown,
  ) {
    const messages = messagesFrom(body);
    super(messages[0] ?? `The server answered with status ${status}.`);
    this.name = 'HttpError';
    this.messages = messages;
  }
}

export class InvalidResponseError extends ApiError {
  readonly kind = 'invalid-response';
  constructor(message = 'The server sent an unexpected response.') {
    super(message);
    this.name = 'InvalidResponseError';
  }
}

export class ConfigurationError extends ApiError {
  readonly kind = 'configuration';
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
