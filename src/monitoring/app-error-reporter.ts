import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { sendClientErrors, type ApiClient } from '../api';
import { ErrorReporter } from './error-reporter';

/** The app's error reporter, sending through the API client without the session. */
export function createAppErrorReporter(client: ApiClient): ErrorReporter {
  return new ErrorReporter({
    send: (reports) => sendClientErrors(client, reports),
    platform: Platform.OS === 'android' ? 'android' : 'ios',
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
    now: () => Date.now(),
  });
}
