import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import { mockControlledTiming } from '../../test-utils/animation';
import { renderWithProviders, TEST_SAFE_AREA_INSETS, TEST_WINDOW } from '../../test-utils/render';
import { darkTheme, lightTheme, type Theme } from '../../theme';
import { Modal } from '../Modal';
import { Sheet } from '../Sheet';

const mockColorScheme = jest.fn<'light' | 'dark', []>(() => 'light');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme(),
}));

const mockWindow = { ...TEST_WINDOW, scale: 3, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

const themes = [
  ['light', lightTheme],
  ['dark', darkTheme],
] as const satisfies readonly (readonly ['light' | 'dark', Theme])[];

const styleOf = (element: ReactTestInstance) => StyleSheet.flatten(element.props.style);

beforeEach(() => {
  mockColorScheme.mockReturnValue('light');
  mockWindow.fontScale = 1;
  mockControlledTiming();
});
afterEach(() => jest.restoreAllMocks());

describe('Sheet (docs/01 §8 → Modals and sheets)', () => {
  const renderSheet = (props: Partial<Parameters<typeof Sheet>[0]> = {}) =>
    renderWithProviders(
      <Sheet visible onRequestClose={jest.fn()} title="Pick a topic" {...props}>
        <Text>Deep Work</Text>
      </Sheet>,
    );

  it('shows its content', () => {
    renderSheet();
    expect(screen.getByText('Deep Work')).toBeOnTheScreen();
  });

  it('has a clearly labeled close action', () => {
    const onRequestClose = jest.fn();
    renderSheet({ onRequestClose });
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('can name the close action for its context', () => {
    renderSheet({ closeLabel: 'Done' });
    expect(screen.getByRole('button', { name: 'Done' })).toBeOnTheScreen();
  });

  it('puts the title before the close action and the content, for a logical reading order', () => {
    renderSheet();
    const order = screen.UNSAFE_root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        (node.props.accessibilityRole === 'header' ||
          node.props.accessibilityRole === 'button' ||
          node.props.children === 'Deep Work'),
    ).map((node) => node.props.accessibilityLabel ?? node.props.children);
    expect(order.indexOf('Pick a topic')).toBeLessThan(order.indexOf('Close'));
    expect(order.indexOf('Close')).toBeLessThan(order.indexOf('Deep Work'));
  });

  describe.each(themes)('in the %s theme', (scheme, theme) => {
    beforeEach(() => mockColorScheme.mockReturnValue(scheme));

    it('rounds only its top corners with radius.xl, and sits at the bottom', () => {
      renderSheet();
      const panel = styleOf(screen.getByTestId('overlay-panel'));
      expect(panel).toMatchObject({
        borderTopLeftRadius: theme.radius.xl,
        borderTopRightRadius: theme.radius.xl,
      });
      expect(panel.borderBottomLeftRadius).toBeUndefined();
      expect(styleOf(screen.getByTestId('overlay-container')).justifyContent).toBe('flex-end');
    });

    it('uses the headline type for its title', () => {
      renderSheet();
      expect(styleOf(screen.getByText('Pick a topic'))).toMatchObject({
        fontSize: theme.type.headline.fontSize,
        color: theme.colors.text.primary,
      });
    });
  });

  it('shows no grab handle: without drag-to-dismiss it would be a false affordance', () => {
    renderSheet();
    expect(screen.queryByTestId('sheet-handle', { includeHiddenElements: true })).toBeNull();
  });

  it('keeps its bottom content clear of the home indicator', () => {
    renderSheet();
    expect(styleOf(screen.getByTestId('overlay-panel')).paddingBottom).toBe(
      lightTheme.space[5] + TEST_SAFE_AREA_INSETS.bottom,
    );
  });

  it('never grows taller than the screen below the status bar', () => {
    renderSheet();
    const maxHeight = styleOf(screen.getByTestId('overlay-panel')).maxHeight as number;
    expect(maxHeight).toBeLessThanOrEqual(TEST_WINDOW.height - TEST_SAFE_AREA_INSETS.top);
    expect(maxHeight).toBeGreaterThan(0);
  });

  it('keeps the title and close action side by side at the default size', () => {
    renderSheet();
    expect(styleOf(screen.getByTestId('overlay-header')).flexDirection).toBe('row');
  });

  it('stacks the title above the close action at 200%, so neither is squeezed', () => {
    mockWindow.fontScale = 2;
    renderSheet();
    expect(styleOf(screen.getByTestId('overlay-header')).flexDirection).toBe('column');
  });
});

describe('Modal (docs/01 §8: rare, important interruptions)', () => {
  const renderModal = () =>
    renderWithProviders(
      <Modal
        visible
        onRequestClose={jest.fn()}
        title="End session early?"
        message="Your tree keeps the minutes you've focused so far."
      >
        <Text>Actions</Text>
      </Modal>,
    );

  it('shows its title, message, and actions', () => {
    renderModal();
    expect(screen.getByRole('header', { name: 'End session early?' })).toBeOnTheScreen();
    expect(
      screen.getByText("Your tree keeps the minutes you've focused so far."),
    ).toBeOnTheScreen();
    expect(screen.getByText('Actions')).toBeOnTheScreen();
  });

  it('is centered, with the screen gutter around it', () => {
    renderModal();
    expect(styleOf(screen.getByTestId('overlay-container'))).toMatchObject({
      justifyContent: 'center',
      paddingHorizontal: lightTheme.space[5],
    });
  });

  it.each(themes)('uses title and body type tokens in the %s theme', (scheme, theme) => {
    mockColorScheme.mockReturnValue(scheme);
    renderModal();
    expect(styleOf(screen.getByText('End session early?'))).toMatchObject({
      fontSize: theme.type.headline.fontSize,
      color: theme.colors.text.primary,
    });
    expect(
      styleOf(screen.getByText("Your tree keeps the minutes you've focused so far.")),
    ).toMatchObject({ fontSize: theme.type.body.fontSize, color: theme.colors.text.secondary });
  });

  it('never truncates its message', () => {
    renderModal();
    expect(
      screen.getByText("Your tree keeps the minutes you've focused so far.").props.numberOfLines,
    ).toBeUndefined();
  });
});
