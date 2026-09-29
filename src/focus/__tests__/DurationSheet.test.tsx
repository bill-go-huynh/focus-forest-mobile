import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from '@testing-library/react-native';

import { mockControlledTiming } from '../../test-utils/animation';
import { renderWithProviders } from '../../test-utils/render';
import { DurationSheet, type DurationSheetProps } from '../DurationSheet';

const mockWindow = { width: 390, height: 844, scale: 3, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

const PRESET_LABELS = ['15 min', '25 min', '45 min', '50 min', '60 min'];

beforeEach(() => {
  mockWindow.fontScale = 1;
  mockControlledTiming();
});
afterEach(() => jest.restoreAllMocks());

function open(props: Partial<DurationSheetProps> = {}) {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  const all: DurationSheetProps = {
    visible: true,
    initialMinutes: 15,
    confirmLabel: 'Continue',
    onConfirm,
    onCancel,
    ...props,
  };
  const view = renderWithProviders(<DurationSheet {...all} />);
  return { ...view, onConfirm, onCancel, props: all };
}

const option = (name: string) => screen.getByRole('button', { name });
const selected = (name: string) => option(name).props.accessibilityState?.selected;
const selectedOptions = () =>
  [...PRESET_LABELS, 'Custom'].filter((name) => selected(name) === true);
const confirm = () => fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
const minutesField = () => screen.getByLabelText('Minutes');

describe('DurationSheet: presets', () => {
  it('offers exactly the five presets, in order, each named with its minutes, and Custom', () => {
    open();
    const names = screen
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel as string)
      .filter((name) => / min$|^Custom$/.test(name));
    expect(names).toEqual([...PRESET_LABELS, 'Custom']);
  });

  it('selects 15 for a first session', () => {
    open({ initialMinutes: 15 });
    expect(selectedOptions()).toEqual(['15 min']);
    expect(selected('25 min')).toBe(false);
  });

  it('selects a remembered preset', () => {
    open({ initialMinutes: 25 });
    expect(selectedOptions()).toEqual(['25 min']);
  });

  it('moves the selection when another preset is pressed, and confirms that one', () => {
    const { onConfirm } = open();
    fireEvent.press(option('45 min'));
    expect(selectedOptions()).toEqual(['45 min']);
    confirm();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(45);
  });

  it('confirms the initial selection unchanged', () => {
    const { onConfirm } = open({ initialMinutes: 60 });
    confirm();
    expect(onConfirm).toHaveBeenCalledWith(60);
  });
});

describe('DurationSheet: custom', () => {
  it('opens a remembered custom duration in Custom, with its value', () => {
    open({ initialMinutes: 35 });
    expect(selectedOptions()).toEqual(['Custom']);
    expect(minutesField().props.value).toBe('35');
  });

  it('is one tap away, with a number keyboard, starting from the current selection', () => {
    open({ initialMinutes: 25 });
    expect(screen.queryByLabelText('Minutes')).toBeNull();

    fireEvent.press(option('Custom'));

    expect(selectedOptions()).toEqual(['Custom']);
    expect(minutesField().props.keyboardType).toBe('number-pad');
    expect(minutesField().props.value).toBe('25');
  });

  it.each([
    ['35', 35],
    ['5', 5],
    ['180', 180],
  ])('confirms %p minutes', (text, minutes) => {
    const { onConfirm } = open();
    fireEvent.press(option('Custom'));
    fireEvent.changeText(minutesField(), text);
    confirm();
    expect(onConfirm).toHaveBeenCalledWith(minutes);
  });

  it.each([
    ['4', 'Choose a duration from 5 to 180 minutes.'],
    ['181', 'Choose a duration from 5 to 180 minutes.'],
    ['7', 'Use 5-minute steps, like 35 or 40.'],
    ['', 'Enter the minutes, like 35.'],
  ])('does not confirm %p, and says why calmly', (text, message) => {
    const { onConfirm } = open();
    fireEvent.press(option('Custom'));
    fireEvent.changeText(minutesField(), text);
    confirm();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(minutesField().props.value).toBe(text);
  });

  it('clears the message once the minutes change', () => {
    open();
    fireEvent.press(option('Custom'));
    fireEvent.changeText(minutesField(), '7');
    confirm();
    fireEvent.changeText(minutesField(), '70');
    expect(screen.queryByText('Use 5-minute steps, like 35 or 40.')).toBeNull();
  });

  it('confirms a preset chosen after typing custom minutes, ignoring the unconfirmed text', () => {
    const { onConfirm } = open();
    fireEvent.press(option('Custom'));
    fireEvent.changeText(minutesField(), '7');
    fireEvent.press(option('25 min'));

    expect(selectedOptions()).toEqual(['25 min']);
    expect(screen.queryByLabelText('Minutes')).toBeNull();
    confirm();
    expect(onConfirm).toHaveBeenCalledWith(25);
  });
});

describe('DurationSheet: cancel and reopen', () => {
  it('closes without confirming, and changes nothing on the device', () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    const { onConfirm, onCancel } = open();
    fireEvent.press(option('45 min'));

    fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('starts again from its initial minutes each time it opens', () => {
    const { rerender, props } = open({ initialMinutes: 25 });
    fireEvent.press(option('45 min'));

    rerender(<DurationSheet {...props} visible={false} />);
    rerender(<DurationSheet {...props} visible />);

    expect(selectedOptions()).toEqual(['25 min']);
  });
});

describe('DurationSheet: large text', () => {
  it('keeps every option, the minutes field, and both actions at 200%', () => {
    mockWindow.fontScale = 2;
    open({ initialMinutes: 35 });
    for (const name of [...PRESET_LABELS, 'Custom', 'Continue', 'Close']) {
      expect(option(name)).toBeOnTheScreen();
    }
    expect(minutesField()).toBeOnTheScreen();
    for (const label of PRESET_LABELS) {
      expect(screen.getByText(label).props.numberOfLines).toBeUndefined();
    }
  });
});

describe('DurationSheet: the session minimum', () => {
  it('shows presets below it as unavailable, and they cannot be chosen', () => {
    const { onConfirm } = open({ initialMinutes: 25, minimumMinutes: 20 });
    expect(option('15 min').props.accessibilityState).toMatchObject({ disabled: true });
    for (const name of ['25 min', '45 min', '50 min', '60 min', 'Custom']) {
      expect(option(name).props.accessibilityState).toMatchObject({ disabled: false });
    }

    fireEvent.press(option('15 min'));
    expect(selectedOptions()).toEqual(['25 min']);
    confirm();
    expect(onConfirm).toHaveBeenCalledWith(25);
  });

  it('never opens on a duration below it', () => {
    open({ initialMinutes: 15, minimumMinutes: 20 });
    expect(selectedOptions()).toEqual(['25 min']);
  });

  it('refuses custom minutes below it, naming the real range', () => {
    const { onConfirm } = open({ initialMinutes: 25, minimumMinutes: 20 });
    fireEvent.press(option('Custom'));
    fireEvent.changeText(minutesField(), '15');
    confirm();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a duration from 20 to 180 minutes.')).toBeOnTheScreen();
  });

  it('takes 10 as the shortest custom duration when the minimum is 7', () => {
    const { onConfirm } = open({ initialMinutes: 15, minimumMinutes: 7 });
    fireEvent.press(option('Custom'));
    fireEvent.changeText(minutesField(), '5');
    confirm();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.changeText(minutesField(), '10');
    confirm();
    expect(onConfirm).toHaveBeenCalledWith(10);
  });
});
