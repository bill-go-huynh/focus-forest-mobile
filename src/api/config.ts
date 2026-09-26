import { ConfigurationError } from './errors';

/**
 * The API base URL comes from EXPO_PUBLIC_API_URL, set per environment (a local `.env`,
 * or the build profile's environment). It is public configuration, not a secret.
 * Release builds require https; plain http is allowed only in development, for a local API.
 */
export function parseApiBaseUrl(raw: string | undefined, { dev }: { dev: boolean }): string {
  const value = raw?.trim();
  if (!value) {
    throw new ConfigurationError('Set EXPO_PUBLIC_API_URL to the API base URL (see .env.example).');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigurationError('EXPO_PUBLIC_API_URL is not a valid URL.');
  }
  if (url.protocol !== 'https:' && !(dev && url.protocol === 'http:')) {
    throw new ConfigurationError(
      dev
        ? 'EXPO_PUBLIC_API_URL must use http or https.'
        : 'EXPO_PUBLIC_API_URL must use https outside development.',
    );
  }
  return value.replace(/\/+$/, '');
}

/** Reads the base URL for this build. Expo inlines EXPO_PUBLIC_* values at build time. */
export function readApiBaseUrl(): string {
  return parseApiBaseUrl(process.env.EXPO_PUBLIC_API_URL, { dev: __DEV__ });
}
