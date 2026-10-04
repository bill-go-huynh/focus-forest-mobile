// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

// docs/01_DESIGN_SYSTEM.md §2: every color, spacing value, radius, shadow, font size, font
// weight, line height, opacity, z-layer, and duration in UI code comes from a named token.
const TOKEN_MESSAGE =
  'Use a design token from the theme (src/theme) instead of a hardcoded value (docs/01_DESIGN_SYSTEM.md §2).';

const COLOR_PROPS =
  '^(color|backgroundColor|borderColor|border(Top|Right|Bottom|Left|Start|End)Color|shadowColor|tintColor|textShadowColor|textDecorationColor|overlayColor|placeholderTextColor)$';
const SIZE_PROPS = [
  '^(margin|padding)(Top|Right|Bottom|Left|Horizontal|Vertical|Start|End)?$',
  '^(gap|rowGap|columnGap)$',
  '^border(Top|Bottom)?(Left|Right|Start|End)?Radius$',
  '^border(Top|Right|Bottom|Left|Start|End)?Width$',
  '^(fontSize|lineHeight|letterSpacing|fontWeight)$',
  '^(opacity|zIndex|elevation|shadowRadius|shadowOpacity)$',
  '^(duration|delay)$',
].join('|');

const noHardcodedStyles = [
  'error',
  {
    selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
    message: TOKEN_MESSAGE,
  },
  { selector: 'Literal[value=/^(rgb|rgba|hsl|hsla)\\(/i]', message: TOKEN_MESSAGE },
  { selector: `Property[key.name=/${COLOR_PROPS}/] > Literal`, message: TOKEN_MESSAGE },
  { selector: `Property[key.name=/${SIZE_PROPS}/] > Literal`, message: TOKEN_MESSAGE },
  {
    selector: `Property[key.name=/${SIZE_PROPS}/] > UnaryExpression > Literal`,
    message: TOKEN_MESSAGE,
  },
];

// docs/11_ACCESSIBILITY.md: all text follows the system size, and layouts survive 200%.
const SCALING_MESSAGE =
  'Keep font scaling on: text must follow the system size up to at least 200% (docs/11_ACCESSIBILITY.md).';
const noDisabledFontScaling = [
  {
    selector:
      'JSXAttribute[name.name="allowFontScaling"] > JSXExpressionContainer > Literal[value=false]',
    message: SCALING_MESSAGE,
  },
  {
    selector: 'Property[key.name="allowFontScaling"] > Literal[value=false]',
    message: SCALING_MESSAGE,
  },
  {
    selector:
      'JSXAttribute[name.name="maxFontSizeMultiplier"] > JSXExpressionContainer > Literal[value<2]',
    message: SCALING_MESSAGE,
  },
  {
    selector: 'Property[key.name="maxFontSizeMultiplier"] > Literal[value<2]',
    message: SCALING_MESSAGE,
  },
];

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['dist/*', '.expo/*', 'coverage/*'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    // The theme defines the raw values; tests assert on them. Tree and scene art use their own
    // palette, not UI tokens (docs/01 §2), kept in one file.
    ignores: [
      'src/theme/**',
      'src/tree/signature/palette.ts',
      '**/__tests__/**',
      '**/*.test.{ts,tsx}',
    ],
    rules: { 'no-restricted-syntax': [...noHardcodedStyles, ...noDisabledFontScaling] },
  },
  {
    // The timer engine is pure (M2.2): no storage, randomness, clock source, or platform API.
    files: [
      'src/timer/timer-engine.ts',
      'src/timer/submission.ts',
      'src/timer/timer-state-schema.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            '@react-native-async-storage/async-storage',
            'expo-crypto',
            'react-native',
            'react',
          ].map((name) => ({
            name,
            message: 'Keep the timer engine pure: callers pass state and `now`.',
          })),
        },
      ],
    },
  },
  {
    // docs/08 §3: tokens live in secure device storage. AsyncStorage is not encrypted.
    files: ['src/api/**/*.{ts,tsx}'],
    // The token-store test imports AsyncStorage to prove it is never called.
    ignores: ['**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@react-native-async-storage/async-storage',
              message:
                'Keep tokens in expo-secure-store (src/api/token-store.ts), never AsyncStorage.',
            },
          ],
        },
      ],
    },
  },
]);
