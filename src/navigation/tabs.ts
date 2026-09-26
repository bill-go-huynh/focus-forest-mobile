import type { TabIconName } from '../components/icons';

/**
 * The Phase 1 tabs, in order (docs/05 §1). Focus is an action on Home, not a tab.
 * Settings live under Profile. The Together tab joins in Phase 11, between Forest and
 * Insights.
 */
export const TABS: readonly { name: TabIconName; title: string }[] = [
  { name: 'index', title: 'Home' },
  { name: 'forest', title: 'Forest' },
  { name: 'insights', title: 'Insights' },
  { name: 'profile', title: 'Profile' },
];
