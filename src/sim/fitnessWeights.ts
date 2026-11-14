/**
 * 1.2.50 (Robert): the weights of the fitness terms, in one place for
 * modders. A term's weight is what one unit of it is worth, in dollars.
 * Stage 1 only reports the terms; stage 2 logs the protection scores beside
 * the old values (shadow mode) without changing any decision.
 */
export const FITNESS_WEIGHTS = {
  /** Each dollar of weekly protection claimed (owed to us). */
  claimed: 1,
  /** Each dollar of protection collected. */
  collected: 1,
  /** Each dollar of protection left uncollected (a loss). */
  uncollected: -1,
  /** Each point of shopkeeper fear (proposed): a shop not collected last week loses FEAR_LOST_UNCOLLECTED of it. */
  fearPoint: 10,
  /** Weeks a new racket is expected to keep paying (proposed). */
  extortWeeks: 12,
} as const;

/** Fear a shop's owner loses for each week its protection goes uncollected (weeklyProtectionFear). */
export const FEAR_LOST_UNCOLLECTED = 5;
