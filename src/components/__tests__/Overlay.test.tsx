import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRef, useState, type ReactElement } from 'react';
import { AccessibilityInfo, Modal as NativeModal, StyleSheet, Text, View } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import { mockControlledTiming } from '../../test-utils/animation';
import { createNodeMock, renderWithProviders } from '../../test-utils/render';
import { darkTheme, lightTheme, type Theme } from '../../theme';
import { Button } from '../Button';
import { Modal } from '../Modal';
import { Sheet } from '../Sheet';

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

interface OverlayUnderTest {
  visible: boolean;
  onRequestClose: () => void;
  title: string;
  dismissOnBackdropPress?: boolean;
  returnFocusRef?: React.RefObject<View | null>;
}

// The shared foundation, exercised through both public components.
const presentations: [string, (props: OverlayUnderTest) => ReactElement][] = [
  [
    'Sheet',
    (props) => (
      <Sheet {...props}>
        <Text>Sheet body</Text>
      </Sheet>
    ),
  ],
  [
    'Modal',
    (props) => (
      <Modal {...props}>
        <Button variant="secondary" label="Keep going" onPress={props.onRequestClose} />
      </Modal>
    ),
  ],
];

let focusSpy: jest.SpyInstance;
let timing: ReturnType<typeof mockControlledTiming>;
beforeEach(() => {
  mockColorScheme.mockReturnValue('light');
  // The React Native jest preset already mocks this; clear calls from earlier tests.
  focusSpy = jest
    .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
    .mockImplementation()
    .mockClear();
  timing = mockControlledTiming();
});
afterEach(() => jest.restoreAllMocks());

const focusedNodes = () =>
  focusSpy.mock.calls
    .filter(([, event]) => event === 'focus')
    .map(([node]) => (node as { props: Record<string, unknown> }).props);

