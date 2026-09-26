import { act, fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import { mockControlledTiming } from '../../test-utils/animation';
import { renderWithProviders, TEST_WINDOW } from '../../test-utils/render';
import { darkTheme, lightTheme, type Theme } from '../../theme';
import { ErrorState } from '../ErrorState';

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

let announceSpy: jest.SpyInstance;
let timing: ReturnType<typeof mockControlledTiming>;
beforeEach(() => {
  mockColorScheme.mockReturnValue('light');
  mockWindow.fontScale = 1;
  // The React Native jest preset already mocks this; clear calls from earlier tests.
  announceSpy = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation()
    .mockClear();
  timing = mockControlledTiming();
});
afterEach(() => jest.restoreAllMocks());

describe('ErrorState (docs/01 §9: plain language, no blame, a clear retry)', () => {
  it('uses a calm default message that takes the blame off the user', () => {
    renderWithProviders(<ErrorState />);
    expect(screen.getByText("We couldn't load this right now.")).toBeOnTheScreen();
  });

  it('shows a lantern illustration by default, hidden from screen readers', () => {
    renderWithProviders(<ErrorState />);
    expect(
      screen.getByTestId('illustration-lantern', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('illustration-lantern')).toBeNull();
  });

  it('accepts its own message', () => {
    renderWithProviders(<ErrorState message="Your history is taking a moment to load." />);
    expect(screen.getByText('Your history is taking a moment to load.')).toBeOnTheScreen();
  });

  it('refuses blaming or failure language', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderWithProviders(<ErrorState message="Loading failed." />)).toThrow(/calm/);
    expect(() =>
      renderWithProviders(<ErrorState message="Something went wrong, it's your fault." />),
    ).toThrow(/calm/);
  });

  describe('retry', () => {
    it('offers a clear retry when one is possible', () => {
      const onRetry = jest.fn();
      renderWithProviders(<ErrorState onRetry={onRetry} />);
      fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('can name the retry for its context', () => {
      renderWithProviders(<ErrorState onRetry={jest.fn()} retryLabel="Reload history" />);
      expect(screen.getByRole('button', { name: 'Reload history' })).toBeOnTheScreen();
    });

    it('shows no retry when retrying cannot help', () => {
      renderWithProviders(<ErrorState />);
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  describe('reassurance (docs/01 §9: focus data safety)', () => {
    it('can reassure the user that nothing was lost', () => {
      renderWithProviders(
        <ErrorState
          message="Your session hasn't synced yet."
          reassurance="Your session is saved on this device and will sync when you're back online."
        />,
      );
      expect(
        screen.getByText(
          "Your session is saved on this device and will sync when you're back online.",
        ),
      ).toBeOnTheScreen();
    });

    it('holds the reassurance to the same calm language rule', () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(() => renderWithProviders(<ErrorState reassurance="Sync failed." />)).toThrow(/calm/);
    });
  });

  describe('screen readers', () => {
    it('announces the message, and the reassurance, once when it appears', () => {
      const { rerender } = renderWithProviders(
        <ErrorState
          message="Your session hasn't synced yet."
          reassurance="It is saved on this device."
        />,
      );
      rerender(
        <ErrorState
          message="Your session hasn't synced yet."
          reassurance="It is saved on this device."
        />,
      );
      expect(announceSpy).toHaveBeenCalledTimes(1);
      expect(announceSpy).toHaveBeenCalledWith(
        "Your session hasn't synced yet. It is saved on this device.",
      );
    });

    it('announces again when the wording changes', () => {
      const { rerender } = renderWithProviders(<ErrorState />);
      rerender(<ErrorState message="Your history is taking a moment to load." />);
      expect(announceSpy).toHaveBeenCalledTimes(2);
    });

    it('marks the message as a polite live region', () => {
      renderWithProviders(<ErrorState />);
      expect(
        screen.getByText("We couldn't load this right now.").props.accessibilityLiveRegion,
      ).toBe('polite');
    });
  });

  describe.each(themes)('colors in the %s theme', (scheme, theme) => {
    beforeEach(() => mockColorScheme.mockReturnValue(scheme));

    it('never paints the message red', () => {
      renderWithProviders(<ErrorState reassurance="It is saved on this device." />);
      const message = styleOf(screen.getByText("We couldn't load this right now."));
      expect(message.color).toBe(theme.colors.text.primary);
      expect(message.color).not.toBe(theme.colors.danger);
      expect(styleOf(screen.getByText('It is saved on this device.')).color).toBe(
        theme.colors.text.secondary,
      );
    });
  });

  describe('motion (docs/04 §4: no shake, a calm fade-in)', () => {
    it('fades in with motion.base and never moves', () => {
      renderWithProviders(<ErrorState />);
      const content = screen.getByTestId('error-state');
      expect(styleOf(content).opacity).toBe(0);
      expect(styleOf(content).transform).toBeUndefined();
      expect(timing.spy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ toValue: 1, duration: lightTheme.motion.base }),
      );
      act(() => timing.finishAll());
      expect(styleOf(screen.getByTestId('error-state')).opacity).toBe(1);
    });

    it('appears at once under reduced motion', () => {
      renderWithProviders(<ErrorState />, { reducedMotion: true });
      expect(timing.spy).not.toHaveBeenCalled();
      expect(styleOf(screen.getByTestId('error-state')).opacity).toBe(1);
    });
  });

  describe('large text (docs/11: usable at 200%)', () => {
    it('never truncates the message or the reassurance', () => {
      renderWithProviders(<ErrorState reassurance="It is saved on this device." />);
      for (const text of ["We couldn't load this right now.", 'It is saved on this device.']) {
        expect(screen.getByText(text).props.numberOfLines).toBeUndefined();
      }
    });

    it('shrinks the illustration at 200%', () => {
      mockWindow.fontScale = 2;
      renderWithProviders(<ErrorState />);
      const art = screen.getByTestId('illustration-lantern', { includeHiddenElements: true });
      expect(styleOf(art).width).toBeLessThan(lightTheme.illustration.spot);
    });
  });
});
