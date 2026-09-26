import { fireEvent, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { Animated, StyleSheet, Text, type View } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import { MIN_TOUCH_TARGET } from '../../accessibility';
import { createNodeMock, renderWithProviders } from '../../test-utils/render';
import { darkTheme, lightTheme, type Theme } from '../../theme';
import { Button, DestructiveButton, IconButton, type DestructiveButtonProps } from '../Button';

const mockColorScheme = jest.fn<'light' | 'dark', []>(() => 'light');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme(),
}));

const themes = [
  ['light', lightTheme],
  ['dark', darkTheme],
] as const satisfies readonly (readonly ['light' | 'dark', Theme])[];

const styleOf = (element: ReactTestInstance) => StyleSheet.flatten(element.props.style);
const labelOf = (name: string) => screen.getByText(name);

beforeEach(() => mockColorScheme.mockReturnValue('light'));
afterEach(() => jest.restoreAllMocks());

describe('Button (primary, secondary, tertiary)', () => {
  it('is announced as a button with its label as the accessible name', () => {
    renderWithProviders(<Button variant="primary" label="Start Focus" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Start Focus' })).toBeOnTheScreen();
  });

  it('calls onPress once when pressed', () => {
    const onPress = jest.fn();
    renderWithProviders(<Button variant="secondary" label="Continue" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  describe('when disabled', () => {
    it('cannot be pressed and says it is disabled', () => {
      const onPress = jest.fn();
      renderWithProviders(<Button variant="primary" label="Save" onPress={onPress} disabled />);
      const button = screen.getByRole('button', { name: 'Save' });

      fireEvent.press(button);

      expect(onPress).not.toHaveBeenCalled();
      expect(button).toBeDisabled();
      expect(styleOf(button).opacity).toBe(lightTheme.opacity.disabled);
    });

    it('explains why, when a reason is given', () => {
      renderWithProviders(
        <Button
          variant="primary"
          label="Save"
          onPress={jest.fn()}
          disabled
          disabledReason="Enter a name first."
        />,
      );
      expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityHint).toBe(
        'Enter a name first.',
      );
    });
  });

  describe.each(themes)('colors in the %s theme', (scheme, theme) => {
    beforeEach(() => mockColorScheme.mockReturnValue(scheme));

    it.each([
      ['primary', theme.colors.accent.primary, theme.colors.text.inverse],
      ['secondary', theme.colors.surface.sunken, theme.colors.text.primary],
    ] as const)('%s uses its documented fill and label color', (variant, fill, label) => {
      renderWithProviders(<Button variant={variant} label="Go" onPress={jest.fn()} />);
      expect(styleOf(screen.getByRole('button', { name: 'Go' })).backgroundColor).toBe(fill);
      expect(styleOf(labelOf('Go')).color).toBe(label);
    });

    it('tertiary has no fill and an accent label', () => {
      renderWithProviders(<Button variant="tertiary" label="Skip" onPress={jest.fn()} />);
      expect(styleOf(screen.getByRole('button', { name: 'Skip' })).backgroundColor).toBeUndefined();
      expect(styleOf(labelOf('Skip')).color).toBe(theme.colors.text.accent);
    });

    it('primary shifts tone while pressed', () => {
      renderWithProviders(<Button variant="primary" label="Go" onPress={jest.fn()} />);
      const button = screen.getByRole('button', { name: 'Go' });
      fireEvent(button, 'pressIn');
      expect(styleOf(screen.getByRole('button', { name: 'Go' })).backgroundColor).toBe(
        theme.colors.accent.primaryPressed,
      );
    });
  });

  it('primary is a pill with the documented minimum height', () => {
    renderWithProviders(<Button variant="primary" label="Start Focus" onPress={jest.fn()} />);
    const style = styleOf(screen.getByRole('button', { name: 'Start Focus' }));
    expect(style.borderRadius).toBe(lightTheme.radius.full);
    expect(style.minHeight).toBe(lightTheme.control.minHeight);
  });

  it.each(['primary', 'secondary', 'tertiary'] as const)(
    '%s keeps a hit area of at least 44×44',
    (variant) => {
      renderWithProviders(<Button variant={variant} label="OK" onPress={jest.fn()} />);
      const style = styleOf(screen.getByRole('button', { name: 'OK' }));
      expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      expect(style.minWidth).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    },
  );

  describe('large text (docs/11: usable at 200%)', () => {
    it('grows with its label instead of using a fixed height, and never truncates it', () => {
      renderWithProviders(
        <Button variant="primary" label="Start your first session" onPress={jest.fn()} />,
      );
      const style = styleOf(screen.getByRole('button', { name: 'Start your first session' }));
      const label = labelOf('Start your first session');

      expect(style.height).toBeUndefined();
      expect(label.props.numberOfLines).toBeUndefined();
      expect(label.props.allowFontScaling).not.toBe(false);
      expect(styleOf(label)).toMatchObject({
        fontSize: lightTheme.type.label.fontSize,
        lineHeight: lightTheme.type.label.lineHeight,
        textAlign: 'center',
      });
    });
  });

  it('refuses an empty label, because the label is the accessible name', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      renderWithProviders(<Button variant="primary" label="  " onPress={jest.fn()} />),
    ).toThrow(/label/);
  });

  describe('press motion (docs/04: slight scale, motion.fast)', () => {
    it('scales slightly with the fast motion token', () => {
      const timing = jest.spyOn(Animated, 'timing');
      renderWithProviders(<Button variant="primary" label="Go" onPress={jest.fn()} />);

      fireEvent(screen.getByRole('button', { name: 'Go' }), 'pressIn');

      expect(timing).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          toValue: lightTheme.interaction.pressedScale,
          duration: lightTheme.motion.fast,
        }),
      );
    });

    it('keeps only the tonal shift when motion is reduced', () => {
      const timing = jest.spyOn(Animated, 'timing');
      renderWithProviders(<Button variant="primary" label="Go" onPress={jest.fn()} />, {
        reducedMotion: true,
      });

      fireEvent(screen.getByRole('button', { name: 'Go' }), 'pressIn');

      expect(timing).not.toHaveBeenCalled();
      expect(styleOf(screen.getByRole('button', { name: 'Go' })).backgroundColor).toBe(
        lightTheme.colors.accent.primaryPressed,
      );
    });
  });
});

