import AsyncStorage from '@react-native-async-storage/async-storage';

import { createClientId } from '../ids/client-id';
import { ActiveTimerStore, type TimerStorageIssue } from './active-timer-store';

/**
 * The app's timer store: AsyncStorage (the timer holds no secrets), the device clock, and
 * expo-crypto ids. Issues are reported by code only, never with the stored value.
 */
export function createAppTimerStore(): ActiveTimerStore {
  return new ActiveTimerStore({
    storage: AsyncStorage,
    now: Date.now,
    createId: createClientId,
    report: reportTimerStorageIssue,
  });
}

function reportTimerStorageIssue(issue: TimerStorageIssue): void {
  console.warn(`[timer] active timer storage: ${issue.code}`);
}
