/** Round rules shared by the daily gauntlet and practice mode. */

/** Seconds to lock in an answer. Time spent waiting on Scryfall is given back. */
export const ROUND_SECONDS = 45;

/** Wrong answers allowed per round. The last one ends the round at 0 points. */
export const MAX_ATTEMPTS = 3;

/** Extra points for answering instantly, scaled by the time left on the clock. */
export const MAX_SPEED_BONUS = 100;

export function speedBonus(msRemaining: number): number {
  const ratio = Math.min(1, Math.max(0, msRemaining / (ROUND_SECONDS * 1000)));
  return Math.round(MAX_SPEED_BONUS * ratio);
}
