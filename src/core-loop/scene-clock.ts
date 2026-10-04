/**
 * The device clock the tree scene's lighting reads (presentation only, never sent to the
 * server). Route tests move it instead of `Date.now`, which animations keep time with.
 */
export const sceneClock = { now: (): number => Date.now() };
