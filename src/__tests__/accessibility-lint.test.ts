/**
 * @jest-environment node
 */
import { ESLint } from 'eslint';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('../../eslint.config.js') as ESLint.Options['overrideConfig'];
const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: config });

async function lint(code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: 'src/components/Example.tsx' });
  return (result?.messages ?? []).map((message) => message.message);
}

const SCALING = /font scaling/i;

describe('text scaling cannot be switched off (docs/11: layouts survive 200%)', () => {
  it.each([
    ['allowFontScaling={false}', `const a = <Text allowFontScaling={false}>Hi</Text>;`],
    ['allowFontScaling: false in props', `const props = { allowFontScaling: false };`],
    ['a font size cap below 200%', `const a = <Text maxFontSizeMultiplier={1.5}>Hi</Text>;`],
    ['a font size cap of 1', `const a = <TextInput maxFontSizeMultiplier={1} />;`],
  ])('rejects %s', async (_case, code) => {
    expect((await lint(code)).some((message) => SCALING.test(message))).toBe(true);
  });

  it.each([
    ['default scaling', `const a = <Text>Hi</Text>;`],
    ['allowFontScaling', `const a = <Text allowFontScaling>Hi</Text>;`],
    ['a cap at 200% or more', `const a = <Text maxFontSizeMultiplier={2}>Hi</Text>;`],
  ])('allows %s', async (_case, code) => {
    expect((await lint(code)).filter((message) => SCALING.test(message))).toEqual([]);
  });
});
