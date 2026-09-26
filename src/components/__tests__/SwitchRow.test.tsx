import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet, Switch } from 'react-native';

import { MIN_TOUCH_TARGET } from '../../accessibility';
import { renderWithProviders } from '../../test-utils/render';
import { darkTheme, lightTheme, type Theme } from '../../theme';
import { SwitchRow } from '../SwitchRow';

const mockColorScheme = jest.fn<'light' | 'dark', []>(() => 'light');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme(),
}));

const themes = [
  ['light', lightTheme],
  ['dark', darkTheme],
] as const satisfies readonly (readonly ['light' | 'dark', Theme])[];

beforeEach(() => mockColorScheme.mockReturnValue('light'));

describe('SwitchRow', () => {
  it('is one switch, named by its label, with its state read aloud', () => {
    renderWithProviders(<SwitchRow label="Sound" value onValueChange={jest.fn()} />);
    const row = screen.getByRole('switch', { name: 'Sound' });
    expect(row).toBeChecked();
    expect(row.props.accessible).toBe(true);
  });

  it('reads the off state', () => {
    renderWithProviders(<SwitchRow label="Sound" value={false} onValueChange={jest.fn()} />);
    expect(screen.getByRole('switch', { name: 'Sound' })).not.toBeChecked();
  });

  it('toggles when the row is pressed', () => {
    const onValueChange = jest.fn();
    renderWithProviders(<SwitchRow label="Sound" value onValueChange={onValueChange} />);
    fireEvent.press(screen.getByRole('switch', { name: 'Sound' }));
    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  it('toggles when the switch itself is flipped', () => {
    const onValueChange = jest.fn();
    renderWithProviders(<SwitchRow label="Sound" value={false} onValueChange={onValueChange} />);
    fireEvent(screen.UNSAFE_getByType(Switch), 'valueChange', true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('shows and reads a description', () => {
    renderWithProviders(
      <SwitchRow
        label="Sound"
        description="Plays when a session ends."
        value
        onValueChange={jest.fn()}
      />,
    );
    expect(
      screen.getByText('Plays when a session ends.', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Sound' }).props.accessibilityHint).toBe(
      'Plays when a session ends.',
    );
  });

  it('cannot be toggled when disabled', () => {
    const onValueChange = jest.fn();
    renderWithProviders(<SwitchRow label="Sound" value onValueChange={onValueChange} disabled />);
    fireEvent.press(screen.getByRole('switch', { name: 'Sound' }));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: 'Sound' })).toBeDisabled();
  });

  it('keeps a 44 pt minimum height and never truncates its text', () => {
    renderWithProviders(
      <SwitchRow label="Reduce motion across the whole app" value onValueChange={jest.fn()} />,
    );
    expect(
      StyleSheet.flatten(screen.getByRole('switch').props.style).minHeight,
    ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(
      screen.getByText('Reduce motion across the whole app', { includeHiddenElements: true }).props
        .numberOfLines,
    ).toBeUndefined();
  });

  it.each(themes)('colors the switch with tokens in the %s theme', (scheme, theme) => {
    mockColorScheme.mockReturnValue(scheme);
    renderWithProviders(<SwitchRow label="Sound" value onValueChange={jest.fn()} />);
    expect(screen.UNSAFE_getByType(Switch).props).toMatchObject({
      trackColor: { true: theme.colors.forest.primary, false: theme.colors.border.default },
      thumbColor: theme.colors.surface.primary,
    });
  });
});
