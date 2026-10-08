import type { SpeciesList } from '../api';

/** "an Oak", "a Sakura": the species named in a sentence. */
export function withArticle(name: string): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}

/** The species' name as the server sends it, else its id (a species no longer listed). */
export function speciesName(list: SpeciesList, speciesId: string): string {
  return list.items.find((species) => species.id === speciesId)?.name ?? speciesId;
}

/**
 * Whether choosing is worth offering: the server says the month's choice is open, and there is
 * more than one species that can be chosen. Only the server's flags decide it.
 */
export function choiceOpen(list: SpeciesList): boolean {
  return !list.current.locked && list.items.filter((species) => species.selectable).length > 1;
}
