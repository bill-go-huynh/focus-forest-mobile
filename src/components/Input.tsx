import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { announce } from '../accessibility';
import { useTheme } from '../theme';
import { requireText } from './PressableSurface';

/**
 * Text input primitive (docs/01_DESIGN_SYSTEM.md §8 → Inputs): label above the field,
 * helper or error text below. Shaped for form libraries: value, onChangeText, onBlur,
 * and a ref with focus() and blur().
 */

export interface InputHandle {
  focus: () => void;
  blur: () => void;
}

/** TextInput settings a form may pass through unchanged. */
type PassThroughProps = Pick<
  TextInputProps,
  | 'onFocus'
  | 'onBlur'
  | 'onSubmitEditing'
  | 'placeholder'
  | 'keyboardType'
  | 'inputMode'
  | 'autoComplete'
  | 'textContentType'
  | 'autoCapitalize'
  | 'autoCorrect'
  | 'secureTextEntry'
  | 'returnKeyType'
  | 'submitBehavior'
  | 'maxLength'
>;

export interface InputProps extends PassThroughProps {
  /** Shown above the field, and the field's accessible name. */
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** Shown below the field when there is no error. */
  helper?: string;
  /** Plain, kind language (docs/01 §8). Replaces the helper and is announced when it appears. */
  error?: string;
  disabled?: boolean;
  /** A taller field for longer text, such as a bio. */
  multiline?: boolean;
  testID?: string;
  ref?: Ref<InputHandle>;
}

export function Input({
  label,
  value,
  onChangeText,
  helper,
  error,
  disabled = false,
  multiline = false,
  onFocus,
  onBlur,
  testID,
  ref,
  ...rest
}: InputProps) {
  const theme = useTheme();
  const { colors, space, type } = theme;
  requireText(label, 'label', 'Input');

  const labelId = `input-label-${useId()}`;
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
  }));

  const hasError = Boolean(error?.trim());
  const note = hasError ? error : helper?.trim() ? helper : undefined;

  // Screen readers hear a new error once when it appears, with the field name for context.
  useEffect(() => {
    if (hasError && error) announce(`${label}: ${error}`);
  }, [hasError, error, label]);

  const borderColor = hasError
    ? colors.danger
    : focused
      ? colors.border.focus
      : colors.border.default;

  // No numberOfLines on any text: at large sizes it wraps instead of truncating.
  return (
    <View style={{ gap: space[2] }}>
      <Text
        nativeID={labelId}
        onPress={() => inputRef.current?.focus()}
        style={[type.label, { color: colors.text.primary }]}
      >
        {label}
      </Text>
      <TextInput
        ref={inputRef}
        accessibilityLabel={label}
        accessibilityLabelledBy={labelId}
        accessibilityHint={note}
        accessibilityState={{ disabled }}
        editable={!disabled}
        value={value}
        onChangeText={onChangeText}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        multiline={multiline}
        placeholderTextColor={colors.text.muted}
        testID={testID}
        style={[
          {
            fontSize: type.body.fontSize,
            fontWeight: type.body.fontWeight,
            color: colors.text.primary,
            backgroundColor: colors.surface.sunken,
            borderRadius: theme.radius.md,
            borderWidth: theme.control.borderWidth,
            borderColor,
            paddingHorizontal: space[4],
            paddingVertical: space[3],
            // A minimum, never a fixed height: the field grows with large text.
            minHeight: multiline ? theme.control.minHeight * 2 : theme.control.minHeight,
          },
          multiline && { textAlignVertical: 'top' },
          disabled && { opacity: theme.opacity.disabled },
        ]}
        {...rest}
      />
      {note ? (
        <Text
          // Android reads a changed error aloud; iOS gets the announcement above.
          accessibilityLiveRegion={hasError ? 'polite' : 'none'}
          style={[type.caption, { color: hasError ? colors.danger : colors.text.secondary }]}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}
