import { useLocalSearchParams } from 'expo-router';

import type { MonthRef } from '../api';

/** The `[year]/[month]` of a forest route, or null when it is not a calendar month. */
export function useMonthParam(): MonthRef | null {
  const params = useLocalSearchParams<{ year: string; month: string }>();
  const year = Number(params.year);
  const month = Number(params.month);
  return Number.isInteger(year) &&
    year >= 2000 &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12
    ? { year, month }
    : null;
}