describe.each(presentations)('%s (shared overlay foundation)', (_name, renderOverlay) => {
  const open = (props: Partial<OverlayUnderTest> = {}, options = {}) =>
    renderWithProviders(
      renderOverlay({ visible: true, onRequestClose: jest.fn(), title: 'Pick a topic', ...props }),
      { createNodeMock, ...options },
    );

  it('renders nothing while closed', () => {
    open({ visible: false });
    expect(screen.queryByText('Pick a topic')).toBeNull();
  });

  it('shows its title as a heading when open', () => {
    open();
    expect(screen.getByRole('header', { name: 'Pick a topic' })).toBeOnTheScreen();
  });

  it('marks its panel as modal and names it with the title', () => {
    open();
    const panel = screen.getByTestId('overlay-panel');
    expect(panel.props.accessibilityViewIsModal).toBe(true);
    expect(panel.props.accessibilityLabel).toBe('Pick a topic');
  });

  it('refuses an empty title, because the title names the overlay', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => open({ title: ' ' })).toThrow(/title/);
  });

  it('draws its own transition over a transparent native modal', () => {
    open();
    expect(screen.UNSAFE_getByType(NativeModal).props).toMatchObject({
      transparent: true,
      animationType: 'none',
    });
  });

  describe('closing', () => {
    it('asks to close on the Android back button', () => {
      const onRequestClose = jest.fn();
      open({ onRequestClose });
      act(() => screen.UNSAFE_getByType(NativeModal).props.onRequestClose());
      expect(onRequestClose).toHaveBeenCalledTimes(1);
    });

    it('asks to close on the screen-reader escape gesture', () => {
      const onRequestClose = jest.fn();
      open({ onRequestClose });
      fireEvent(screen.getByTestId('overlay-panel'), 'accessibilityEscape');
      expect(onRequestClose).toHaveBeenCalledTimes(1);
    });

    it('asks to close when the backdrop is tapped', () => {
      const onRequestClose = jest.fn();
      open({ onRequestClose });
      fireEvent.press(screen.getByTestId('overlay-backdrop', { includeHiddenElements: true }));
      expect(onRequestClose).toHaveBeenCalledTimes(1);
    });

    it('can ignore backdrop taps, for choices the user must make explicitly', () => {
      const onRequestClose = jest.fn();
      open({ onRequestClose, dismissOnBackdropPress: false });
      fireEvent.press(screen.getByTestId('overlay-backdrop', { includeHiddenElements: true }));
      expect(onRequestClose).not.toHaveBeenCalled();
    });

    it('hides the backdrop from screen readers, which use the explicit actions instead', () => {
      open();
      expect(screen.queryByTestId('overlay-backdrop')).toBeNull();
    });

    it('keeps its content during the exit transition, then removes it', () => {
      const { rerender } = open();
      act(() => timing.finishAll());

      rerender(renderOverlay({ visible: false, onRequestClose: jest.fn(), title: 'Pick a topic' }));
      expect(screen.getByText('Pick a topic')).toBeOnTheScreen();

      act(() => timing.finishAll());
      expect(screen.queryByText('Pick a topic')).toBeNull();
    });
  });

  it.each(themes)(
    'uses the overlay.scrim token for the backdrop in the %s theme',
    (scheme, theme) => {
      mockColorScheme.mockReturnValue(scheme);
      open();
      const backdrop = screen.getByTestId('overlay-backdrop', { includeHiddenElements: true });
      expect(styleOf(backdrop).backgroundColor).toBe(theme.colors.overlay.scrim);
    },
  );

  it.each(themes)('uses the elevated surface and radius.xl in the %s theme', (scheme, theme) => {
    mockColorScheme.mockReturnValue(scheme);
    open();
    const panel = styleOf(screen.getByTestId('overlay-panel'));
    expect(panel.backgroundColor).toBe(theme.colors.surface.elevated);
    expect(panel.borderTopLeftRadius ?? panel.borderRadius).toBe(theme.radius.xl);
    expect(panel).toMatchObject({ shadowRadius: theme.elevation[3].shadowRadius });
  });

  it('enters and leaves with the motion.base duration', () => {
    const { rerender } = open();
    expect(timing.spy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 1, duration: lightTheme.motion.base }),
    );
    act(() => timing.finishAll());
    rerender(renderOverlay({ visible: false, onRequestClose: jest.fn(), title: 'Pick a topic' }));
    expect(timing.spy).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 0, duration: lightTheme.motion.base }),
    );
  });

  describe('focus', () => {
    it('moves screen-reader focus to the title when it opens', () => {
      open();
      act(() => timing.finishAll());
      expect(focusedNodes()).toEqual([
        expect.objectContaining({ accessibilityRole: 'header', children: 'Pick a topic' }),
      ]);
    });

    function Launcher() {
      const openerRef = useRef<View>(null);
      const [visible, setVisible] = useState(false);
      return (
        <>
          <Button
            ref={openerRef}
            variant="secondary"
            label="Change topic"
            onPress={() => setVisible(true)}
          />
          {renderOverlay({
            visible,
            onRequestClose: () => setVisible(false),
            title: 'Pick a topic',
            returnFocusRef: openerRef,
          })}
        </>
      );
    }

    it('returns focus to the control that opened it, once it has closed', async () => {
      renderWithProviders(<Launcher />, { createNodeMock });
      fireEvent.press(screen.getByRole('button', { name: 'Change topic' }));
      act(() => timing.finishAll());
      focusSpy.mockClear();

      act(() => screen.UNSAFE_getByType(NativeModal).props.onRequestClose());
      expect(focusedNodes()).toEqual([]); // not yet: the overlay is still leaving
      act(() => timing.finishAll());

      await waitFor(() =>
        expect(focusedNodes()).toEqual([
          expect.objectContaining({ accessibilityLabel: 'Change topic' }),
        ]),
      );
    });

    it('does not move focus on close when no opener is given', async () => {
      const { rerender } = open();
      act(() => timing.finishAll());
      focusSpy.mockClear();
      rerender(renderOverlay({ visible: false, onRequestClose: jest.fn(), title: 'Pick a topic' }));
      act(() => timing.finishAll());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(focusedNodes()).toEqual([]);
    });
  });

  it('lets its content scroll, so large text never pushes actions out of reach', () => {
    open();
    expect(screen.getByTestId('overlay-scroll')).toBeOnTheScreen();
  });

  it('never truncates the title at large text sizes', () => {
    open({ title: 'Which topic would you like to focus on this afternoon?' });
    const title = screen.getByText('Which topic would you like to focus on this afternoon?');
    expect(title.props.numberOfLines).toBeUndefined();
    expect(title.props.allowFontScaling).not.toBe(false);
  });

  it('fades the backdrop in from transparent', () => {
    open();
    const backdrop = screen.getByTestId('overlay-backdrop', { includeHiddenElements: true });
    expect(styleOf(backdrop).opacity).toBe(0);
  });
});

describe('reduced motion (docs/04 §8: slides become fades)', () => {
  it('slides the sheet up normally', () => {
    renderWithProviders(
      <Sheet visible onRequestClose={jest.fn()} title="Pick a topic">
        <Text>Body</Text>
      </Sheet>,
    );
    const transform = styleOf(screen.getByTestId('overlay-panel')).transform as object[];
    expect(transform).toEqual(
      expect.arrayContaining([expect.objectContaining({ translateY: expect.any(Number) })]),
    );
  });

  it.each([
    ['Sheet', Sheet],
    ['Modal', Modal],
  ] as const)('%s only fades, with no movement, under reduced motion', (_name, Component) => {
    renderWithProviders(
      <Component visible onRequestClose={jest.fn()} title="Pick a topic">
        <Text>Body</Text>
      </Component>,
      { reducedMotion: true },
    );
    const panel = styleOf(screen.getByTestId('overlay-panel'));
    expect(panel.transform).toBeUndefined();
    expect(panel.opacity).toBe(0);
    act(() => timing.finishAll());
    expect(styleOf(screen.getByTestId('overlay-panel')).opacity).toBe(1);
  });

  it('never moves the modal, even with motion on', () => {
    renderWithProviders(
      <Modal visible onRequestClose={jest.fn()} title="End session early?">
        <Text>Body</Text>
      </Modal>,
    );
    expect(styleOf(screen.getByTestId('overlay-panel')).transform).toBeUndefined();
  });
});
