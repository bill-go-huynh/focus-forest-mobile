import type { Person, ReactionKind } from '../api';

/**
 * Words for Social (docs/02 Social, Words we use): quiet and positive. Nothing here compares a
 * person's numbers with the viewer's.
 */

/** The name to show: the display name, else the @username. */
export function personName(person: Pick<Person, 'displayName' | 'username'>): string {
  return person.displayName ?? (person.username ? `@${person.username}` : 'Someone');
}

/** "@linh · Friends", "@linh · Follows you", or "@linh". */
export function relationshipLine(person: Pick<Person, 'username' | 'relationship'>): string {
  const handle = person.username ? `@${person.username}` : null;
  const relation = person.relationship.friends
    ? 'Friends'
    : person.relationship.followedBy
      ? 'Follows you'
      : null;
  return [handle, relation].filter((part): part is string => part !== null).join(' · ');
}

export const REACTION_EMOJI: Record<ReactionKind, string> = {
  fire: '🔥',
  sprout: '🌱',
  clap: '👏',
  heart: '❤️',
  sparkles: '✨',
};

export const REACTION_NAME: Record<ReactionKind, string> = {
  fire: 'Fire',
  sprout: 'Sprout',
  clap: 'Clap',
  heart: 'Heart',
  sparkles: 'Sparkles',
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "October 2026". */
export function monthYear({ year, month }: { year: number; month: number }): string {
  return `${MONTHS[month - 1] ?? month} ${year}`;
}

/** The reaction target of a month's tree: `tree:YYYY-MM`. */
export function treeTarget({ year, month }: { year: number; month: number }): string {
  return `tree:${year}-${String(month).padStart(2, '0')}`;
}

/** Where a received reaction was left, from the server's target. */
export function receivedTargetLabel(target: string): string {
  if (target === 'forest') return 'On your forest';
  const tree = /^tree:(\d{4})-(\d{2})$/.exec(target);
  if (tree) return `On your ${monthYear({ year: Number(tree[1]), month: Number(tree[2]) })} tree`;
  if (target.startsWith('badge:')) return 'On one of your badges';
  return 'On your profile';
}
