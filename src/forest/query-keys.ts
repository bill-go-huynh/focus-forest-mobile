import type { MonthRef } from '../api';

/** The signed-in user's forest and archived months; dropped with the cache on sign-out. */
export const forestQueryKey = ['me', 'forest'] as const;
export const treeDetailsQueryKey = ({ year, month }: MonthRef) =>
  ['me', 'trees', year, month] as const;
export const recapQueryKey = ({ year, month }: MonthRef) =>
  ['me', 'trees', year, month, 'recap'] as const;