describe('IconButton', () => {
  const icon = ({ color, size }: { color: string; size: number }) => (
    <Text>{`icon ${color} ${size}`}</Text>
  );

  it('is a labeled button', () => {
    const onPress = jest.fn();
    renderWithProviders(<IconButton accessibilityLabel="Close" icon={icon} onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('requires an accessibility label', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    // @ts-expect-error: accessibilityLabel is required
    expect(() => renderWithProviders(<IconButton icon={icon} onPress={jest.fn()} />)).toThrow(
      /accessibilityLabel/,
    );
  });

  it('is circular with a hit area of at least 44×44', () => {
    renderWithProviders(<IconButton accessibilityLabel="Close" icon={icon} onPress={jest.fn()} />);
    const style = styleOf(screen.getByRole('button', { name: 'Close' }));
    expect(style.minWidth).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(style.borderRadius).toBe(lightTheme.radius.full);
  });

  it.each(themes)('draws the icon with theme tokens in the %s theme', (scheme, theme) => {
    mockColorScheme.mockReturnValue(scheme);
    renderWithProviders(<IconButton accessibilityLabel="Close" icon={icon} onPress={jest.fn()} />);
    expect(
      screen.getByText(`icon ${theme.colors.text.primary} ${theme.icon.md}`, {
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen();
  });

  it('hides the icon itself from screen readers, so only the label is read', () => {
    renderWithProviders(<IconButton accessibilityLabel="Close" icon={icon} onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Close' }).props.accessible).toBe(true);
    expect(screen.queryByText(/^icon/, { includeHiddenElements: false })).toBeNull();
  });

  it('cannot be pressed when disabled', () => {
    const onPress = jest.fn();
    renderWithProviders(
      <IconButton accessibilityLabel="Close" icon={icon} onPress={onPress} disabled />,
    );
    const button = screen.getByRole('button', { name: 'Close' });
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });
});

describe('DestructiveButton', () => {
  it('only requests confirmation: it never runs the destructive action itself', () => {
    const onRequestConfirm = jest.fn();
    renderWithProviders(
      <DestructiveButton label="Delete account" onRequestConfirm={onRequestConfirm} />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));

    expect(onRequestConfirm).toHaveBeenCalledTimes(1);
  });

  it('has no onPress prop in its type', () => {
    const props: DestructiveButtonProps = {
      label: 'Delete',
      onRequestConfirm: jest.fn(),
      // @ts-expect-error: destructive actions go through a confirmation, not onPress
      onPress: jest.fn(),
    };
    expect(props.label).toBe('Delete');
  });

  it('ignores an onPress passed around the types, so the confirmation step cannot be skipped', () => {
    const onRequestConfirm = jest.fn();
    const sneakedAction = jest.fn();
    const Unchecked = DestructiveButton as (
      props: DestructiveButtonProps & { onPress: () => void },
    ) => ReturnType<typeof DestructiveButton>;
    renderWithProviders(
      <Unchecked label="Delete" onRequestConfirm={onRequestConfirm} onPress={sneakedAction} />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Delete' }));

    expect(sneakedAction).not.toHaveBeenCalled();
    expect(onRequestConfirm).toHaveBeenCalledTimes(1);
  });

  it('tells screen reader users that it asks for confirmation', () => {
    renderWithProviders(<DestructiveButton label="Delete" onRequestConfirm={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Delete' }).props.accessibilityHint).toMatch(
      /confirm/i,
    );
  });

  it.each(themes)('uses danger text on a tonal fill in the %s theme', (scheme, theme) => {
    mockColorScheme.mockReturnValue(scheme);
    renderWithProviders(<DestructiveButton label="Delete" onRequestConfirm={jest.fn()} />);
    expect(styleOf(screen.getByRole('button', { name: 'Delete' })).backgroundColor).toBe(
      theme.colors.surface.sunken,
    );
    expect(styleOf(labelOf('Delete')).color).toBe(theme.colors.danger);
  });

  it('cannot be pressed when disabled', () => {
    const onRequestConfirm = jest.fn();
    renderWithProviders(
      <DestructiveButton label="Delete" onRequestConfirm={onRequestConfirm} disabled />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    expect(onRequestConfirm).not.toHaveBeenCalled();
  });
});

describe('refs (so an overlay can return focus to the control that opened it)', () => {
  const pressableOf = (ref: { current: unknown }) =>
    (ref.current as { props: Record<string, unknown> } | null)?.props;

  it.each([
    [
      'Button',
      (ref: React.RefObject<View | null>) => (
        <Button ref={ref} variant="primary" label="Open" onPress={jest.fn()} />
      ),
    ],
    [
      'IconButton',
      (ref: React.RefObject<View | null>) => (
        <IconButton ref={ref} accessibilityLabel="Open" icon={() => null} onPress={jest.fn()} />
      ),
    ],
    [
      'DestructiveButton',
      (ref: React.RefObject<View | null>) => (
        <DestructiveButton ref={ref} label="Open" onRequestConfirm={jest.fn()} />
      ),
    ],
  ])('%s forwards its ref to the pressable itself', (_name, renderButton) => {
    const ref = createRef<View>();
    renderWithProviders(renderButton(ref), { createNodeMock });
    expect(pressableOf(ref)).toMatchObject({
      accessibilityRole: 'button',
      accessibilityLabel: 'Open',
    });
  });
});
