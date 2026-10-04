/**
 * Counts the sessions the server has confirmed in this process. It moves before a confirmed
 * session becomes visible to any screen (when its answer is about to be kept), and every Home
 * request notes the count when it begins. A Home asked at or after a session's count was
 * asked after the server had that session; one asked before may not include it, even if it
 * answers later. Only ever compared within this process.
 */
let confirmed = 0;

export const serverConfirmations = {
  current: (): number => confirmed,
  /** A session the server confirmed is about to be kept and shown. */
  advance: (): number => ++confirmed,
};
