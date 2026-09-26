import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRef, useState } from 'react';
import { AccessibilityInfo, Modal as NativeModal, StyleSheet, View } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import { mockControlledTiming } from '../../test-utils/animation';
import { createNodeMock, renderWithProviders } from '../../test-utils/render';
import { darkTheme, lightTheme, type Theme } from '../../theme';
import { DestructiveButton } from '../Button';
import { Confirmation, type ConfirmationProps } from '../Confirmation';

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

let timing: ReturnType<typeof mockControlledTiming>;
beforeEach(() => {
  mockColorScheme.mockReturnValue('light');
  timing = mockControlledTiming();
});
afterEach(() => jest.restoreAllMocks());

const baseProps: ConfirmationProps = {
  visible: true,
  title: 'Archive this topic?',
  message: 'Past sessions keep their topic.',
  confirmLabel: 'Archive',
  onConfirm: jest.fn(),
  onCancel: jest.fn(),
};

describe('Confirmation', () => {
  it('shows the question, the consequence, and both choices as buttons', () => {
    renderWithProviders(<Confirmation {...baseProps} />);
    expect(screen.getByRole('header', { name: 'Archive this topic?' })).toBeOnTheScreen();
    expect(screen.getByText('Past sessions keep their topic.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeOnTheScreen();
  });

  it('runs onConfirm only when confirmed', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    renderWithProviders(<Confirmation {...baseProps} onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.press(screen.getByRole('button', { name: 'Archive' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it.each([
    ['the cancel button', () => fireEvent.press(screen.getByRole('button', { name: 'Keep it' }))],
    [
      'the back button',
      () => act(() => screen.UNSAFE_getByType(NativeModal).props.onRequestClose()),
    ],
    [
      'the backdrop',
      () =>
        fireEvent.press(screen.getByTestId('overlay-backdrop', { includeHiddenElements: true })),
    ],
  ])('treats %s as cancel, never as confirm', (_way, dismiss) => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    renderWithProviders(
      <Confirmation
        {...baseProps}
        cancelLabel="Keep it"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    dismiss();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('is a sheet by default (docs/01: sheets for confirmations)', () => {
    renderWithProviders(<Confirmation {...baseProps} />);
    expect(styleOf(screen.getByTestId('overlay-container')).justifyContent).toBe('flex-end');
  });

  it('can be a centered modal for rare, important interruptions', () => {
    renderWithProviders(<Confirmation {...baseProps} presentation="modal" />);
    expect(styleOf(screen.getByTestId('overlay-container')).justifyContent).toBe('center');
  });

  it('shows no separate close button: cancel is the way out', () => {
    renderWithProviders(<Confirmation {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  describe.each(themes)('confirm button in the %s theme', (scheme, theme) => {
    beforeEach(() => mockColorScheme.mockReturnValue(scheme));

    it('is a primary button for a normal confirmation', () => {
      renderWithProviders(<Confirmation {...baseProps} />);
      expect(styleOf(screen.getByRole('button', { name: 'Archive' })).backgroundColor).toBe(
        theme.colors.accent.primary,
      );
    });

    it('uses danger text on a tonal fill when destructive', () => {
      renderWithProviders(<Confirmation {...baseProps} confirmLabel="Delete" destructive />);
      expect(styleOf(screen.getByRole('button', { name: 'Delete' })).backgroundColor).toBe(
        theme.colors.surface.sunken,
      );
      expect(styleOf(screen.getByText('Delete')).color).toBe(theme.colors.danger);
    });
  });

  it('keeps a destructive confirm without the "asks you to confirm" hint: this is the confirmation', () => {
    renderWithProviders(<Confirmation {...baseProps} confirmLabel="Delete" destructive />);
    expect(screen.getByRole('button', { name: 'Delete' }).props.accessibilityHint).toBeUndefined();
  });

  it('refuses empty labels', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderWithProviders(<Confirmation {...baseProps} confirmLabel="" />)).toThrow(
      /confirmLabel/,
    );
  });
});

describe('DestructiveButton → Confirmation (the M3 confirmation flow)', () => {
  function DeleteFlow({ action }: { action: () => void }) {
    const buttonRef = useRef<View>(null);
    const [confirming, setConfirming] = useState(false);
    return (
      <>
        <DestructiveButton
          ref={buttonRef}
          label="Delete item"
          onRequestConfirm={() => setConfirming(true)}
        />
        <Confirmation
          visible={confirming}
          title="Delete this item?"
          confirmLabel="Delete"
          destructive
          returnFocusRef={buttonRef}
          onConfirm={() => {
            setConfirming(false);
            action();
          }}
          onCancel={() => setConfirming(false)}
        />
      </>
    );
  }

  it('asks first, and runs the action only after the user confirms', () => {
    const action = jest.fn();
    renderWithProviders(<DeleteFlow action={action} />);

    fireEvent.press(screen.getByRole('button', { name: 'Delete item' }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole('header', { name: 'Delete this item?' })).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('never runs the action when the user cancels', () => {
    const action = jest.fn();
    renderWithProviders(<DeleteFlow action={action} />);
    fireEvent.press(screen.getByRole('button', { name: 'Delete item' }));
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    act(() => timing.finishAll());
    expect(action).not.toHaveBeenCalled();
    expect(screen.queryByRole('header', { name: 'Delete this item?' })).toBeNull();
  });

  it('returns focus to the destructive button after cancelling', async () => {
    const focusSpy = jest
      .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
      .mockImplementation()
      .mockClear();
    renderWithProviders(<DeleteFlow action={jest.fn()} />, { createNodeMock });
    fireEvent.press(screen.getByRole('button', { name: 'Delete item' }));
    act(() => timing.finishAll());
    focusSpy.mockClear();

    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    act(() => timing.finishAll());

    await waitFor(() =>
      expect(focusSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({ accessibilityLabel: 'Delete item' }),
        }),
        'focus',
      ),
    );
  });
});
