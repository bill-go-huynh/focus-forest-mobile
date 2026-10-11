import type { TabIconName } from '../components/icons';

/**
 * The tabs, in order (docs/05 §1). Focus is an action on Home, not a tab. Settings live under
 * Profile. Together, the community hub, joined in Phase 11 (M5.1), between Forest and Insights.
 */
export const TABS: readonly { name: TabIconName; title: string }[] = [
  { name: 'index', title: 'Home' },
  { name: 'forest', title: 'Forest' },
  { name: 'together', title: 'Together' },
  { name: 'insights', title: 'Insights' },
  { name: 'profile', title: 'Profile' },
];
