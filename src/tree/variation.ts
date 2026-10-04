/**
 * Deterministic choices from a tree's variation seed (docs/03 §7). The same seed and key always
 * give the same answer, on every device and launch, so an archived tree stays recognizable.
 * Choices only pick among authored options; nothing here is random.
 */

/** FNV-1a hash of a string key, as an unsigned 32-bit integer. */
function hashKey(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A well-mixed unsigned 32-bit value for the seed and key (murmur3 finalizer). */
export function seeded(seed: number, key: string): number {
  let h = (seed ^ hashKey(key)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** One of the authored options, chosen by the seed for this key. */
export function pick<T>(seed: number, key: string, options: readonly T[]): T {
  if (options.length === 0) throw new Error(`No options to pick from for "${key}".`);
  return options[seeded(seed, key) % options.length]!;
}
