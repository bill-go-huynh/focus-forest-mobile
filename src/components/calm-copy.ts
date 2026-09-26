/**
 * Guards for state copy (docs/02_UX_PRINCIPLES.md: no shame; docs/01 §9: plain language,
 * no blame, never tree-death or wilting). They catch the obvious cases in development;
 * they do not replace reading the copy. English only until localization arrives.
 */

const SHAMING =
  /\b(fail(s|ed|ure|ing)?|dead|died|dies|dying|wilt(s|ed|ing)?|wither(s|ed|ing)?|your fault|you didn'?t)\b/i;

export function assertCalmCopy(text: string, component: string): void {
  if (SHAMING.test(text)) {
    throw new Error(
      `${component} copy must stay calm: no failure, blame, or dying-tree language ("${text}").`,
    );
  }
}

/** Empty states say one sentence (docs/01 §9). */
export function assertOneSentence(text: string, component: string): void {
  if (/[.!?]+\s+\S/.test(text.trim())) {
    throw new Error(`${component} message must be one sentence ("${text}").`);
  }
}
