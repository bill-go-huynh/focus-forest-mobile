import type { ReactTestRendererJSON } from 'react-test-renderer';

/**
 * FR.8 The docs/02 "Words we use / avoid" table, applied to everything a screen shows (its text
 * and the labels a screen reader reads). `assertCalmCopy` guards single components as they are
 * written; this checks whole rendered screens against the full table.
 */

const AVOIDED: [RegExp, string][] = [
  [/\bfail(s|ed|ure|ing)?\b/i, 'fail'],
  [/\b(lose|loses|losing|lost to)\b/i, 'lose'],
  [/\bkill(s|ed|ing)?\b/i, 'kill'],
  [/\b(die|dies|died|dead|dying)\b/i, 'die'],
  [/\bwilt(s|ed|ing)?\b/i, 'wilt'],
  [/\bbroken\b/i, 'broken'],
  [/\bbad month\b/i, 'bad month'],
  [/\binactive\b/i, 'inactive'],
  [/\blazy\b/i, 'lazy'],
  [/\bskipped\b/i, 'skipped'],
  [/\byou missed\b/i, 'you missed'],
  [/\babandon(ed)?\b/i, 'abandoned'],
  [/\bbeat\b/i, 'beat'],
  [/\bcrushed\b/i, 'crushed'],
];

export function avoidedWordProblems(text: string): string[] {
  return AVOIDED.filter(([pattern]) => pattern.test(text)).map(
    ([, word]) => `"${text}" uses "${word}" (docs/02 Words we avoid)`,
  );
}

type Node = ReactTestRendererJSON;
type Props = Record<string, unknown>;

const hidden = (props: Props) =>
  props['accessibilityElementsHidden'] === true ||
  props['importantForAccessibility'] === 'no-hide-descendants' ||
  props['aria-hidden'] === true;

/** Every text and accessibility label a rendered tree shows, hidden subtrees left out. */
export function renderedCopy(tree: Node | Node[] | null): string[] {
  const out: string[] = [];
  const walk = (node: Node | string) => {
    if (typeof node === 'string') {
      if (node.trim()) out.push(node.trim());
      return;
    }
    const props = (node.props ?? {}) as Props;
    if (hidden(props)) return;
    for (const key of ['accessibilityLabel', 'aria-label', 'accessibilityHint']) {
      const value = props[key];
      if (typeof value === 'string' && value.trim()) out.push(value.trim());
    }
    for (const child of node.children ?? []) walk(child as Node | string);
  };
  for (const node of Array.isArray(tree) ? tree : tree ? [tree] : []) walk(node);
  return out;
}
