import { fireEvent, screen } from '@testing-library/react-native';

import { makePreferences } from '../../test-utils/preferences';
import { renderWithProviders } from '../../test-utils/render';
import { NOTIFICATION_CATEGORIES } from '../notification-categories';
import { NotificationSettings } from '../NotificationSettings';

describe('NotificationSettings (the structure later phases fill)', () => {
  it('renders nothing when no category is available', () => {
    renderWithProviders(
      <NotificationSettings categories={[]} preferences={makePreferences()} onChange={jest.fn()} />,
    );
    expect(screen.queryByRole('header', { name: 'Notifications' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('shows one switch per available category, with its saved state', () => {
    const preferences = makePreferences();
    preferences.notifications.dailyGoalReminder = { enabled: true, time: null };
    renderWithProviders(
      <NotificationSettings
        categories={['dailyGoalReminder', 'streakReminder']}
        preferences={preferences}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole('header', { name: 'Notifications' })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Daily goal reminder' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Streak reminder' })).not.toBeChecked();
    expect(screen.getAllByRole('switch')).toHaveLength(2);
  });

  it('reports a change for that category only', () => {
    const onChange = jest.fn();
    renderWithProviders(
      <NotificationSettings
        categories={['badgeUnlocked']}
        preferences={makePreferences()}
        onChange={onChange}
      />,
    );
    fireEvent.press(screen.getByRole('switch', { name: 'Badge unlocked' }));
    expect(onChange).toHaveBeenCalledWith('badgeUnlocked', true);
  });

  it('has a plain label for every A5 category', () => {
    renderWithProviders(
      <NotificationSettings
        categories={NOTIFICATION_CATEGORIES}
        preferences={makePreferences()}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getAllByRole('switch').map((s) => s.props.accessibilityLabel)).toEqual([
      'Daily goal reminder',
      'Scheduled focus reminder',
      'Streak reminder',
      'Event starts',
      'Event ending soon',
      'Friend invites',
      'Focus room invites',
      'Challenge updates',
      'Badge unlocked',
      'Monthly recap ready',
    ]);
  });
});
