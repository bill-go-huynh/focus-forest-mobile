import { randomUUID } from 'expo-crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A new client-generated id (sessions, topics) as a lowercase UUID, the form the API answers
 * with. Native generators may write uppercase (iOS), so the id is lowercased here once, and
 * every later comparison with a server id is exact.
 */
export function createClientId(generate: () => string = randomUUID): string {
  const generated: unknown = generate();
  const id = typeof generated === 'string' ? generated.toLowerCase() : '';
  if (!UUID.test(id)) throw new Error('The UUID generator returned something that is not a UUID.');
  return id;
}
