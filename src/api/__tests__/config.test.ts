import { ConfigurationError } from '../errors';
import { parseApiBaseUrl, readApiBaseUrl } from '../config';

describe('API base URL (set per environment with EXPO_PUBLIC_API_URL)', () => {
  it('accepts an https URL and drops a trailing slash', () => {
    expect(parseApiBaseUrl('https://api.focusforest.app/', { dev: false })).toBe(
      'https://api.focusforest.app',
    );
  });

  it('keeps a path prefix', () => {
    expect(parseApiBaseUrl('https://example.com/api/', { dev: false })).toBe(
      'https://example.com/api',
    );
  });

  it('allows plain http only in development, for a local API', () => {
    expect(parseApiBaseUrl('http://localhost:3000', { dev: true })).toBe('http://localhost:3000');
    expect(() => parseApiBaseUrl('http://localhost:3000', { dev: false })).toThrow(
      ConfigurationError,
    );
  });

  it.each([undefined, '', '   '])('explains what to set when the URL is missing (%p)', (raw) => {
    expect(() => parseApiBaseUrl(raw, { dev: true })).toThrow(/EXPO_PUBLIC_API_URL/);
  });

  it.each(['not a url', 'ftp://example.com', 'file:///etc/passwd'])('rejects %p', (raw) => {
    expect(() => parseApiBaseUrl(raw, { dev: true })).toThrow(ConfigurationError);
  });

  it('reads EXPO_PUBLIC_API_URL from the environment', () => {
    const previous = process.env.EXPO_PUBLIC_API_URL;
    process.env.EXPO_PUBLIC_API_URL = 'https://staging.example.com';
    try {
      expect(readApiBaseUrl()).toBe('https://staging.example.com');
    } finally {
      process.env.EXPO_PUBLIC_API_URL = previous;
    }
  });
});
