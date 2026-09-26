import type { ZodType } from 'zod';

import { ConfigurationError, HttpError, InvalidResponseError, NetworkError } from './errors';

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Send the access token (default true). Public endpoints such as sign-in pass false. */
  auth?: boolean;
  /** Validates the response body against the contract. */
  schema?: ZodType<T>;
}

export interface HttpOptions {
  baseUrl: string | (() => string);
  fetch: typeof globalThis.fetch;
  timeoutMs: number;
}

/**
 * One HTTP round trip: JSON in and out, a timeout, and errors mapped to ApiError kinds.
 * It knows nothing about sessions and never logs.
 */
export function createHttp({ baseUrl, fetch, timeoutMs }: HttpOptions) {
  const resolveBase = () => (typeof baseUrl === 'function' ? baseUrl() : baseUrl);

  return async function send<T>(
    path: string,
    { method = 'GET', body, schema }: RequestOptions<T>,
    accessToken: string | null,
  ): Promise<T> {
    let base: string;
    try {
      base = resolveBase();
    } catch (error) {
      throw error instanceof ConfigurationError
        ? error
        : new ConfigurationError('The API base URL is not configured.');
    }

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await Promise.race([
        fetch(`${base}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        }),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new NetworkError('The server took too long to answer.')),
          );
        }),
      ]);
    } catch (error) {
      throw error instanceof NetworkError ? error : new NetworkError();
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text().catch(() => '');
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }

    if (!response.ok) throw new HttpError(response.status, data);
    if (!schema) return data as T;
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new InvalidResponseError();
    return parsed.data;
  };
}

export type Send = ReturnType<typeof createHttp>;
