import {
  ConfigurationError,
  HttpError,
  InvalidResponseError,
  NetworkError,
  UnauthenticatedError,
} from '../../api';
import { describeAuthError } from '../describe-error';

const nest = (message: string | string[]) => ({ statusCode: 0, message, error: 'Error' });
const GENERIC = "We couldn't finish that just now. Please try again.";

describe('describeAuthError (clear, and never exposes anything sensitive)', () => {
  it('explains a lost connection', () => {
    expect(describeAuthError(new NetworkError())).toEqual({
      message: "We couldn't reach Focus Forest. Check your connection and try again.",
    });
  });

  it.each([
    [401, 'Email or password is incorrect.'],
    [403, 'This account is suspended.'],
    [400, 'Enter a valid email address.'],
    [400, 'Use at least 8 characters for your password.'],
  ])('shows the API message it knows is safe (%i: %s)', (status, message) => {
    expect(describeAuthError(new HttpError(status, nest(message)))).toEqual({ message });
  });

  it('puts an already-registered email on the email field', () => {
    expect(
      describeAuthError(new HttpError(409, nest('An account with this email already exists.'))),
    ).toEqual({ field: 'email', message: 'An account with this email already exists.' });
  });

  it('never trusts the message of a server error, even one it knows', () => {
    expect(describeAuthError(new HttpError(503, nest('This account is suspended.')))).toEqual({
      message: GENERIC,
    });
  });

  it.each([
    ['an unknown API message', new HttpError(400, nest('property role should not exist'))],
    ['a server error', new HttpError(500, nest('Internal server error: db host 10.0.0.3'))],
    ['an unexpected response', new InvalidResponseError()],
    ['a missing configuration', new ConfigurationError('Set EXPO_PUBLIC_API_URL.')],
    ['an ended session', new UnauthenticatedError()],
    ['a programming error', new TypeError("Cannot read properties of undefined (reading 'token')")],
    ['something that is not an error', 'boom'],
  ])('falls back to a calm general message for %s', (_case, error) => {
    expect(describeAuthError(error)).toEqual({ message: GENERIC });
  });
});
