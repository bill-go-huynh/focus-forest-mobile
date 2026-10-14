import type { ReactTestRendererJSON } from 'react-test-renderer';

/**
 * M7.3 The docs/11 checklist, as far as a rendered tree can show it: every control has a role
 * and a name a screen reader reads, every text field a label, and the screen a heading. Size,
 * contrast, 200% text, and reduced motion are checked by the components' and screens' own tests
 * (tokens, `MIN_TOUCH_TARGET`, `fontScale` cases, the reduced-motion provider).
 */

type Node = ReactTestRendererJSON;
type Props = Record<string, unknown>;

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'switch',
  'checkbox',
  'radio',
  'tab',
  'adjustable',
  'menuitem',
  'togglebutton',
  'imagebutton',
  'combobox',
  'search',
  'spinbutton',
]);

const roleOf = (props: Props) =>
  (props['accessibilityRole'] ?? props['role']) as string | undefined;
const labelOf = (props: Props) =>
  (props['accessibilityLabel'] ?? props['aria-label']) as string | undefined;

/** The text a screen reader would read inside a node (without its own label). */
function textOf(node: Node | string): string {
  if (typeof node === 'string') return node;
  return (node.children ?? [])
    .map((child) => textOf(child as Node | string))
    .join('')
    .trim();
}

const hidden = (props: Props) =>
  props['accessibilityElementsHidden'] === true ||
  props['importantForAccessibility'] === 'no-hide-descendants' ||
  props['aria-hidden'] === true;

/** Every problem in a rendered tree, each naming what it found. */
export function accessibilityProblems(tree: Node | Node[] | null): string[] {
  const problems: string[] = [];
  let headers = 0;
  const visit = (node: Node | string) => {
    if (typeof node === 'string') return;
    const props = node.props as Props;
    if (hidden(props)) return;
    const role = roleOf(props);
    if (role === 'header' || role === 'heading') headers += 1;
    const pressable = typeof props['onClick'] === 'function' || props['onPress'] !== undefined;
    if (pressable && props['accessible'] !== false) {
      const name = labelOf(props) ?? textOf(node);
      if (!role) problems.push(`A control without a role: "${name || node.type}"`);
      if (!name) problems.push(`A ${role ?? 'control'} without a name`);
    } else if (role && INTERACTIVE_ROLES.has(role) && !(labelOf(props) ?? textOf(node))) {
      problems.push(`A ${role} without a name`);
    }
    if (node.type === 'TextInput' && !labelOf(props)) {
      problems.push(
        `A text field without a label (placeholder "${String(props['placeholder'] ?? '')}")`,
      );
    }
    for (const child of node.children ?? []) visit(child as Node | string);
  };
  for (const root of Array.isArray(tree) ? tree : tree ? [tree] : []) visit(root);
  if (headers === 0) problems.push('No heading on the screen');
  return problems;
}
