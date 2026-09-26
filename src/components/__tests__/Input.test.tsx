import { act, fireEvent, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { AccessibilityInfo, StyleSheet, TextInput } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import { MIN_TOUCH_TARGET } from '../../accessibility';
import { renderWithProviders } from '../../test-utils/render';
import { darkTheme, lightTheme, type Theme } from '../../theme';
import { Input, type InputHandle } from '../Input';

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
const field = (name: string) => screen.getByLabelText(name);

let announceSpy: jest.SpyInstance;
beforeEach(() => {
  mockColorScheme.mockReturnValue('light');
  // The React Native jest preset already mocks this; clear calls from earlier tests.
  announceSpy = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation()
    .mockClear();
});
afterEach(() => jest.restoreAllMocks());

describe('Input (docs/01 §8 → Inputs)', () => {
  describe('label', () => {
    it('shows the label above the field', () => {
      renderWithProviders(<Input label="Email" value="" onChangeText={jest.fn()} />);
      expect(screen.getByText('Email')).toBeOnTheScreen();
    });

    it('names the field with its label, and links the field to the visible label', () => {
      renderWithProviders(<Input label="Email" value="" onChangeText={jest.fn()} />);
      const input = field('Email');
      const label = screen.getByText('Email');

      expect(input.props.accessibilityLabel).toBe('Email');
      expect(label.props.nativeID).toBeTruthy();
      expect(input.props.accessibilityLabelledBy).toBe(label.props.nativeID);
    });

    it('gives each field its own label id', () => {
      renderWithProviders(
        <>
          <Input label="Email" value="" onChangeText={jest.fn()} />
          <Input label="Password" value="" onChangeText={jest.fn()} />
        </>,
      );
      expect(field('Email').props.accessibilityLabelledBy).not.toBe(
        field('Password').props.accessibilityLabelledBy,
      );
    });

    it('focuses the field when the label is tapped', () => {
      const focus = jest.spyOn(TextInput.prototype, 'focus').mockClear();
      renderWithProviders(<Input label="Email" value="" onChangeText={jest.fn()} />);
      fireEvent.press(screen.getByText('Email'));
      expect(focus).toHaveBeenCalledTimes(1);
    });

    it('refuses an empty label, because the label is the accessible name', () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(() =>
        renderWithProviders(<Input label=" " value="" onChangeText={jest.fn()} />),
      ).toThrow(/label/);
    });
  });

  describe('value and events', () => {
    it('shows the value and reports typing', () => {
      const onChangeText = jest.fn();
      renderWithProviders(<Input label="Name" value="Mai" onChangeText={onChangeText} />);
      expect(field('Name').props.value).toBe('Mai');
      fireEvent.changeText(field('Name'), 'Mai Anh');
      expect(onChangeText).toHaveBeenCalledWith('Mai Anh');
    });

    it('reports blur and submit, as forms need for validation and moving to the next field', () => {
      const onBlur = jest.fn();
      const onSubmitEditing = jest.fn();
      renderWithProviders(
        <Input
          label="Name"
          value=""
          onChangeText={jest.fn()}
          onBlur={onBlur}
          onSubmitEditing={onSubmitEditing}
        />,
      );
      fireEvent(field('Name'), 'blur');
      fireEvent(field('Name'), 'submitEditing');
      expect(onBlur).toHaveBeenCalledTimes(1);
      expect(onSubmitEditing).toHaveBeenCalledTimes(1);
    });

    it('passes the keyboard and autofill settings that sign-in and profile forms need', () => {
      renderWithProviders(
        <Input
          label="Password"
          value=""
          onChangeText={jest.fn()}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          autoCapitalize="none"
          returnKeyType="done"
          maxLength={64}
        />,
      );
      expect(field('Password').props).toMatchObject({
        secureTextEntry: true,
        autoComplete: 'current-password',
        textContentType: 'password',
        autoCapitalize: 'none',
        returnKeyType: 'done',
        maxLength: 64,
      });
    });

    it('exposes focus() and blur() through its ref, for moving between fields', () => {
      const focus = jest.spyOn(TextInput.prototype, 'focus').mockClear();
      const blur = jest.spyOn(TextInput.prototype, 'blur').mockClear();
      const ref = createRef<InputHandle>();
      renderWithProviders(<Input ref={ref} label="Name" value="" onChangeText={jest.fn()} />);
      act(() => ref.current?.focus());
      act(() => ref.current?.blur());
      expect(focus).toHaveBeenCalledTimes(1);
      expect(blur).toHaveBeenCalledTimes(1);
    });
  });

  describe('helper and error text', () => {
    it('shows helper text below the field and offers it to screen readers', () => {
      renderWithProviders(
        <Input
          label="Display name"
          value=""
          onChangeText={jest.fn()}
          helper="This is how friends will see you."
        />,
      );
      expect(screen.getByText('This is how friends will see you.')).toBeOnTheScreen();
      expect(field('Display name').props.accessibilityHint).toBe(
        'This is how friends will see you.',
      );
    });

    it('shows the error in place of the helper', () => {
      renderWithProviders(
        <Input
          label="Display name"
          value=""
          onChangeText={jest.fn()}
          helper="This is how friends will see you."
          error="Please add a name."
        />,
      );
      expect(screen.getByText('Please add a name.')).toBeOnTheScreen();
      expect(screen.queryByText('This is how friends will see you.')).toBeNull();
    });

    it('lets screen readers read the error on the field itself and as its own text', () => {
      renderWithProviders(
        <Input label="Email" value="" onChangeText={jest.fn()} error="Please check the email." />,
      );
      expect(field('Email').props.accessibilityHint).toBe('Please check the email.');
      const error = screen.getByText('Please check the email.');
      expect(error.props.accessibilityLiveRegion).toBe('polite');
    });

    it('announces an error when it appears, with the field name for context', () => {
      const { rerender } = renderWithProviders(
        <Input label="Email" value="" onChangeText={jest.fn()} />,
      );
      expect(announceSpy).not.toHaveBeenCalled();

      rerender(
        <Input label="Email" value="" onChangeText={jest.fn()} error="Please check the email." />,
      );
      expect(announceSpy).toHaveBeenCalledWith('Email: Please check the email.');
    });

    it('does not announce the same error again on every render', () => {
      const { rerender } = renderWithProviders(
        <Input label="Email" value="a" onChangeText={jest.fn()} error="Please check the email." />,
      );
      rerender(
        <Input label="Email" value="ab" onChangeText={jest.fn()} error="Please check the email." />,
      );
      expect(announceSpy).toHaveBeenCalledTimes(1);
    });

    it.each(themes)(
      'uses danger for the error and text.secondary for the helper in the %s theme',
      (scheme, theme) => {
        mockColorScheme.mockReturnValue(scheme);
        const { rerender } = renderWithProviders(
          <Input label="Name" value="" onChangeText={jest.fn()} helper="Up to 40 characters." />,
        );
        expect(styleOf(screen.getByText('Up to 40 characters.')).color).toBe(
          theme.colors.text.secondary,
        );
        rerender(
          <Input label="Name" value="" onChangeText={jest.fn()} error="Please add a name." />,
        );
        expect(styleOf(screen.getByText('Please add a name.')).color).toBe(theme.colors.danger);
      },
    );
  });

  describe.each(themes)('field style in the %s theme', (scheme, theme) => {
    beforeEach(() => mockColorScheme.mockReturnValue(scheme));

    it('uses the sunken fill, radius.md, and a visible outline', () => {
      renderWithProviders(<Input label="Name" value="" onChangeText={jest.fn()} />);
      expect(styleOf(field('Name'))).toMatchObject({
        backgroundColor: theme.colors.surface.sunken,
        borderRadius: theme.radius.md,
        borderColor: theme.colors.border.default,
        borderWidth: theme.control.borderWidth,
        color: theme.colors.text.primary,
        fontSize: theme.type.body.fontSize,
      });
    });

    it('shows the focus color while focused', () => {
      renderWithProviders(<Input label="Name" value="" onChangeText={jest.fn()} />);
      fireEvent(field('Name'), 'focus');
      expect(styleOf(field('Name')).borderColor).toBe(theme.colors.border.focus);
      fireEvent(field('Name'), 'blur');
      expect(styleOf(field('Name')).borderColor).toBe(theme.colors.border.default);
    });

    it('outlines the field in danger when there is an error, even while focused', () => {
      renderWithProviders(
        <Input label="Name" value="" onChangeText={jest.fn()} error="Please add a name." />,
      );
      expect(styleOf(field('Name')).borderColor).toBe(theme.colors.danger);
      fireEvent(field('Name'), 'focus');
      expect(styleOf(field('Name')).borderColor).toBe(theme.colors.danger);
    });

    it('uses a muted placeholder that meets contrast', () => {
      renderWithProviders(
        <Input label="Name" value="" onChangeText={jest.fn()} placeholder="Your name" />,
      );
      expect(field('Name').props.placeholderTextColor).toBe(theme.colors.text.muted);
    });

    it('uses label and caption type tokens around the field', () => {
      renderWithProviders(
        <Input label="Name" value="" onChangeText={jest.fn()} helper="Up to 40 characters." />,
      );
      expect(styleOf(screen.getByText('Name'))).toMatchObject({
        ...theme.type.label,
        color: theme.colors.text.primary,
      });
      expect(styleOf(screen.getByText('Up to 40 characters.'))).toMatchObject({
        fontSize: theme.type.caption.fontSize,
      });
    });
  });

  describe('when disabled', () => {
    it('cannot be edited and says it is disabled', () => {
      renderWithProviders(<Input label="Email" value="a@b.co" onChangeText={jest.fn()} disabled />);
      const input = field('Email');
      expect(input.props.editable).toBe(false);
      expect(input.props.accessibilityState).toMatchObject({ disabled: true });
      expect(styleOf(input).opacity).toBe(lightTheme.opacity.disabled);
    });
  });

  describe('large text (docs/11: usable at 200%, no truncation)', () => {
    it('grows with its text instead of using a fixed height', () => {
      renderWithProviders(<Input label="Name" value="" onChangeText={jest.fn()} />);
      const style = styleOf(field('Name'));
      expect(style.height).toBeUndefined();
      expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      expect(style.minHeight).toBe(lightTheme.control.minHeight);
      expect(field('Name').props.allowFontScaling).not.toBe(false);
    });

    it('never truncates the label, helper, or error', () => {
      const { rerender } = renderWithProviders(
        <Input
          label="What would you like friends to call you?"
          value=""
          onChangeText={jest.fn()}
          helper="You can change this later in your profile settings."
        />,
      );
      for (const text of [
        'What would you like friends to call you?',
        'You can change this later in your profile settings.',
      ]) {
        expect(screen.getByText(text).props.numberOfLines).toBeUndefined();
        expect(screen.getByText(text).props.allowFontScaling).not.toBe(false);
      }
      rerender(
        <Input
          label="Name"
          value=""
          onChangeText={jest.fn()}
          error="That name is already used by another topic."
        />,
      );
      expect(
        screen.getByText('That name is already used by another topic.').props.numberOfLines,
      ).toBeUndefined();
    });
  });

  describe('multiline (for a bio)', () => {
    it('is multiline, starts text at the top, and is taller than a single line', () => {
      renderWithProviders(<Input label="Bio" value="" onChangeText={jest.fn()} multiline />);
      const input = field('Bio');
      expect(input.props.multiline).toBe(true);
      expect(styleOf(input).textAlignVertical).toBe('top');
      expect(styleOf(input).minHeight).toBeGreaterThan(lightTheme.control.minHeight);
      expect(styleOf(input).height).toBeUndefined();
    });
  });

  it('announces nothing when there is no error to report', () => {
    renderWithProviders(<Input label="Name" value="" onChangeText={jest.fn()} error="  " />);
    expect(announceSpy).not.toHaveBeenCalled();
    expect(field('Name').props.accessibilityHint).toBeUndefined();
  });
});
