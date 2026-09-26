/**
 * @jest-environment node
 */
import { ESLint } from 'eslint';

// The project's real lint configuration, loaded without ESLint's dynamic import.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('../../eslint.config.js') as ESLint.Options['overrideConfig'];

const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: config });

async function lint(code: string, filePath = 'src/components/Example.tsx'): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((message) => message.message);
}

const TOKEN_MESSAGE = /token/i;

describe('no hardcoded style values in UI code (docs/01 §2)', () => {
  it.each([
    ['a hex color', `const s = { color: '#FF0000' };`],
    ['a short hex color', `const s = { backgroundColor: '#fff' };`],
    ['an rgb() color', `const s = { borderColor: 'rgb(0, 0, 0)' };`],
    ['a named color', `const s = { color: 'white' };`],
    ['a hex color outside a style', `const accent = '#D98A1C';`],
    ['a numeric margin', `const s = { marginTop: 12 };`],
    ['a numeric padding', `const s = { paddingHorizontal: 20 };`],
    ['a numeric gap', `const s = { gap: 8 };`],
    ['a numeric radius', `const s = { borderRadius: 20 };`],
    ['a numeric border width', `const s = { borderWidth: 2 };`],
    ['a numeric side border width', `const s = { borderBottomWidth: 1 };`],
    ['a numeric font size', `const s = { fontSize: 16 };`],
    ['a numeric line height', `const s = { lineHeight: 24 };`],
    ['a string font weight', `const s = { fontWeight: '600' };`],
    ['a numeric opacity', `const s = { opacity: 0.5 };`],
    ['a numeric z-index', `const s = { zIndex: 10 };`],
    ['a numeric shadow radius', `const s = { shadowRadius: 4 };`],
    ['a numeric duration', `Animated.timing(v, { toValue: 1, duration: 300 });`],
  ])('rejects %s', async (_case, code) => {
    const messages = await lint(code);
    expect(messages.some((message) => TOKEN_MESSAGE.test(message))).toBe(true);
  });

  it('accepts values taken from the theme', async () => {
    const code = `
      export function useStyles(theme: { colors: { text: { primary: string } }; space: Record<number, number>; radius: { lg: number }; motion: { base: number } }) {
        return {
          container: { flex: 1, padding: theme.space[4], borderRadius: theme.radius.lg },
          label: { color: theme.colors.text.primary },
          duration: theme.motion.base,
        };
      }
    `;
    expect((await lint(code)).filter((message) => TOKEN_MESSAGE.test(message))).toEqual([]);
  });

  it('allows raw values inside the theme definition itself', async () => {
    const code = `export const palette = { amber: '#D98A1C' }; export const space = { 4: 16 };`;
    expect(await lint(code, 'src/theme/palette.ts')).toEqual([]);
  });
});
